/**
 * WebhookService — Stripe / Razorpay signature verification + subscription sync.
 */

import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { invoiceService } from "./InvoiceService.ts";
import { stripeService } from "./StripeService.ts";
import {
  razorpayService,
  type RazorpayInvoiceLike,
  type RazorpayPaymentLike,
  type RazorpaySubscriptionLike,
} from "./RazorpayService.ts";
import { subscriptionService } from "./SubscriptionService.ts";
import type { WebhookEvent } from "./types.ts";

const MAX_EVENTS = 200;

export class WebhookService {
  private events: WebhookEvent[] = [];

  recent(limit = 50): WebhookEvent[] {
    return this.events.slice(-Math.min(Math.max(limit, 1), MAX_EVENTS));
  }

  private remember(event: WebhookEvent) {
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) {
      this.events.splice(0, this.events.length - MAX_EVENTS);
    }
  }

  /**
   * Ingest a Stripe or Razorpay webhook (raw body + signature), or a generic
   * JSON payload when neither gateway signature is present (dev fallback).
   */
  async ingest(opts: {
    type?: string;
    payload?: Record<string, unknown>;
    headers?: Record<string, unknown>;
    rawBody?: Buffer | string | null;
    provider?: "stripe" | "razorpay" | "auto";
  }): Promise<{
    ok: boolean;
    event: WebhookEvent;
    message: string;
  }> {
    const stripeSignature = String(
      opts.headers?.["stripe-signature"] ||
        opts.headers?.["Stripe-Signature"] ||
        ""
    );
    const razorpaySignature = String(
      opts.headers?.["x-razorpay-signature"] ||
        opts.headers?.["X-Razorpay-Signature"] ||
        ""
    );

    const prefer =
      opts.provider ||
      (razorpaySignature
        ? "razorpay"
        : stripeSignature
          ? "stripe"
          : "auto");

    // Razorpay signed webhook
    if (
      (prefer === "razorpay" || prefer === "auto") &&
      razorpayService.isEnabled() &&
      opts.rawBody &&
      razorpaySignature
    ) {
      try {
        const valid = razorpayService.verifyWebhookSignature(
          opts.rawBody,
          razorpaySignature
        );
        if (!valid) {
          throw new Error("Invalid Razorpay webhook signature");
        }
        const bodyStr =
          typeof opts.rawBody === "string"
            ? opts.rawBody
            : opts.rawBody.toString("utf8");
        const payload = JSON.parse(bodyStr) as {
          event?: string;
          payload?: Record<string, unknown>;
        };
        await this.processRazorpayEvent(payload);
        const event: WebhookEvent = {
          id: `rzp_${randomUUID().replace(/-/g, "").slice(0, 14)}`,
          type: payload.event || "razorpay.webhook",
          payload: { event: payload.event },
          receivedAt: new Date().toISOString(),
          processed: true,
          error: null,
        };
        this.remember(event);
        return {
          ok: true,
          event,
          message: `Razorpay event processed: ${payload.event}`,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const event: WebhookEvent = {
          id: `rzp_${randomUUID().replace(/-/g, "").slice(0, 14)}`,
          type: "razorpay.webhook.error",
          payload: { error: message },
          receivedAt: new Date().toISOString(),
          processed: false,
          error: message,
        };
        this.remember(event);
        const e = new Error(message);
        (e as Error & { status?: number }).status = 400;
        throw e;
      }
    }

    // Stripe signed webhook
    if (
      (prefer === "stripe" || prefer === "auto") &&
      stripeService.isEnabled() &&
      opts.rawBody &&
      stripeSignature
    ) {
      try {
        const stripeEvent = stripeService.constructEvent(
          opts.rawBody,
          stripeSignature
        );
        await this.processStripeEvent(stripeEvent);
        const event: WebhookEvent = {
          id: stripeEvent.id || `bwh_${randomUUID().replace(/-/g, "").slice(0, 14)}`,
          type: stripeEvent.type,
          payload: { id: stripeEvent.id, type: stripeEvent.type },
          receivedAt: new Date().toISOString(),
          processed: true,
          error: null,
        };
        this.remember(event);
        return {
          ok: true,
          event,
          message: `Stripe event processed: ${stripeEvent.type}`,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const event: WebhookEvent = {
          id: `bwh_${randomUUID().replace(/-/g, "").slice(0, 14)}`,
          type: "stripe.webhook.error",
          payload: { error: message },
          receivedAt: new Date().toISOString(),
          processed: false,
          error: message,
        };
        this.remember(event);
        const e = new Error(message);
        (e as Error & { status?: number }).status = 400;
        throw e;
      }
    }

    // Fallback: unsigned / non-gateway payload (local foundation path).
    const type =
      (typeof opts.type === "string" && opts.type.trim()) ||
      String(opts.payload?.type || "billing.webhook.untyped");

    const event: WebhookEvent = {
      id: `bwh_${randomUUID().replace(/-/g, "").slice(0, 14)}`,
      type,
      payload: {
        ...(opts.payload && typeof opts.payload === "object" ? opts.payload : {}),
      },
      receivedAt: new Date().toISOString(),
      processed: true,
      error: null,
    };
    this.remember(event);

    return {
      ok: true,
      event,
      message:
        stripeService.isEnabled() || razorpayService.isEnabled()
          ? "Webhook received without valid gateway signature/raw body."
          : "Webhook accepted (payment gateways not configured).",
    };
  }

  async processStripeEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await this.onCheckoutCompleted(session);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await this.onSubscriptionChanged(sub);
        break;
      }
      case "invoice.paid":
      case "invoice.payment_failed":
      case "invoice.finalized":
      case "invoice.voided":
      case "invoice.updated": {
        const invoice = event.data.object as Stripe.Invoice;
        await this.onInvoice(invoice);
        break;
      }
      default:
        console.log(`[billing:webhook] ignored ${event.type}`);
    }
  }

  async processRazorpayEvent(payload: {
    event?: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    const eventName = String(payload.event || "");
    const entityPayload = payload.payload || {};

    const subscriptionEntity = extractEntity<RazorpaySubscriptionLike>(
      entityPayload,
      "subscription"
    );
    const paymentEntity = extractEntity<RazorpayPaymentLike>(
      entityPayload,
      "payment"
    );
    const invoiceEntity = extractEntity<RazorpayInvoiceLike>(
      entityPayload,
      "invoice"
    );

    switch (eventName) {
      case "subscription.authenticated":
      case "subscription.activated":
      case "subscription.charged":
      case "subscription.updated":
      case "subscription.pending":
      case "subscription.halted":
      case "subscription.paused":
      case "subscription.resumed":
      case "subscription.cancelled":
      case "subscription.completed": {
        if (subscriptionEntity) {
          await this.onRazorpaySubscriptionChanged(subscriptionEntity);
        }
        if (eventName === "subscription.charged" && paymentEntity) {
          await this.onRazorpayPayment(paymentEntity, subscriptionEntity);
        }
        if (invoiceEntity) {
          await this.onRazorpayInvoice(invoiceEntity, subscriptionEntity);
        }
        break;
      }
      case "invoice.paid":
      case "invoice.partially_paid":
      case "invoice.expired": {
        if (invoiceEntity) {
          await this.onRazorpayInvoice(invoiceEntity, subscriptionEntity);
        }
        break;
      }
      default:
        console.log(`[billing:webhook] ignored razorpay ${eventName}`);
    }
  }

  private async onCheckoutCompleted(
    session: Stripe.Checkout.Session
  ): Promise<void> {
    const userId =
      session.client_reference_id ||
      session.metadata?.vaniUserId ||
      (await stripeService.resolveUserIdFromCustomer(
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id
      ));
    if (!userId) {
      console.warn("[billing:webhook] checkout.session.completed: no userId");
      return;
    }

    const customerId =
      typeof session.customer === "string"
        ? session.customer
        : session.customer?.id;
    if (customerId) {
      await subscriptionService.setCustomerId(userId, customerId, "stripe");
    }

    const subId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id;
    if (!subId) return;

    const stripeSub = await stripeService.getClient().subscriptions.retrieve(subId);
    await subscriptionService.applyStripeSubscription(userId, stripeSub);
  }

  private async onSubscriptionChanged(
    stripeSub: Stripe.Subscription
  ): Promise<void> {
    const customerId =
      typeof stripeSub.customer === "string"
        ? stripeSub.customer
        : stripeSub.customer?.id;

    let userId =
      stripeSub.metadata?.vaniUserId ||
      (await stripeService.resolveUserIdFromCustomer(customerId));

    if (!userId) {
      const existing = await subscriptionService.findByStripeSubscriptionId(
        stripeSub.id
      );
      userId = existing?.userId || null;
    }

    if (!userId) {
      console.warn(
        "[billing:webhook] subscription event without user",
        stripeSub.id
      );
      return;
    }

    await subscriptionService.applyStripeSubscription(userId, stripeSub);
  }

  private async onInvoice(stripeInvoice: Stripe.Invoice): Promise<void> {
    const customerId =
      typeof stripeInvoice.customer === "string"
        ? stripeInvoice.customer
        : stripeInvoice.customer?.id;

    const userId = await stripeService.resolveUserIdFromCustomer(customerId);
    if (!userId) {
      console.warn("[billing:webhook] invoice without user", stripeInvoice.id);
      return;
    }

    const local = await subscriptionService.getOrCreate(userId);
    await invoiceService.upsertFromStripe(userId, stripeInvoice, local.id);
  }

  private async onRazorpaySubscriptionChanged(
    rzpSub: RazorpaySubscriptionLike
  ): Promise<void> {
    const userId = await razorpayService.resolveUserIdFromSubscription(rzpSub);
    if (!userId) {
      console.warn(
        "[billing:webhook] razorpay subscription without user",
        rzpSub.id
      );
      return;
    }

    if (rzpSub.customer_id) {
      await subscriptionService.setCustomerId(
        userId,
        rzpSub.customer_id,
        "razorpay"
      );
    }

    await subscriptionService.applyRazorpaySubscription(userId, rzpSub);
  }

  private async onRazorpayInvoice(
    invoice: RazorpayInvoiceLike,
    subscription?: RazorpaySubscriptionLike | null
  ): Promise<void> {
    let userId =
      (await razorpayService.resolveUserIdFromCustomer(invoice.customer_id)) ||
      (subscription
        ? await razorpayService.resolveUserIdFromSubscription(subscription)
        : null);

    if (!userId && invoice.subscription_id) {
      const existing = await subscriptionService.findByExternalSubscriptionId(
        invoice.subscription_id
      );
      userId = existing?.userId || null;
    }

    if (!userId) {
      console.warn("[billing:webhook] razorpay invoice without user", invoice.id);
      return;
    }

    const local = await subscriptionService.getOrCreate(userId);
    const mapped = subscription
      ? razorpayService.extractSubscriptionPlan(subscription)
      : null;
    await invoiceService.upsertFromRazorpay(userId, invoice, local.id, {
      planId: mapped?.planId || local.planId,
    });
  }

  private async onRazorpayPayment(
    payment: RazorpayPaymentLike,
    subscription?: RazorpaySubscriptionLike | null
  ): Promise<void> {
    let userId = subscription
      ? await razorpayService.resolveUserIdFromSubscription(subscription)
      : null;

    if (!userId && payment.notes?.vaniUserId) {
      userId = payment.notes.vaniUserId;
    }
    if (!userId && payment.email) {
      // resolve via customer notes already covered; payment email fallback in apply path
      userId = await razorpayService.resolveUserIdFromCustomer(
        subscription?.customer_id || null
      );
    }

    if (!userId) {
      console.warn("[billing:webhook] razorpay payment without user", payment.id);
      return;
    }

    const local = await subscriptionService.getOrCreate(userId);
    const mapped = subscription
      ? razorpayService.extractSubscriptionPlan(subscription)
      : null;

    await invoiceService.upsertFromRazorpayPayment(userId, payment, {
      subscriptionMongoId: local.id,
      planId: mapped?.planId || local.planId,
      periodStart: subscription?.current_start
        ? new Date(subscription.current_start * 1000)
        : null,
      periodEnd: subscription?.current_end
        ? new Date(subscription.current_end * 1000)
        : null,
      razorpayPlanId: subscription?.plan_id || null,
    });
  }
}

function extractEntity<T>(
  payload: Record<string, unknown>,
  key: string
): T | null {
  const wrap = payload[key] as { entity?: T } | T | undefined;
  if (!wrap) return null;
  if (typeof wrap === "object" && wrap !== null && "entity" in wrap) {
    return (wrap as { entity?: T }).entity || null;
  }
  return wrap as T;
}

export const webhookService = new WebhookService();
