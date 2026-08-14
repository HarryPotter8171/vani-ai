/**
 * StripeService — thin SDK wrapper for Checkout, Portal, subscriptions, invoices.
 * Keeps Stripe SDK details out of SubscriptionService / BillingService.
 */

import Stripe from "stripe";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import {
  getAppBaseUrl,
  getStripePriceId,
  getStripeSecretKey,
  getStripeWebhookSecret,
  isStripeConfigured,
  resolvePlanFromPriceId,
  type BillingInterval,
} from "./stripeConfig.ts";
import type { PlanId } from "./types.ts";

let stripeClient: Stripe | null = null;

function httpError(message: string, status = 400): Error {
  const err = new Error(message);
  (err as Error & { status?: number }).status = status;
  return err;
}

export class StripeService {
  isEnabled(): boolean {
    return isStripeConfigured();
  }

  getClient(): Stripe {
    const key = getStripeSecretKey();
    if (!key) throw httpError("Billing is temporarily unavailable.", 503);
    if (!stripeClient) {
      stripeClient = new Stripe(key, {
        apiVersion: "2025-08-27.basil",
      });
    }
    return stripeClient;
  }

  /** Construct event from raw body + signature (webhooks). */
  constructEvent(rawBody: Buffer | string, signature: string): Stripe.Event {
    const secret = getStripeWebhookSecret();
    if (!secret) {
      throw httpError("Billing is temporarily unavailable.", 503);
    }
    return this.getClient().webhooks.constructEvent(rawBody, signature, secret);
  }

  async ensureCustomer(opts: {
    userId: string;
    email: string;
    name?: string;
  }): Promise<string> {
    // Ensure local subscription row exists before attaching customer id.
    await Subscription.findOneAndUpdate(
      { user: opts.userId },
      {
        $setOnInsert: {
          user: opts.userId,
          planId: "free",
          status: "active",
          currentPeriodStart: new Date(
            Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)
          ),
          currentPeriodEnd: new Date(
            Date.UTC(
              new Date().getUTCFullYear(),
              new Date().getUTCMonth() + 1,
              1
            )
          ),
        },
      },
      { upsert: true, new: true }
    );

    const sub = await Subscription.findOne({ user: opts.userId });
    // Only reuse Stripe customer ids (cus_…) — never a Razorpay cust_ leftover.
    if (
      sub?.externalCustomerId &&
      String(sub.externalCustomerId).startsWith("cus_") &&
      (sub.paymentProvider === "stripe" ||
        !sub.paymentProvider ||
        sub.paymentProvider === "none")
    ) {
      return String(sub.externalCustomerId);
    }

    const stripe = this.getClient();
    // Reuse existing Stripe customer by metadata.userId when possible.
    const existing = await stripe.customers.list({
      email: opts.email,
      limit: 5,
    });
    let customer =
      existing.data.find((c) => c.metadata?.vaniUserId === opts.userId) ||
      existing.data[0] ||
      null;

    if (!customer) {
      customer = await stripe.customers.create({
        email: opts.email,
        name: opts.name || undefined,
        metadata: { vaniUserId: opts.userId },
      });
    } else if (!customer.metadata?.vaniUserId) {
      await stripe.customers.update(customer.id, {
        metadata: { ...customer.metadata, vaniUserId: opts.userId },
      });
    }

    await Subscription.findOneAndUpdate(
      { user: opts.userId },
      { $set: { externalCustomerId: customer.id, paymentProvider: "stripe" } },
      { upsert: false }
    );

