/**
 * BillingService — facade over plan / subscription / usage / invoice / gateways.
 * Routes checkout & lifecycle between Stripe and Razorpay while keeping a single
 * Subscription document synchronized via SubscriptionService.
 */

import { planService } from "./PlanService.ts";
import { subscriptionService } from "./SubscriptionService.ts";
import { usageService } from "./UsageService.ts";
import { invoiceService } from "./InvoiceService.ts";
import { webhookService } from "./WebhookService.ts";
import { stripeService } from "./StripeService.ts";
import { razorpayService } from "./RazorpayService.ts";
import { featureGate } from "./FeatureGate.ts";
import {
  getDefaultPaymentProvider,
  type BillingInterval,
} from "./razorpayConfig.ts";
import type { FeatureKey } from "./featureMatrix.ts";
import type {
  BillingOverview,
  CheckoutResult,
  PaymentProvider,
  PlanId,
  RecordUsageInput,
  UsageMetric,
} from "./types.ts";

function httpError(message: string, status = 400): Error {
  const err = new Error(message);
  (err as Error & { status?: number }).status = status;
  return err;
}

type Gateway = "stripe" | "razorpay";

export class BillingService {
  async init(): Promise<void> {
    await planService.ensureSeeded();
  }

  isStripeEnabled(): boolean {
    return stripeService.isEnabled();
  }

  isRazorpayEnabled(): boolean {
    return razorpayService.isEnabled();
  }

  /** Any payment gateway available for Checkout. */
  isCheckoutEnabled(): boolean {
    return this.isStripeEnabled() || this.isRazorpayEnabled();
  }

  /**
   * Resolve which gateway to use for a new checkout / plan change.
   * Existing paid subscriptions stick to their paymentProvider.
   */
  resolveProvider(opts: {
    requested?: string | null;
    currentProvider?: PaymentProvider | null;
    hasExternalSubscription?: boolean;
  }): Gateway | null {
    const stripeOn = this.isStripeEnabled();
    const rzpOn = this.isRazorpayEnabled();
    if (!stripeOn && !rzpOn) return null;

    const current = opts.currentProvider;
    if (
      opts.hasExternalSubscription &&
      (current === "stripe" || current === "razorpay")
    ) {
      if (current === "stripe" && stripeOn) return "stripe";
      if (current === "razorpay" && rzpOn) return "razorpay";
    }

    const requested = String(opts.requested || "")
      .trim()
      .toLowerCase();
    if (requested === "razorpay" && rzpOn) return "razorpay";
    if (requested === "stripe" && stripeOn) return "stripe";

    const preferred = getDefaultPaymentProvider();
    if (preferred === "razorpay" && rzpOn) return "razorpay";
    if (preferred === "stripe" && stripeOn) return "stripe";
    if (rzpOn) return "razorpay";
    if (stripeOn) return "stripe";
    return null;
  }

  async getOverview(userId: string): Promise<BillingOverview> {
    const [subscription, plans] = await Promise.all([
      subscriptionService.getOrCreate(userId),
      planService.listPlans(),
    ]);
    const plan =
      (await planService.getPlan(subscription.planId)) ||
      (await planService.getPlan("free"));
    if (!plan) throw new Error("Default Free plan missing");

    const usage = await usageService.getUsage(userId);
    const remaining = usageService.computeRemaining(usage.metrics, plan.quotas);

    try {
      await invoiceService.ensurePeriodInvoice({
        userId,
        planId: subscription.planId,
        subscriptionId: subscription.id,
        periodStart: new Date(subscription.currentPeriodStart),
        periodEnd: new Date(subscription.currentPeriodEnd),
      });
    } catch (err) {
      console.warn(
        "[billing] ensurePeriodInvoice",
        err instanceof Error ? err.message : err
      );
    }

    // Pull latest gateway invoices into Mongo when connected.
    if (
      subscription.paymentProvider === "stripe" &&
      stripeService.isEnabled() &&
      subscription.externalCustomerId
    ) {
      try {
        const stripeInvoices = await stripeService.listCustomerInvoices(
          subscription.externalCustomerId,
          20
        );
        for (const inv of stripeInvoices) {
          await invoiceService.upsertFromStripe(userId, inv, subscription.id);
        }
      } catch (err) {
        console.warn(
          "[billing] sync stripe invoices",
          err instanceof Error ? err.message : err
        );
      }
    }

    if (
      subscription.paymentProvider === "razorpay" &&
      razorpayService.isEnabled() &&
      subscription.externalCustomerId
    ) {
      try {
        const rzpInvoices = await razorpayService.listCustomerInvoices(
          subscription.externalCustomerId,
          20
        );
        for (const inv of rzpInvoices) {
          await invoiceService.upsertFromRazorpay(userId, inv, subscription.id, {
            planId: subscription.planId,
          });
        }
      } catch (err) {
        console.warn(
          "[billing] sync razorpay invoices",
          err instanceof Error ? err.message : err
        );
      }
    }

    const invoices = await invoiceService.listSummaries(userId, 20);
    const entitlements = await featureGate.getEntitlements(userId);

    return {
      plan,
      subscription,
      usage,
      remaining,
      plans,
      stripeEnabled: stripeService.isEnabled(),
      razorpayEnabled: razorpayService.isEnabled(),
      defaultProvider: getDefaultPaymentProvider(),
      entitlements: {
        planId: entitlements.planId,
        features: entitlements.features,
        featureFlags: entitlements.featureFlags,
        trialActive: entitlements.trialActive,
        resetDate: entitlements.resetDate,
      },
      invoices,
    };
  }

