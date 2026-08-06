/**
 * Razorpay configuration — env-driven plan map for Pro / Business × monthly / yearly.
 * Payment methods (UPI, cards, netbanking) are enabled in the Razorpay Dashboard;
 * Checkout / subscription short_url surfaces whatever methods are active on the account.
 */

import type { PlanId } from "./types.ts";

export type BillingInterval = "month" | "year";

export type PaymentProvider = "none" | "stripe" | "razorpay";

export function isRazorpayConfigured(): boolean {
  return Boolean(
    process.env.RAZORPAY_KEY_ID?.trim() &&
      process.env.RAZORPAY_KEY_SECRET?.trim()
  );
}

export function getRazorpayKeyId(): string | null {
  const key = process.env.RAZORPAY_KEY_ID?.trim();
  return key || null;
}

export function getRazorpayKeySecret(): string | null {
  const key = process.env.RAZORPAY_KEY_SECRET?.trim();
  return key || null;
}

export function getRazorpayWebhookSecret(): string | null {
  const key = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  return key || null;
}

export function getAppBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.CORS_ORIGINS?.split(",")[0]?.trim() ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

/**
 * Default provider when both Stripe and Razorpay are configured and the client
 * does not pass an explicit `provider`. Prefer razorpay for India-first installs.
 */
export function getDefaultPaymentProvider(): "stripe" | "razorpay" {
  const raw = (process.env.BILLING_DEFAULT_PROVIDER || "razorpay")
    .trim()
    .toLowerCase();
  return raw === "stripe" ? "stripe" : "razorpay";
}

/** Map VANI plan + interval → Razorpay Plan id from env. */
export function getRazorpayPlanId(
  planId: PlanId,
  interval: BillingInterval
): string | null {
  if (planId === "free" || planId === "enterprise") return null;
  const envKey =
    interval === "year"
      ? `RAZORPAY_PLAN_${planId.toUpperCase()}_YEARLY`
      : `RAZORPAY_PLAN_${planId.toUpperCase()}_MONTHLY`;
  const value = process.env[envKey]?.trim();
  return value || null;
}

export function resolvePlanFromRazorpayPlanId(
  planId: string | null | undefined
): { planId: PlanId; interval: BillingInterval } | null {
  if (!planId) return null;
  const pairs: Array<{ planId: PlanId; interval: BillingInterval; env: string }> =
    [
      { planId: "pro", interval: "month", env: "RAZORPAY_PLAN_PRO_MONTHLY" },
      { planId: "pro", interval: "year", env: "RAZORPAY_PLAN_PRO_YEARLY" },
      {
        planId: "business",
        interval: "month",
        env: "RAZORPAY_PLAN_BUSINESS_MONTHLY",
      },
      {
        planId: "business",
        interval: "year",
        env: "RAZORPAY_PLAN_BUSINESS_YEARLY",
      },
    ];
  for (const p of pairs) {
    if (process.env[p.env]?.trim() === planId) {
      return { planId: p.planId, interval: p.interval };
    }
  }
  return null;
}

/** Billing cycles for Razorpay subscriptions (required by API). */
export function getRazorpayTotalCount(interval: BillingInterval): number {
  const envKey =
    interval === "year"
      ? "RAZORPAY_SUBSCRIPTION_TOTAL_COUNT_YEARLY"
      : "RAZORPAY_SUBSCRIPTION_TOTAL_COUNT_MONTHLY";
  const raw = process.env[envKey]?.trim() || process.env.RAZORPAY_SUBSCRIPTION_TOTAL_COUNT?.trim();
  const n = raw ? Number(raw) : interval === "year" ? 10 : 120;
  if (!Number.isFinite(n) || n < 1) return interval === "year" ? 10 : 120;
  return Math.min(Math.floor(n), 1000);
}

export function listConfiguredRazorpayPlanIds(): string[] {
  return [
    "RAZORPAY_PLAN_PRO_MONTHLY",
    "RAZORPAY_PLAN_PRO_YEARLY",
    "RAZORPAY_PLAN_BUSINESS_MONTHLY",
    "RAZORPAY_PLAN_BUSINESS_YEARLY",
  ]
    .map((k) => process.env[k]?.trim())
    .filter((v): v is string => Boolean(v));
}
