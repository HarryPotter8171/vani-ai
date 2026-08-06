/**
 * Parse UsageGuard / FeatureGate denials from API responses.
 * Backend shape: middleware/usageGuard.js → sendGateDenial
 */

export type GateDenialCode =
  | 'PLAN_REQUIRED'
  | 'FEATURE_DISABLED'
  | 'QUOTA_EXCEEDED'
  | 'AUTH_REQUIRED'
  | 'SUBSCRIPTION_INACTIVE'
  | 'TRIAL_EXPIRED'
  | string;

export interface GateDenial {
  code: GateDenialCode;
  status: number;
  error: string;
  message: string;
  feature?: string | null;
  metric?: string | null;
  requiredPlan?: string | null;
  currentPlan?: string | null;
  used?: number | null;
  limit?: number | null;
  remaining?: number | null;
  resetDate?: string | null;
  trialEnd?: string | null;
  subscriptionStatus?: string | null;
  upgradeHint?: string | null;
}

const GATE_CODES = new Set([
  'PLAN_REQUIRED',
  'FEATURE_DISABLED',
  'QUOTA_EXCEEDED',
  'AUTH_REQUIRED',
  'SUBSCRIPTION_INACTIVE',
  'TRIAL_EXPIRED',
]);

export function isGateDenial(value: unknown): value is GateDenial {
  if (!value || typeof value !== 'object') return false;
  const code = (value as { code?: unknown }).code;
  return typeof code === 'string' && GATE_CODES.has(code);
}

export async function parseGateDenial(
  response: Response
): Promise<GateDenial | null> {
  if (response.ok) return null;
  if (response.status !== 402 && response.status !== 403 && response.status !== 401) {
    return null;
  }
  try {
    const data = (await response.clone().json()) as Record<string, unknown>;
    if (!isGateDenial(data)) {
      // Still surface 402s with a message even if code is missing.
      if (response.status === 402 && (data.error || data.message)) {
        return {
          code: 'QUOTA_EXCEEDED',
          status: response.status,
          error: String(data.error || data.message),
          message: String(data.message || data.error),
          feature: (data.feature as string) || null,
          metric: (data.metric as string) || null,
          requiredPlan: (data.requiredPlan as string) || null,
          currentPlan: (data.currentPlan as string) || null,
          used: typeof data.used === 'number' ? data.used : null,
          limit: typeof data.limit === 'number' ? data.limit : null,
          remaining: typeof data.remaining === 'number' ? data.remaining : null,
          resetDate: (data.resetDate as string) || null,
          upgradeHint: (data.upgradeHint as string) || null,
        };
      }
      return null;
    }
    return {
      ...data,
      status: response.status,
      error: data.error || data.message,
      message: data.message || data.error,
    };
  } catch {
    return null;
  }
}

export function formatResetDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatGateToast(denial: GateDenial): string {
  const parts = [denial.message || denial.error];
  if (denial.remaining != null && denial.limit != null) {
    parts.push(`${denial.remaining} remaining of ${denial.limit}`);
  }
  const reset = formatResetDate(denial.resetDate);
  if (reset) parts.push(`Resets ${reset}`);
  return parts.join(' · ');
}

export class GateDenialError extends Error {
  denial: GateDenial;

  constructor(denial: GateDenial) {
    super(denial.message || denial.error || 'Plan limit reached');
    this.name = 'GateDenialError';
    this.denial = denial;
  }
}

/** Throw GateDenialError when a parsed JSON body is a UsageGuard denial. */
export function throwIfGateBody(
  status: number,
  data: Record<string, unknown>
): void {
  if (status !== 401 && status !== 402 && status !== 403) return;
  if (!isGateDenial(data) && status !== 402) return;
  const denial: GateDenial = isGateDenial(data)
    ? { ...data, status, error: data.error || data.message, message: data.message || data.error }
    : {
        code: 'QUOTA_EXCEEDED',
        status,
        error: String(data.error || data.message || 'Quota exceeded'),
        message: String(data.message || data.error || 'Quota exceeded'),
        feature: (data.feature as string) || null,
        metric: (data.metric as string) || null,
        requiredPlan: (data.requiredPlan as string) || null,
        currentPlan: (data.currentPlan as string) || null,
        used: typeof data.used === 'number' ? data.used : null,
        limit: typeof data.limit === 'number' ? data.limit : null,
        remaining: typeof data.remaining === 'number' ? data.remaining : null,
        resetDate: (data.resetDate as string) || null,
        upgradeHint: (data.upgradeHint as string) || null,
      };
  throw new GateDenialError(denial);
}
