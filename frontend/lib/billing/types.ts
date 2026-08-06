export type PlanId = 'free' | 'pro' | 'business' | 'enterprise';

export type BillingInterval = 'month' | 'year';

export type PaymentProvider = 'none' | 'stripe' | 'razorpay';

export type UsageMetric =
  | 'chat_requests'
  | 'tokens'
  | 'image_generation'
  | 'voice_minutes'
  | 'research_runs'
  | 'browser_sessions'
  | 'code_executions'
  | 'file_storage_bytes';

export interface PlanQuotas {
  chat_requests: number;
  tokens: number;
  image_generation: number;
  voice_minutes: number;
  research_runs: number;
  browser_sessions: number;
  code_executions: number;
  file_storage_bytes: number;
}

export interface Plan {
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

export interface Subscription {
  id: string;
  userId: string;
  planId: PlanId;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  trialEnd: string | null;
  billingInterval: BillingInterval | null;
  paymentProvider?: PaymentProvider;
  externalCustomerId?: string | null;
  externalSubscriptionId?: string | null;
}

export interface UsageSnapshot {
  userId: string;
  periodStart: string;
  periodEnd: string;
  metrics: PlanQuotas;
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

export interface Invoice {
  id: string;
  planId: PlanId;
  status: string;
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

export type FeatureKey =
  | 'chat'
  | 'image_generation'
  | 'research'
  | 'voice'
  | 'browser'
  | 'agents'
  | 'code_interpreter'
  | 'mcp'
  | 'canvas'
  | 'file_upload'
  | 'priority_routing'
  | 'teams'
  | 'shared_projects'
  | 'admin';

export interface EntitlementsSummary {
  planId: PlanId;
  features: FeatureKey[];
  featureFlags: Record<FeatureKey, boolean>;
  trialActive?: boolean;
  resetDate?: string;
}

export interface BillingOverview {
  plan: Plan;
  subscription: Subscription;
  usage: UsageSnapshot;
  remaining: QuotaRemaining[];
  plans: Plan[];
  stripeEnabled: boolean;
  razorpayEnabled?: boolean;
  defaultProvider?: 'stripe' | 'razorpay';
  entitlements?: EntitlementsSummary;
  invoices?: Invoice[];
}

export interface PlanChangeResult {
  ok: boolean;
  mode: 'checkout' | 'updated' | 'local' | 'portal_hint' | 'sales';
  message: string;
  checkoutUrl?: string | null;
  checkout?: {
    url: string;
    sessionId?: string;
    provider?: 'stripe' | 'razorpay' | null;
    keyId?: string | null;
  } | null;
  sessionId?: string | null;
  provider?: 'stripe' | 'razorpay' | null;
  keyId?: string | null;
  overview?: BillingOverview;
  subscription?: Subscription;
}

export const METRIC_LABELS: Record<UsageMetric, string> = {
  chat_requests: 'Chat requests',
  tokens: 'Tokens',
  image_generation: 'Image generation',
  voice_minutes: 'Voice minutes',
  research_runs: 'Deep Research runs',
  browser_sessions: 'Browser sessions',
  code_executions: 'Code Interpreter',
  file_storage_bytes: 'File storage',
};