  async getEntitlements(userId: string) {
    return featureGate.getEntitlements(userId);
  }

  async checkAccess(userId: string, feature: FeatureKey, quantity = 1) {
    return featureGate.checkAccess(userId, feature, quantity);
  }

  async listPlans() {
    return planService.listPlans();
  }

  async getSubscription(userId: string) {
    return subscriptionService.getOrCreate(userId);
  }

  async getUsage(userId: string) {
    const subscription = await subscriptionService.getOrCreate(userId);
    const plan = await planService.getPlan(subscription.planId);
    const usage = await usageService.getUsage(userId);
    const remaining = usageService.computeRemaining(
      usage.metrics,
      plan?.quotas || (await planService.getPlan("free"))!.quotas
    );
    return { usage, remaining, plan, subscription };
  }

  async recordUsage(input: RecordUsageInput) {
    return usageService.record(input);
  }

  async listInvoices(userId: string, limit?: number) {
    return invoiceService.listSummaries(userId, limit);
  }

  /**
   * Upgrade / downgrade / subscribe.
   * - Free → paid: Stripe Checkout or Razorpay subscription short_url
   * - Paid → paid: in-place plan update on the active provider
   * - Paid → free: cancel at period end
   * - No gateway: local-only change (foundation fallback)
   */
  async changePlan(opts: {
    userId: string;
    email: string;
    name?: string;
    planId: PlanId;
    interval?: BillingInterval;
    provider?: string | null;
  }): Promise<CheckoutResult> {
    const interval: BillingInterval = opts.interval || "month";
    const planId = opts.planId;

    if (!["free", "pro", "business", "enterprise"].includes(planId)) {
      throw httpError("planId must be free, pro, business, or enterprise");
    }

    if (planId === "enterprise") {
      return {
        ok: true,
        mode: "sales",
        message:
          "Enterprise plans require a sales conversation. Contact support to upgrade.",
        checkoutUrl: null,
      };
    }

    const current = await subscriptionService.getOrCreate(opts.userId);
    const currentPlan = await planService.getPlan(current.planId);
    const targetPlan = await planService.getPlan(planId);
    if (!targetPlan) throw httpError(`Unknown plan: ${planId}`);

    // Downgrade / cancel to free
    if (planId === "free") {
      if (current.planId === "free") {
        return {
          ok: true,
          mode: "local",
          message: "Already on the Free plan.",
          subscription: current,
          overview: await this.getOverview(opts.userId),
        };
      }
      const subscription = await subscriptionService.cancelAtPeriodEnd(
        opts.userId
      );
      return {
        ok: true,
        mode: "updated",
        message:
          "Cancellation scheduled. You keep access until the end of the billing period.",
        subscription,
        overview: await this.getOverview(opts.userId),
        provider:
          subscription.paymentProvider === "stripe" ||
          subscription.paymentProvider === "razorpay"
            ? subscription.paymentProvider
            : null,
      };
    }

    const provider = this.resolveProvider({
      requested: opts.provider,
      currentProvider: current.paymentProvider,
      hasExternalSubscription: Boolean(current.externalSubscriptionId),
    });

    // No gateway configured — keep foundation local behavior
    if (!provider) {
      const subscription = await subscriptionService.changePlan(
        opts.userId,
        planId,
        { interval }
      );
      return {
        ok: true,
        mode: "local",
        message:
          "Plan updated. Online checkout is temporarily unavailable.",
        checkoutUrl: null,
        subscription,
        overview: await this.getOverview(opts.userId),
      };
    }

    // Existing paid subscription → in-place upgrade/downgrade on same provider
    if (current.externalSubscriptionId) {
      if (provider === "razorpay") {
        await razorpayService.updateSubscriptionPlan({
          razorpaySubscriptionId: current.externalSubscriptionId,
          planId,
          interval,
        });
        const rzpSub = await razorpayService.fetchSubscription(
          current.externalSubscriptionId
        );
        const subscription = await subscriptionService.applyRazorpaySubscription(
          opts.userId,
          rzpSub
        );
        const direction =
          (targetPlan.rank || 0) >= (currentPlan?.rank || 0)
            ? "Upgraded"
            : "Downgraded";
        return {
          ok: true,
          mode: "updated",
          message: `${direction} to ${targetPlan.name} (${interval}ly) via Razorpay.`,
          subscription,
          overview: await this.getOverview(opts.userId),
          provider: "razorpay",
        };
      }

      await stripeService.updateSubscriptionPlan({
        stripeSubscriptionId: current.externalSubscriptionId,
        planId,
        interval,
      });
      const stripeSub = await stripeService
        .getClient()
        .subscriptions.retrieve(current.externalSubscriptionId);
      const subscription = await subscriptionService.applyStripeSubscription(
        opts.userId,
        stripeSub
      );

      const direction =
        (targetPlan.rank || 0) >= (currentPlan?.rank || 0)
          ? "Upgraded"
          : "Downgraded";

      return {
        ok: true,
        mode: "updated",
        message: `${direction} to ${targetPlan.name} (${interval}ly). Prorations appear on your next invoice.`,
        subscription,
        overview: await this.getOverview(opts.userId),
        provider: "stripe",
      };
    }

    // New paid subscription → Checkout
    if (provider === "razorpay") {
      const session = await razorpayService.createCheckoutSession({
        userId: opts.userId,
        email: opts.email,
        name: opts.name,
        planId,
        interval,
      });
      return {
        ok: true,
        mode: "checkout",
        message:
          "Redirecting to Razorpay Checkout (UPI, Cards, Net Banking)…",
        checkoutUrl: session.url,
        sessionId: session.sessionId,
        provider: "razorpay",
        keyId: session.keyId,
      };
    }

    const session = await stripeService.createCheckoutSession({
      userId: opts.userId,
      email: opts.email,
      name: opts.name,
      planId,
      interval,
    });

    return {
      ok: true,
      mode: "checkout",
      message: "Redirecting to Stripe Checkout…",
      checkoutUrl: session.url,
      sessionId: session.sessionId,
      provider: "stripe",
    };
  }

