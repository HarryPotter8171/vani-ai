/**
 * SubscriptionService — per-user plan assignment + Stripe/Razorpay lifecycle sync.
 */

import type Stripe from "stripe";
import Subscription from "../models/Subscription.js";
import { planService } from "./PlanService.ts";
import { monthPeriod } from "./UsageService.ts";
import { stripeService } from "./StripeService.ts";
import {
  razorpayService,
  type RazorpaySubscriptionLike,
} from "./RazorpayService.ts";
import type { BillingInterval } from "./stripeConfig.ts";
import type {
  PaymentProvider,
  PlanId,
  SubscriptionSnapshot,
  SubscriptionStatus,
} from "./types.ts";

function serialize(doc: Record<string, unknown>): SubscriptionSnapshot {
  const provider = (doc.paymentProvider as PaymentProvider) || "none";
  return {
    id: String(doc._id),
    userId: String(doc.user),
    planId: doc.planId as PlanId,
    status: doc.status as SubscriptionStatus,
    currentPeriodStart: new Date(doc.currentPeriodStart as Date).toISOString(),
    currentPeriodEnd: new Date(doc.currentPeriodEnd as Date).toISOString(),
    cancelAtPeriodEnd: Boolean(doc.cancelAtPeriodEnd),
    canceledAt: doc.canceledAt
      ? new Date(doc.canceledAt as Date).toISOString()
      : null,
    trialEnd: doc.trialEnd ? new Date(doc.trialEnd as Date).toISOString() : null,
    billingInterval: (doc.billingInterval as BillingInterval) || null,
    paymentProvider: provider,
    externalCustomerId: doc.externalCustomerId
      ? String(doc.externalCustomerId)
      : null,
    externalSubscriptionId: doc.externalSubscriptionId
      ? String(doc.externalSubscriptionId)
      : null,
  };
}

function periodFromStripe(sub: Stripe.Subscription): {
  start: Date;
  end: Date;
} {
  const item = sub.items?.data?.[0] as
    | { current_period_start?: number; current_period_end?: number }
    | undefined;
  const legacy = sub as Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
  };
  const startSec =
    item?.current_period_start ||
    legacy.current_period_start ||
    Math.floor(Date.now() / 1000);
  const endSec =
    item?.current_period_end ||
    legacy.current_period_end ||
    startSec + 30 * 24 * 3600;
  return {
    start: new Date(startSec * 1000),
    end: new Date(endSec * 1000),
  };
}

function periodFromRazorpay(sub: RazorpaySubscriptionLike): {
  start: Date;
  end: Date;
} {
  const startSec =
    sub.current_start ||
    sub.charge_at ||
    Math.floor(Date.now() / 1000);
  const endSec =
    sub.current_end ||
    startSec + 30 * 24 * 3600;
  return {
    start: new Date(startSec * 1000),
    end: new Date(endSec * 1000),
  };
}

function inferProvider(doc: {
  paymentProvider?: string | null;
  externalCustomerId?: string | null;
  externalSubscriptionId?: string | null;
}): PaymentProvider {
  if (
    doc.paymentProvider === "stripe" ||
    doc.paymentProvider === "razorpay" ||
    doc.paymentProvider === "none"
  ) {
    return doc.paymentProvider;
  }
  const cust = String(doc.externalCustomerId || "");
  if (cust.startsWith("cust_")) return "razorpay";
  if (cust.startsWith("cus_")) return "stripe";
  if (doc.externalSubscriptionId) return "stripe";
  return "none";
}

export class SubscriptionService {
  async getOrCreate(userId: string): Promise<SubscriptionSnapshot> {
    await planService.ensureSeeded();
    const existing = await Subscription.findOne({ user: userId }).lean();
    if (existing) {
      // Paid gateway subs own the period — don't roll them with calendar month.
      if (existing.externalSubscriptionId) {
        return serialize(existing as Record<string, unknown>);
      }
      const { start, end } = monthPeriod();
      const periodEnd = new Date(existing.currentPeriodEnd as Date);
      if (periodEnd.getTime() <= Date.now()) {
        const updated = await Subscription.findOneAndUpdate(
          { user: userId },
          {
            $set: {
              currentPeriodStart: start,
              currentPeriodEnd: end,
              status:
                existing.status === "canceled" ? "canceled" : "active",
            },
          },
          { new: true }
        ).lean();
        return serialize((updated || existing) as Record<string, unknown>);
      }
      return serialize(existing as Record<string, unknown>);
    }

    const { start, end } = monthPeriod();
    const created = await Subscription.create({
      user: userId,
      planId: planService.getDefaultPlanId(),
      status: "active",
      currentPeriodStart: start,
      currentPeriodEnd: end,
      cancelAtPeriodEnd: false,
      billingInterval: null,
      paymentProvider: "none",
    });
    return serialize(created.toObject() as Record<string, unknown>);
  }

