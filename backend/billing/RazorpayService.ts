/**
 * RazorpayService — thin SDK wrapper for customers, subscriptions, invoices.
 * Hosted subscription short_url supports UPI, cards, and netbanking when those
 * methods are enabled on the Razorpay account.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import {
  getAppBaseUrl,
  getRazorpayKeyId,
  getRazorpayKeySecret,
  getRazorpayPlanId,
  getRazorpayTotalCount,
  getRazorpayWebhookSecret,
  isRazorpayConfigured,
  resolvePlanFromRazorpayPlanId,
  type BillingInterval,
} from "./razorpayConfig.ts";
import type { PlanId, SubscriptionStatus } from "./types.ts";

export interface RazorpaySubscriptionLike {
  id: string;
  entity?: string;
  plan_id?: string;
  customer_id?: string | null;
  status?: string;
  current_start?: number | null;
  current_end?: number | null;
  ended_at?: number | null;
  charge_at?: number | null;
  quantity?: number;
  notes?: Record<string, string> | null;
  short_url?: string | null;
  paid_count?: number;
  total_count?: number;
  remaining_count?: number;
  has_scheduled_changes?: boolean;
}

export interface RazorpayInvoiceLike {
  id: string;
  entity?: string;
  type?: string;
  invoice_number?: string | null;
  customer_id?: string | null;
  subscription_id?: string | null;
  payment_id?: string | null;
  status?: string;
  currency?: string;
  amount?: number;
  amount_paid?: number;
  amount_due?: number;
  description?: string | null;
  short_url?: string | null;
  issued_at?: number | null;
  paid_at?: number | null;
  billing_start?: number | null;
  billing_end?: number | null;
  line_items?: Array<{
    name?: string;
    description?: string;
    amount?: number;
    unit_amount?: number;
    quantity?: number;
  }>;
  notes?: Record<string, string> | null;
}

export interface RazorpayPaymentLike {
  id: string;
  entity?: string;
  amount?: number;
  currency?: string;
  status?: string;
  method?: string;
  order_id?: string | null;
  invoice_id?: string | null;
  email?: string | null;
  contact?: string | null;
  created_at?: number;
  notes?: Record<string, string> | null;
}

let razorpayClient: InstanceType<typeof Razorpay> | null = null;

function httpError(message: string, status = 400): Error {
  const err = new Error(message);
  (err as Error & { status?: number }).status = status;
  return err;
}

export class RazorpayService {
  isEnabled(): boolean {
    return isRazorpayConfigured();
  }

  getClient(): InstanceType<typeof Razorpay> {
    const keyId = getRazorpayKeyId();
    const keySecret = getRazorpayKeySecret();
    if (!keyId || !keySecret) {
      throw httpError(
        "Razorpay is not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)",
        503
      );
    }
    if (!razorpayClient) {
      razorpayClient = new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
      });
    }
    return razorpayClient;
  }

  getPublicKeyId(): string | null {
    return getRazorpayKeyId();
  }

  /**
   * Verify Razorpay webhook signature (HMAC SHA256 hex of raw body).
   */
  verifyWebhookSignature(
    rawBody: Buffer | string,
    signature: string
  ): boolean {
    const secret = getRazorpayWebhookSecret();
    if (!secret) {
      throw httpError("RAZORPAY_WEBHOOK_SECRET is not configured", 503);
    }
    const body =
      typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
    const expected = createHmac("sha256", secret).update(body).digest("hex");
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(String(signature || ""), "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  async ensureCustomer(opts: {
    userId: string;
    email: string;
    name?: string;
  }): Promise<string> {
    await Subscription.findOneAndUpdate(
      { user: opts.userId },
      {
        $setOnInsert: {
          user: opts.userId,
          planId: "free",
          status: "active",
          paymentProvider: "none",
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
    if (
      sub?.externalCustomerId &&
      String(sub.externalCustomerId).startsWith("cust_") &&
      (sub.paymentProvider === "razorpay" || !sub.paymentProvider || sub.paymentProvider === "none")
    ) {
      return String(sub.externalCustomerId);
    }

    const rzp = this.getClient();
    // Prefer an existing customer matched by notes.vaniUserId.
    let customerId: string | null = null;
    try {
      const listed = await rzp.customers.all({
        email: opts.email,
        count: 10,
      });
      const items = (listed?.items || []) as Array<{
        id: string;
        notes?: Record<string, string>;
      }>;
      const match =
        items.find((c) => c.notes?.vaniUserId === opts.userId) || items[0];
      if (match?.id) customerId = match.id;
    } catch {
      // list may fail for some accounts — fall through to create
    }

    if (!customerId) {
      const created = (await rzp.customers.create({
        name: opts.name || opts.email.split("@")[0] || "VANI user",
        email: opts.email,
        fail_existing: 0,
        notes: { vaniUserId: opts.userId },
      })) as { id: string };
      customerId = created.id;
    }

    await Subscription.findOneAndUpdate(
      { user: opts.userId },
      {
        $set: {
          externalCustomerId: customerId,
          paymentProvider: "razorpay",
        },
      },
      { upsert: false }
    );

    return customerId;
  }

  /**
   * Create a Razorpay Subscription and return the hosted auth URL
   * (UPI / cards / netbanking available on Checkout).
   */
  async createCheckoutSession(opts: {
    userId: string;
    email: string;
    name?: string;
    planId: PlanId;
    interval: BillingInterval;
    successUrl?: string;
    cancelUrl?: string;
  }): Promise<{
    url: string;
    sessionId: string;
    subscriptionId: string;
    keyId: string | null;
  }> {
    if (opts.planId === "free") {
      throw httpError("Free plan does not require checkout");
    }
    if (opts.planId === "enterprise") {
      throw httpError("Enterprise plans require a sales conversation", 400);
    }

    const planId = getRazorpayPlanId(opts.planId, opts.interval);
    if (!planId) {
      throw httpError(
        `Razorpay plan not configured for ${opts.planId}/${opts.interval}`,
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
      opts.successUrl || `${base}/?billing=success&provider=razorpay`;
    const cancelUrl =
      opts.cancelUrl || `${base}/?billing=cancel&provider=razorpay`;

    const expireBy = Math.floor(Date.now() / 1000) + 48 * 3600;
    const subscription = (await this.getClient().subscriptions.create({
      plan_id: planId,
      customer_id: customerId,
      total_count: getRazorpayTotalCount(opts.interval),
      quantity: 1,
      customer_notify: 1,
      expire_by: expireBy,
      notes: {
        vaniUserId: opts.userId,
        vaniPlanId: opts.planId,
        vaniInterval: opts.interval,
        vaniSuccessUrl: successUrl,
        vaniCancelUrl: cancelUrl,
      },
      notify_info: {
        notify_email: opts.email,
      },
    })) as RazorpaySubscriptionLike;

    const url = subscription.short_url;
    if (!url) {
      throw httpError("Razorpay did not return a subscription checkout URL", 502);
    }

    // Persist pending subscription id so webhooks can resolve the user early.
    await Subscription.findOneAndUpdate(
      { user: opts.userId },
      {
        $set: {
          externalCustomerId: customerId,
          externalSubscriptionId: subscription.id,
          paymentProvider: "razorpay",
          billingInterval: opts.interval,
          status: "incomplete",
        },
      }
    );

    return {
      url,
      sessionId: subscription.id,
      subscriptionId: subscription.id,
      keyId: this.getPublicKeyId(),
    };
  }

  async updateSubscriptionPlan(opts: {
    razorpaySubscriptionId: string;
    planId: PlanId;
    interval: BillingInterval;
  }): Promise<RazorpaySubscriptionLike> {
    const planId = getRazorpayPlanId(opts.planId, opts.interval);
    if (!planId) {
      throw httpError(
        `Razorpay plan not configured for ${opts.planId}/${opts.interval}`,
        503
      );
    }

    const updated = (await this.getClient().subscriptions.update(
      opts.razorpaySubscriptionId,
      {
        plan_id: planId,
        schedule_change_at: "now",
        customer_notify: 1,
        remaining_count: getRazorpayTotalCount(opts.interval),
        notes: {
          vaniPlanId: opts.planId,
          vaniInterval: opts.interval,
        },
      }
    )) as RazorpaySubscriptionLike;

    return updated;
  }

  async cancelAtPeriodEnd(
    razorpaySubscriptionId: string
  ): Promise<RazorpaySubscriptionLike> {
    return (await this.getClient().subscriptions.cancel(
      razorpaySubscriptionId,
      true
    )) as RazorpaySubscriptionLike;
  }

  async cancelImmediately(
    razorpaySubscriptionId: string
  ): Promise<RazorpaySubscriptionLike> {
    return (await this.getClient().subscriptions.cancel(
      razorpaySubscriptionId,
      false
    )) as RazorpaySubscriptionLike;
  }

  async pauseSubscription(
    razorpaySubscriptionId: string
  ): Promise<RazorpaySubscriptionLike> {
    return (await this.getClient().subscriptions.pause(
      razorpaySubscriptionId,
      { pause_at: "now" }
    )) as RazorpaySubscriptionLike;
  }

  async resumeSubscription(
    razorpaySubscriptionId: string
  ): Promise<RazorpaySubscriptionLike> {
    return (await this.getClient().subscriptions.resume(
      razorpaySubscriptionId,
      { resume_at: "now" }
    )) as RazorpaySubscriptionLike;
  }

  async fetchSubscription(
    razorpaySubscriptionId: string
  ): Promise<RazorpaySubscriptionLike> {
    return (await this.getClient().subscriptions.fetch(
      razorpaySubscriptionId
    )) as RazorpaySubscriptionLike;
  }

  async listCustomerInvoices(
    customerId: string,
    limit = 20
  ): Promise<RazorpayInvoiceLike[]> {
    try {
      const result = await this.getClient().invoices.all({
        customer_id: customerId,
        count: Math.min(Math.max(limit, 1), 100),
      });
      return (result?.items || []) as RazorpayInvoiceLike[];
    } catch {
      return [];
    }
  }

  extractSubscriptionPlan(
    sub: RazorpaySubscriptionLike
  ): { planId: PlanId; interval: BillingInterval; razorpayPlanId: string } | null {
    const razorpayPlanId = sub.plan_id || "";
    const mapped = resolvePlanFromRazorpayPlanId(razorpayPlanId || null);
    if (mapped && razorpayPlanId) {
      return { ...mapped, razorpayPlanId };
    }
    const metaPlan = sub.notes?.vaniPlanId as PlanId | undefined;
    const metaInterval = sub.notes?.vaniInterval as BillingInterval | undefined;
    if (
      metaPlan &&
      metaInterval &&
      ["pro", "business"].includes(metaPlan) &&
      ["month", "year"].includes(metaInterval)
    ) {
      return {
        planId: metaPlan,
        interval: metaInterval,
        razorpayPlanId: razorpayPlanId || "",
      };
    }
    return null;
  }

  mapRazorpayStatus(status: string | undefined | null): SubscriptionStatus {
    switch ((status || "").toLowerCase()) {
      case "active":
        return "active";
      case "authenticated":
        return "trialing";
      case "created":
        return "incomplete";
      case "pending":
      case "halted":
        return "past_due";
      case "paused":
        return "paused";
      case "cancelled":
      case "canceled":
      case "completed":
      case "expired":
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
      paymentProvider: "razorpay",
    }).lean();
    if (bySub?.user) return String(bySub.user);

    const any = await Subscription.findOne({
      externalCustomerId: customerId,
    }).lean();
    if (any?.user) return String(any.user);

    try {
      const customer = (await this.getClient().customers.fetch(customerId)) as {
        id: string;
        email?: string;
        notes?: Record<string, string>;
      };
      const metaId = customer.notes?.vaniUserId;
      if (metaId) return metaId;
      if (customer.email) {
        const user = await User.findOne({ email: customer.email }).lean();
        if (user?._id) return String(user._id);
      }
    } catch {
      // ignore lookup failures
    }
    return null;
  }

  async resolveUserIdFromSubscription(
    sub: RazorpaySubscriptionLike
  ): Promise<string | null> {
    if (sub.notes?.vaniUserId) return sub.notes.vaniUserId;
    const bySub = await Subscription.findOne({
      externalSubscriptionId: sub.id,
    }).lean();
    if (bySub?.user) return String(bySub.user);
    return this.resolveUserIdFromCustomer(sub.customer_id);
  }
}

export const razorpayService = new RazorpayService();