  /** Alias used by older controllers. */
  async upgrade(opts: {
    userId: string;
    email: string;
    name?: string;
    planId: PlanId;
    interval?: BillingInterval;
    provider?: string | null;
  }) {
    return this.changePlan(opts);
  }

  async cancelAtPeriodEnd(userId: string) {
    return subscriptionService.cancelAtPeriodEnd(userId);
  }

  async resumeSubscription(userId: string) {
    return subscriptionService.resume(userId);
  }

  async createPortalSession(opts: {
    userId: string;
    email: string;
    name?: string;
  }) {
    if (!stripeService.isEnabled()) {
      throw httpError(
        "Customer Portal is available for Stripe subscriptions. Razorpay subscribers can cancel or change plans from Billing settings.",
        503
      );
    }
    const sub = await subscriptionService.getOrCreate(opts.userId);
    if (sub.paymentProvider === "razorpay") {
      throw httpError(
        "This subscription is billed via Razorpay. Use Cancel / Resume or change plan from Billing settings.",
        400
      );
    }
    return stripeService.createPortalSession(opts);
  }

  async createCheckoutSession(opts: {
    userId: string;
    email: string;
    name?: string;
    planId: PlanId;
    interval?: BillingInterval;
    provider?: string | null;
  }) {
    const interval = opts.interval || "month";
    const current = await subscriptionService.getOrCreate(opts.userId);
    const provider = this.resolveProvider({
      requested: opts.provider,
      currentProvider: current.paymentProvider,
      hasExternalSubscription: Boolean(current.externalSubscriptionId),
    });

    if (!provider) {
      throw httpError("Billing is temporarily unavailable.", 503);
    }

    if (provider === "razorpay") {
      return razorpayService.createCheckoutSession({
        ...opts,
        interval,
      });
    }

    return stripeService.createCheckoutSession({
      ...opts,
      interval,
    });
  }

  async handleWebhook(opts: {
    type?: string;
    payload?: Record<string, unknown>;
    headers?: Record<string, unknown>;
    rawBody?: Buffer | string | null;
    provider?: "stripe" | "razorpay" | "auto";
  }) {
    return webhookService.ingest(opts);
  }

  isMetric(value: unknown): value is UsageMetric {
    return usageService.isMetric(value);
  }
}

export const billingService = new BillingService();
