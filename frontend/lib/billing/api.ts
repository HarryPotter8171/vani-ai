import { apiFetch } from '@/lib/apiClient';
import type {
  BillingInterval,
  BillingOverview,
  Invoice,
  Plan,
  PlanChangeResult,
  PlanId,
  Subscription,
} from './types';

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function fetchBillingOverview(): Promise<BillingOverview> {
  const res = await apiFetch('/billing/overview');
  const data = await parseJson<{ overview: BillingOverview }>(res);
  return data.overview;
}

export async function fetchPlans(): Promise<{
  plans: Plan[];
  stripeEnabled: boolean;
  razorpayEnabled?: boolean;
}> {
  const res = await apiFetch('/billing/plans');
  return parseJson(res);
}

export async function fetchSubscription(): Promise<Subscription> {
  const res = await apiFetch('/billing/subscription');
  const data = await parseJson<{ subscription: Subscription }>(res);
  return data.subscription;
}

export async function fetchInvoices(): Promise<Invoice[]> {
  const res = await apiFetch('/billing/invoices');
  const data = await parseJson<{ invoices: Invoice[] }>(res);
  return data.invoices || [];
}

export async function fetchEntitlements(): Promise<
  NonNullable<BillingOverview['entitlements']>
> {
  const res = await apiFetch('/billing/entitlements');
  const data = await parseJson<{
    entitlements: NonNullable<BillingOverview['entitlements']>;
  }>(res);
  return data.entitlements;
}

export async function requestPlanChange(
  planId: PlanId,
  interval: BillingInterval = 'month',
  provider?: 'stripe' | 'razorpay' | null
): Promise<PlanChangeResult> {
  const res = await apiFetch('/billing/upgrade', {
    method: 'POST',
    body: JSON.stringify({
      planId,
      interval,
      ...(provider ? { provider } : {}),
    }),
  });
  return parseJson(res);
}

/** @deprecated use requestPlanChange */
export async function requestPlanUpgrade(
  planId: PlanId,
  interval: BillingInterval = 'month'
): Promise<PlanChangeResult> {
  return requestPlanChange(planId, interval);
}

export async function openCustomerPortal(): Promise<{ portalUrl: string }> {
  const res = await apiFetch('/billing/portal', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return parseJson(res);
}

export async function cancelSubscription(): Promise<{
  ok: boolean;
  message: string;
  subscription: Subscription;
}> {
  const res = await apiFetch('/billing/cancel', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return parseJson(res);
}

export async function resumeSubscription(): Promise<{
  ok: boolean;
  message: string;
  subscription: Subscription;
}> {
  const res = await apiFetch('/billing/resume', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return parseJson(res);
}