    return customer.id;
  }

  async createCheckoutSession(opts: {
    userId: string;
    email: string;
    name?: string;
    planId: PlanId;
    interval: BillingInterval;
    successUrl?: string;
    cancelUrl?: string;
  }): Promise<{ url: string; sessionId: string }> {
    if (opts.planId === "free") {
      throw httpError("Free plan does not require checkout");
    }
    if (opts.planId === "enterprise") {
      throw httpError("Enterprise plans require a sales conversation", 400);
    }

    const priceId = getStripePriceId(opts.planId, opts.interval);
    if (!priceId) {
      throw httpError(
        `Selected plan is temporarily unavailable.`,
        503
      );
    }

    const customerId = await this.ensureCustomer({
      userId: opts.userId,
      email: opts.email,
      name: opts.name,
    });

    const base = getAppBaseUrl();
    const successUrl =
      opts.successUrl ||
      `${base}/?billing=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = opts.cancelUrl || `${base}/?billing=cancel`;

    const session = await this.getClient().checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: opts.userId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: {
          vaniUserId: opts.userId,
          vaniPlanId: opts.planId,
          vaniInterval: opts.interval,
        },
      },
      metadata: {
        vaniUserId: opts.userId,
        vaniPlanId: opts.planId,
        vaniInterval: opts.interval,
      },
    });

    if (!session.url) throw httpError("Stripe did not return a checkout URL", 502);
    return { url: session.url, sessionId: session.id };
  }

  async createPortalSession(opts: {
    userId: string;
    email: string;
    name?: string;
    returnUrl?: string;
  }): Promise<{ url: string }> {
    const customerId = await this.ensureCustomer({
      userId: opts.userId,
      email: opts.email,
      name: opts.name,
    });
    const base = getAppBaseUrl();
    const session = await this.getClient().billingPortal.sessions.create({
      customer: customerId,
      return_url: opts.returnUrl || `${base}/?billing=portal`,
    });
    return { url: session.url };
  }

  /**
   * Change plan on an existing Stripe subscription (upgrade / downgrade).
   * Uses create_prorations so Stripe invoices the difference.
   */
  async updateSubscriptionPlan(opts: {
    stripeSubscriptionId: string;
    planId: PlanId;
    interval: BillingInterval;
  }): Promise<Stripe.Subscription> {
    const priceId = getStripePriceId(opts.planId, opts.interval);
    if (!priceId) {
      throw httpError(
        `Selected plan is temporarily unavailable.`,
        503
      );
    }

    const stripe = this.getClient();
    const sub = await stripe.subscriptions.retrieve(opts.stripeSubscriptionId);
    const itemId = sub.items.data[0]?.id;
    if (!itemId) throw httpError("Subscription has no items", 400);

    return stripe.subscriptions.update(opts.stripeSubscriptionId, {
      cancel_at_period_end: false,
      proration_behavior: "create_prorations",
      items: [{ id: itemId, price: priceId }],
      metadata: {
        ...sub.metadata,
        vaniPlanId: opts.planId,
        vaniInterval: opts.interval,
      },
    });
  }

  async cancelAtPeriodEnd(stripeSubscriptionId: string): Promise<Stripe.Subscription> {
    return this.getClient().subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
  }

  async resumeSubscription(stripeSubscriptionId: string): Promise<Stripe.Subscription> {
    return this.getClient().subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: false,
    });
  }

  async listCustomerInvoices(
    customerId: string,
    limit = 20
  ): Promise<Stripe.Invoice[]> {
    const result = await this.getClient().invoices.list({
      customer: customerId,
      limit: Math.min(Math.max(limit, 1), 100),
    });
    return result.data;
  }

  extractSubscriptionPrice(
    sub: Stripe.Subscription
  ): { planId: PlanId; interval: BillingInterval; priceId: string } | null {
    const price = sub.items.data[0]?.price;
    const priceId = typeof price === "string" ? price : price?.id;
    const mapped = resolvePlanFromPriceId(priceId || null);
    if (mapped && priceId) {
      return { ...mapped, priceId };
    }
    const metaPlan = sub.metadata?.vaniPlanId as PlanId | undefined;
    const metaInterval = sub.metadata?.vaniInterval as BillingInterval | undefined;
    if (
      metaPlan &&
      metaInterval &&
      ["pro", "business"].includes(metaPlan) &&
      ["month", "year"].includes(metaInterval)
    ) {
      return {
        planId: metaPlan,
        interval: metaInterval,
        priceId: priceId || "",
      };
    }
    return null;
  }

  mapStripeStatus(status: Stripe.Subscription.Status): string {
    switch (status) {
      case "active":
        return "active";
      case "trialing":
        return "trialing";
      case "past_due":
        return "past_due";
      case "canceled":
        return "canceled";
      case "unpaid":
      case "incomplete":
        return "incomplete";
      case "paused":
        return "paused";
      case "incomplete_expired":
        return "canceled";
      default:
        return "active";
    }
  }

  async resolveUserIdFromCustomer(
    customerId: string | null | undefined
  ): Promise<string | null> {
    if (!customerId) return null;
    const bySub = await Subscription.findOne({
      externalCustomerId: customerId,
    }).lean();
    if (bySub?.user) return String(bySub.user);

    try {
      const customer = await this.getClient().customers.retrieve(customerId);
      if (customer && !("deleted" in customer && customer.deleted)) {
        const metaId = customer.metadata?.vaniUserId;
        if (metaId) return metaId;
        if (customer.email) {
          const user = await User.findOne({ email: customer.email }).lean();
          if (user?._id) return String(user._id);
        }
      }
    } catch {
      // ignore lookup failures
    }
    return null;
  }
}

export const stripeService = new StripeService();
