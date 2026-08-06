/**
 * VANI AI — Billing foundation + Stripe + Razorpay + Feature gating
 *
 * billing/
 * ├── BillingService.ts
 * ├── FeatureGate.ts
 * ├── featureMatrix.ts
 * ├── SubscriptionService.ts
 * ├── UsageService.ts
 * ├── PlanService.ts
 * ├── InvoiceService.ts
 * ├── WebhookService.ts
 * ├── StripeService.ts / RazorpayService.ts
 * └── *Config.ts
 */

export { BillingService, billingService } from "./BillingService.ts";
export {
  PlanService,
  planService,
  DEFAULT_PLAN_DEFS,
  freePlanQuotas,
} from "./PlanService.ts";
export { SubscriptionService, subscriptionService } from "./SubscriptionService.ts";
export { UsageService, usageService, monthPeriod } from "./UsageService.ts";
export { InvoiceService, invoiceService } from "./InvoiceService.ts";
export { WebhookService, webhookService } from "./WebhookService.ts";
export { StripeService, stripeService } from "./StripeService.ts";
export { RazorpayService, razorpayService } from "./RazorpayService.ts";
export { FeatureGate, featureGate } from "./FeatureGate.ts";
export {
  FEATURE_KEYS,
  FEATURE_MIN_PLAN,
  FEATURE_QUOTA_METRIC,
  featuresForPlan,
  isFeatureKey,
  planMeetsMinimum,
} from "./featureMatrix.ts";
export {
  isStripeConfigured,
  getStripePriceId,
  resolvePlanFromPriceId,
} from "./stripeConfig.ts";
export {
  isRazorpayConfigured,
  getRazorpayPlanId,
  resolvePlanFromRazorpayPlanId,
  getDefaultPaymentProvider,
  getRazorpayKeyId,
} from "./razorpayConfig.ts";
export type { BillingInterval } from "./stripeConfig.ts";
export type { PaymentProvider } from "./razorpayConfig.ts";
export * from "./types.ts";