  async get(userId: string): Promise<SubscriptionSnapshot | null> {
    const doc = await Subscription.findOne({ user: userId }).lean();
    return doc ? serialize(doc as Record<string, unknown>) : null;
  }

  async findByStripeSubscriptionId(
    stripeSubscriptionId: string
  ): Promise<SubscriptionSnapshot | null> {
    return this.findByExternalSubscriptionId(stripeSubscriptionId);
  }

  async findByExternalSubscriptionId(
    externalSubscriptionId: string
  ): Promise<SubscriptionSnapshot | null> {
    const doc = await Subscription.findOne({
      externalSubscriptionId,
    }).lean();
    return doc ? serialize(doc as Record<string, unknown>) : null;
  }

  /**
   * Local-only plan change (used when no gateway is configured, or free fallback).
   */
  async changePlan(
    userId: string,
    planId: PlanId,
    opts: { interval?: BillingInterval | null } = {}
  ): Promise<SubscriptionSnapshot> {
    const plan = await planService.getPlan(planId);
    if (!plan) {
      const err = new Error(`Unknown plan: ${planId}`);
      (err as Error & { status?: number }).status = 400;
      throw err;
    }
    await this.getOrCreate(userId);
    const { start, end } = monthPeriod();
    const updated = await Subscription.findOneAndUpdate(
      { user: userId },
      {
        $set: {
          planId,
          status: "active",
          currentPeriodStart: start,
          currentPeriodEnd: end,
          cancelAtPeriodEnd: false,
          canceledAt: null,
          billingInterval:
            planId === "free" ? null : opts.interval || "month",
          ...(planId === "free"
            ? {
                externalSubscriptionId: null,
                paymentProvider: "none",
              }
            : {}),
        },
      },
      { new: true }
    ).lean();
    if (!updated) {
      throw new Error("Unable to update subscription");
    }
    return serialize(updated as Record<string, unknown>);
  }

  async cancelAtPeriodEnd(userId: string): Promise<SubscriptionSnapshot> {
    const sub = await this.getOrCreate(userId);
    if (sub.planId === "free") return sub;

    const provider = sub.paymentProvider || inferProvider(sub);

    if (sub.externalSubscriptionId) {
      if (provider === "razorpay" && razorpayService.isEnabled()) {
        await razorpayService.cancelAtPeriodEnd(sub.externalSubscriptionId);
      } else if (provider === "stripe" && stripeService.isEnabled()) {
        await stripeService.cancelAtPeriodEnd(sub.externalSubscriptionId);
      }
    }

    const updated = await Subscription.findOneAndUpdate(
      { user: userId },
      {
        $set: {
          cancelAtPeriodEnd: true,
          canceledAt: new Date(),
        },
      },
      { new: true }
    ).lean();
    return serialize((updated || {}) as Record<string, unknown>);
  }

  async resume(userId: string): Promise<SubscriptionSnapshot> {
    const sub = await this.getOrCreate(userId);
    const provider = sub.paymentProvider || inferProvider(sub);

    if (sub.externalSubscriptionId) {
      if (provider === "razorpay" && razorpayService.isEnabled()) {
        if (sub.status === "paused") {
          await razorpayService.resumeSubscription(sub.externalSubscriptionId);
        } else if (sub.cancelAtPeriodEnd) {
          const err = new Error(
            "Razorpay does not support reversing a cancel-at-cycle-end. Access continues until the period ends; start a new subscription afterward if needed."
          );
          (err as Error & { status?: number }).status = 400;
          throw err;
        }
      } else if (provider === "stripe" && stripeService.isEnabled()) {
        await stripeService.resumeSubscription(sub.externalSubscriptionId);
      }
    }

    const updated = await Subscription.findOneAndUpdate(
      { user: userId },
      {
        $set: {
          cancelAtPeriodEnd: false,
          canceledAt: null,
          status: "active",
        },
      },
      { new: true }
    ).lean();
    return serialize((updated || sub) as Record<string, unknown>);
  }

