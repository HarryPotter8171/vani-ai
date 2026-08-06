/**
 * Stripe configuration — env-driven price map for Pro / Business × monthly / yearly.
 */

import type { PlanId } from "./types.ts";

export type BillingInterval = "month" | "year";

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function getStripeSecretKey(): string | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return key || null;
}

export function getStripeWebhookSecret(): string | null {
  const key = process.env.STRIPE_WEBHOOK_SECRET?.trim();
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

/** Map VANI plan + interval → Stripe Price id from env. */
export function getStripePriceId(
  planId: PlanId,
  interval: BillingInterval
): string | null {
  if (planId === "free" || planId === "enterprise") return null;
  const envKey =
    interval === "year"
      ? `STRIPE_PRICE_${planId.toUpperCase()}_YEARLY`
      : `STRIPE_PRICE_${planId.toUpperCase()}_MONTHLY`;
  const value = process.env[envKey]?.trim();
  return value || null;
}

export function resolvePlanFromPriceId(
  priceId: string | null | undefined
): { planId: PlanId; interval: BillingInterval } | null {
  if (!priceId) return null;
  const pairs: Array<{ planId: PlanId; interval: BillingInterval; env: string }> =
    [
      { planId: "pro", interval: "month", env: "STRIPE_PRICE_PRO_MONTHLY" },
      { planId: "pro", interval: "year", env: "STRIPE_PRICE_PRO_YEARLY" },
      {
        planId: "business",
        interval: "month",
        env: "STRIPE_PRICE_BUSINESS_MONTHLY",
      },
      {
        planId: "business",
        interval: "year",
        env: "STRIPE_PRICE_BUSINESS_YEARLY",
      },
    ];
  for (const p of pairs) {
    if (process.env[p.env]?.trim() === priceId) {
      return { planId: p.planId, interval: p.interval };
    }
  }
  return null;
}

export function listConfiguredPriceIds(): string[] {
  return [
    "STRIPE_PRICE_PRO_MONTHLY",
    "STRIPE_PRICE_PRO_YEARLY",
    "STRIPE_PRICE_BUSINESS_MONTHLY",
    "STRIPE_PRICE_BUSINESS_YEARLY",
  ]
    .map((k) => process.env[k]?.trim())
    .filter((v): v is string => Boolean(v));
}
