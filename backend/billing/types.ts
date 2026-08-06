/**
 * VANI AI — Billing foundation types
 */

import type { FeatureKey } from "./featureMatrix.ts";

export type { FeatureKey };

export type PlanId = "free" | "pro" | "business" | "enterprise";

export type BillingInterval = "month" | "year";

export type PaymentProvider = "none" | "stripe" | "razorpay";

export type UsageMetric =
  | "chat_requests"
  | "tokens"
  | "image_generation"
  | "voice_minutes"
  | "research_runs"
  | "browser_sessions"
  | "code_executions"
  | "file_storage_bytes";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "paused";

export type InvoiceStatus =
  | "draft"
  | "open"
  | "paid"
  | "void"
  | "uncollectible";

export type UsageMetricsMap = Record<UsageMetric, number>;

export interface PlanQuotas extends UsageMetricsMap {}

export interface PlanSnapshot {
  planId: PlanId;
  name: string;
  description: string;
  rank: number;
  priceMonthlyCents: number | null;
  priceYearlyCents: number | null;
  currency: string;
  quotas: PlanQuotas;
  features: string[];
  isPublic: boolean;
  isActive: boolean;
}

export interface SubscriptionSnapshot {
  id: string;
  userId: string;
  planId: PlanId;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  trialEnd: string | null;
  billingInterval: BillingInterval | null;
  paymentProvider: PaymentProvider;
  externalCustomerId: string | null;
  externalSubscriptionId: string | null;
}

export interface UsageSnapshot {
  userId: string;
  periodStart: string;
  periodEnd: string;
  metrics: UsageMetricsMap;
  lastEventAt: string | null;
}

export interface QuotaRemaining {
  metric: UsageMetric;
  used: number;
  limit: number;
  remaining: number | null;
  unlimited: boolean;
  percentUsed: number | null;
}

export interface EntitlementsSummary {
  planId: PlanId;
  features: FeatureKey[];
  featureFlags: Record<FeatureKey, boolean>;
  trialActive?: boolean;
  resetDate?: string;
}

export interface BillingOverview {
  plan: PlanSnapshot;
  subscription: SubscriptionSnapshot;
  usage: UsageSnapshot;
  remaining: QuotaRemaining[];
  plans: PlanSnapshot[];
  stripeEnabled: boolean;
  razorpayEnabled: boolean;
  /** Preferred checkout provider when both are configured. */
  defaultProvider: "stripe" | "razorpay";
  entitlements?: EntitlementsSummary;
  invoices?: InvoiceListItem[];
}

export interface InvoiceListItem {
  id: string;
  planId: PlanId;
  status: InvoiceStatus;
  currency: string;
  totalCents: number;
  periodStart: string;
  periodEnd: string;
  issuedAt: string | null;
  paidAt: string | null;
  number: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  externalInvoiceId: string | null;
  createdAt: string;
}

export interface CheckoutResult {
  ok: boolean;
  mode: "checkout" | "updated" | "local" | "portal_hint" | "sales";
  message: string;
  checkoutUrl?: string | null;
  portalUrl?: string | null;
  sessionId?: string | null;
  /** stripe | razorpay when mode is checkout / updated via a gateway. */
  provider?: "stripe" | "razorpay" | null;
  /** Razorpay publishable key for optional Checkout.js. */
  keyId?: string | null;
  subscription?: SubscriptionSnapshot;
  overview?: BillingOverview;
}

export interface RecordUsageInput {
  userId: string;
  metric: UsageMetric;
  quantity?: number;
  meta?: Record<string, unknown>;
}

export interface WebhookEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  receivedAt: string;
  processed: boolean;
  error?: string | null;
}