  /**
   * Apply a Stripe Subscription object onto the local VANI subscription.
   */
  async applyStripeSubscription(
    userId: string,
    stripeSub: Stripe.Subscription
  ): Promise<SubscriptionSnapshot> {
    await this.getOrCreate(userId);
    const mapped = stripeService.extractSubscriptionPrice(stripeSub);
    const { start, end } = periodFromStripe(stripeSub);
    const status = stripeService.mapStripeStatus(stripeSub.status);

    const customerId =
      typeof stripeSub.customer === "string"
        ? stripeSub.customer
        : stripeSub.customer?.id;

    const isCanceled =
      status === "canceled" || stripeSub.status === "incomplete_expired";

    const updated = await Subscription.findOneAndUpdate(
      { user: userId },
      {
        $set: {
          planId: isCanceled ? "free" : mapped?.planId || "pro",
          status: isCanceled ? "canceled" : status,
          currentPeriodStart: start,
          currentPeriodEnd: end,
          cancelAtPeriodEnd: Boolean(stripeSub.cancel_at_period_end),
          canceledAt: stripeSub.canceled_at
            ? new Date(stripeSub.canceled_at * 1000)
            : isCanceled
              ? new Date()
              : null,
          trialEnd: stripeSub.trial_end
            ? new Date(stripeSub.trial_end * 1000)
            : null,
          billingInterval: isCanceled ? null : mapped?.interval || null,
          paymentProvider: isCanceled ? "none" : "stripe",
          externalCustomerId: customerId || null,
          externalSubscriptionId: isCanceled ? null : stripeSub.id,
        },
      },
      { new: true }
    ).lean();

    // After full cancel, restore a clean free active subscription for product access.
    if (isCanceled) {
      const { start: ps, end: pe } = monthPeriod();
      const free = await Subscription.findOneAndUpdate(
        { user: userId },
        {
          $set: {
            planId: "free",
            status: "active",
            currentPeriodStart: ps,
            currentPeriodEnd: pe,
            cancelAtPeriodEnd: false,
            canceledAt: new Date(),
            billingInterval: null,
            paymentProvider: "none",
            externalSubscriptionId: null,
            externalCustomerId: customerId || updated?.externalCustomerId || null,
          },
        },
        { new: true }
      ).lean();
      return serialize((free || updated || {}) as Record<string, unknown>);
    }

    return serialize((updated || {}) as Record<string, unknown>);
  }

  /**
   * Apply a Razorpay Subscription onto the local VANI subscription.
   * Keeps BillingService / overview in sync with Razorpay lifecycle events.
   */
  async applyRazorpaySubscription(
    userId: string,
    rzpSub: RazorpaySubscriptionLike
  ): Promise<SubscriptionSnapshot> {
    await this.getOrCreate(userId);
    const mapped = razorpayService.extractSubscriptionPlan(rzpSub);
    const { start, end } = periodFromRazorpay(rzpSub);
    const status = razorpayService.mapRazorpayStatus(rzpSub.status);
    const customerId = rzpSub.customer_id || null;

    const rawStatus = String(rzpSub.status || "").toLowerCase();
    const isCanceled = ["cancelled", "canceled", "completed", "expired"].includes(
      rawStatus
    );

    // Preserve local cancel-at-period-end while Razorpay status is still active
    // (cancel_at_cycle_end keeps the sub alive until the cycle ends).
    const existing = await Subscription.findOne({ user: userId }).lean();
    const cancelAtPeriodEnd = isCanceled
      ? false
      : Boolean(existing?.cancelAtPeriodEnd);

    const updated = await Subscription.findOneAndUpdate(
      { user: userId },
      {
        $set: {
          planId: isCanceled ? "free" : mapped?.planId || "pro",
          status: isCanceled
            ? "canceled"
            : status === "incomplete"
              ? "incomplete"
              : status,
          currentPeriodStart: start,
          currentPeriodEnd: end,
          cancelAtPeriodEnd,
          canceledAt: rzpSub.ended_at
            ? new Date(rzpSub.ended_at * 1000)
            : isCanceled
              ? new Date()
              : cancelAtPeriodEnd
                ? existing?.canceledAt || new Date()
                : null,
          trialEnd: null,
          billingInterval: isCanceled ? null : mapped?.interval || null,
          paymentProvider: isCanceled ? "none" : "razorpay",
          externalCustomerId: customerId || null,
          externalSubscriptionId: isCanceled ? null : rzpSub.id,
        },
      },
      { new: true }
    ).lean();

    if (isCanceled) {
      const { start: ps, end: pe } = monthPeriod();
      const free = await Subscription.findOneAndUpdate(
        { user: userId },
        {
          $set: {
            planId: "free",
            status: "active",
            currentPeriodStart: ps,
            currentPeriodEnd: pe,
            cancelAtPeriodEnd: false,
            canceledAt: new Date(),
            billingInterval: null,
            paymentProvider: "none",
            externalSubscriptionId: null,
            externalCustomerId:
              customerId || updated?.externalCustomerId || null,
          },
        },
        { new: true }
      ).lean();
      return serialize((free || updated || {}) as Record<string, unknown>);
    }

    return serialize((updated || {}) as Record<string, unknown>);
  }

  async setCustomerId(
    userId: string,
    customerId: string,
    provider?: PaymentProvider
  ): Promise<void> {
    const $set: Record<string, unknown> = { externalCustomerId: customerId };
    if (provider && provider !== "none") {
      $set.paymentProvider = provider;
    }
    await Subscription.findOneAndUpdate({ user: userId }, { $set });
  }
}

export const subscriptionService = new SubscriptionService();
