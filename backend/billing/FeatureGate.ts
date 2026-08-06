/**
 * FeatureGate — subscription + trial + plan entitlement + hard quota checks.
 * Used by UsageGuard middleware and tool execute paths.
 */

import { planService } from "./PlanService.ts";
import { subscriptionService } from "./SubscriptionService.ts";
import { usageService } from "./UsageService.ts";
import {
  FEATURE_KEYS,
  FEATURE_MIN_PLAN,
  FEATURE_QUOTA_METRIC,
  featuresForPlan,
  isFeatureKey,
  planMeetsMinimum,
  type FeatureKey,
} from "./featureMatrix.ts";
import type {
  PlanId,
  PlanSnapshot,
  QuotaRemaining,
  SubscriptionSnapshot,
  UsageMetric,
  UsageSnapshot,
} from "./types.ts";

export type GateDenialCode =
  | "PLAN_REQUIRED"
  | "FEATURE_DISABLED"
  | "QUOTA_EXCEEDED"
  | "AUTH_REQUIRED"
  | "SUBSCRIPTION_INACTIVE"
  | "TRIAL_EXPIRED";

export interface GateDenial {
  ok: false;
  allowed: false;
  code: GateDenialCode;
  status: number;
  error: string;
  message: string;
  feature?: FeatureKey;
  metric?: UsageMetric;
  requiredPlan?: PlanId;
  currentPlan?: PlanId;
  used?: number;
  limit?: number;
  remaining?: number | null;
  resetDate?: string | null;
  trialEnd?: string | null;
  subscriptionStatus?: string;
  upgradeHint?: string;
}

export interface GateAllow {
  ok: true;
  allowed: true;
  planId: PlanId;
  plan: PlanSnapshot;
  subscription: SubscriptionSnapshot;
  usage: UsageSnapshot;
  remaining: QuotaRemaining[];
  features: FeatureKey[];
}

export type GateResult = GateAllow | GateDenial;

export interface Entitlements {
  planId: PlanId;
  planName: string;
  features: FeatureKey[];
  featureFlags: Record<FeatureKey, boolean>;
  quotas: PlanSnapshot["quotas"];
  remaining: QuotaRemaining[];
  usage: UsageSnapshot;
  subscription: SubscriptionSnapshot;
  trialActive: boolean;
  resetDate: string;
}

function gatingDisabled(): boolean {
  if (process.env.FEATURE_GATING_DISABLED !== "true") return false;
  // Production boot should have refused this via validateEnv; never honor it live.
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  return true;
}

function denial(partial: Omit<GateDenial, "ok" | "allowed">): GateDenial {
  return { ok: false, allowed: false, ...partial };
}

function upgradeHint(requiredPlan: PlanId): string {
  if (requiredPlan === "enterprise") {
    return "Contact sales for an Enterprise plan.";
  }
  if (requiredPlan === "business") {
    return "Upgrade to Business for team workspaces, shared projects, and admin controls.";
  }
  if (requiredPlan === "pro") {
    return "Upgrade to Pro to unlock this feature.";
  }
  return "Upgrade your plan to continue.";
}

function resetDateFrom(
  usage: UsageSnapshot,
  subscription: SubscriptionSnapshot
): string {
  return usage.periodEnd || subscription.currentPeriodEnd;
}

function checkSubscriptionStatus(
  subscription: SubscriptionSnapshot
): GateDenial | null {
  const status = subscription.status;
  const trialEnd = subscription.trialEnd
    ? new Date(subscription.trialEnd).getTime()
    : null;

  if (status === "trialing") {
    if (trialEnd != null && Number.isFinite(trialEnd) && trialEnd <= Date.now()) {
      return denial({
        code: "TRIAL_EXPIRED",
        status: 403,
        error: "Your trial has expired",
        message: "Your trial has expired. Upgrade to keep using premium features.",
        currentPlan: subscription.planId,
        trialEnd: subscription.trialEnd,
        subscriptionStatus: status,
        resetDate: subscription.currentPeriodEnd,
        upgradeHint: upgradeHint("pro"),
        requiredPlan: "pro",
      });
    }
    return null;
  }

  if (status === "active") return null;

  // Free fallback after cancel is stored as active+free by SubscriptionService.
  // Any other non-active status blocks premium execution.
  if (
    status === "past_due" ||
    status === "paused" ||
    status === "incomplete" ||
    status === "canceled"
  ) {
    return denial({
      code: "SUBSCRIPTION_INACTIVE",
      status: 403,
      error: `Subscription is ${status}`,
      message:
        status === "past_due"
          ? "Your subscription payment is past due. Update billing to continue."
          : status === "paused"
            ? "Your subscription is paused. Resume it to continue."
            : "Your subscription is not active. Upgrade or resume to continue.",
      currentPlan: subscription.planId,
      subscriptionStatus: status,
      trialEnd: subscription.trialEnd,
      resetDate: subscription.currentPeriodEnd,
      upgradeHint: upgradeHint("pro"),
      requiredPlan: "pro",
    });
  }

  return null;
}

/** Short-lived plan/subscription context cache (BE-M4). */
const CONTEXT_CACHE_TTL_MS = 10_000;
const CONTEXT_CACHE_MAX = 256;
type CachedContext = {
  expires: number;
  value: {
    subscription: SubscriptionSnapshot;
    plan: PlanSnapshot;
    usage: UsageSnapshot;
    remaining: QuotaRemaining[];
    features: FeatureKey[];
  };
};
const contextCache = new Map<string, CachedContext>();

function pruneContextCache(now = Date.now()) {
  for (const [key, entry] of contextCache) {
    if (entry.expires <= now) contextCache.delete(key);
  }
  while (contextCache.size > CONTEXT_CACHE_MAX) {
    const oldest = contextCache.keys().next().value;
    if (oldest === undefined) break;
    contextCache.delete(oldest);
  }
}

export class FeatureGate {
  async resolveContext(userId: string): Promise<{
    subscription: SubscriptionSnapshot;
    plan: PlanSnapshot;
    usage: UsageSnapshot;
    remaining: QuotaRemaining[];
    features: FeatureKey[];
  }> {
    const key = String(userId);
    const now = Date.now();
    const hit = contextCache.get(key);
    if (hit && hit.expires > now) {
      return hit.value;
    }

    try {
      const subscription = await subscriptionService.getOrCreate(userId);
      const plan =
        (await planService.getPlan(subscription.planId)) ||
        (await planService.getPlan("free"));
      if (!plan) throw new Error("Default Free plan missing");
      const usage = await usageService.getUsage(userId);
      const remaining = usageService.computeRemaining(usage.metrics, plan.quotas);
      const features = featuresForPlan(plan.planId);
      const value = { subscription, plan, usage, remaining, features };
      contextCache.set(key, { expires: now + CONTEXT_CACHE_TTL_MS, value });
      if (contextCache.size > CONTEXT_CACHE_MAX) pruneContextCache(now);
      return value;
    } catch (err) {
      contextCache.delete(key);
      throw err;
    }
  }

  async getEntitlements(userId: string): Promise<Entitlements> {
    const ctx = await this.resolveContext(userId);
    const featureFlags = Object.fromEntries(
      FEATURE_KEYS.map((k) => [k, ctx.features.includes(k)])
    ) as Record<FeatureKey, boolean>;
    const trialActive =
      ctx.subscription.status === "trialing" &&
      (!ctx.subscription.trialEnd ||
        new Date(ctx.subscription.trialEnd).getTime() > Date.now());
    return {
      planId: ctx.plan.planId,
      planName: ctx.plan.name,
      features: ctx.features,
      featureFlags,
      quotas: ctx.plan.quotas,
      remaining: ctx.remaining,
      usage: ctx.usage,
      subscription: ctx.subscription,
      trialActive,
      resetDate: resetDateFrom(ctx.usage, ctx.subscription),
    };
  }

  hasFeature(planId: PlanId | string, feature: FeatureKey): boolean {
    if (gatingDisabled()) return true;
    return planMeetsMinimum(planId, FEATURE_MIN_PLAN[feature]);
  }

  private async allowAll(userId: string): Promise<GateAllow> {
    const ctx = await this.resolveContext(String(userId));
    return {
      ok: true,
      allowed: true,
      planId: ctx.plan.planId,
      plan: ctx.plan,
      subscription: ctx.subscription,
      usage: ctx.usage,
      remaining: ctx.remaining,
      features: FEATURE_KEYS.slice(),
    };
  }

  /**
   * Subscription + trial gate shared by feature/quota checks.
   */
  async checkSubscription(
    userId: string | null | undefined
  ): Promise<GateResult> {
    if (!userId) {
      return denial({
        code: "AUTH_REQUIRED",
        status: 401,
        error: "Authentication required",
        message: "Authentication required",
      });
    }

    const ctx = await this.resolveContext(String(userId));
    if (gatingDisabled()) {
      return {
        ok: true,
        allowed: true,
        planId: ctx.plan.planId,
        plan: ctx.plan,
        subscription: ctx.subscription,
        usage: ctx.usage,
        remaining: ctx.remaining,
        features: FEATURE_KEYS.slice(),
      };
    }

    // Free active users always pass subscription checks.
    if (ctx.subscription.planId === "free" && ctx.subscription.status === "active") {
      return {
        ok: true,
        allowed: true,
        planId: ctx.plan.planId,
        plan: ctx.plan,
        subscription: ctx.subscription,
        usage: ctx.usage,
        remaining: ctx.remaining,
        features: ctx.features,
      };
    }

    const subDenial = checkSubscriptionStatus(ctx.subscription);
    if (subDenial) {
      subDenial.resetDate = resetDateFrom(ctx.usage, ctx.subscription);
      return subDenial;
    }

    return {
      ok: true,
      allowed: true,
      planId: ctx.plan.planId,
      plan: ctx.plan,
      subscription: ctx.subscription,
      usage: ctx.usage,
      remaining: ctx.remaining,
      features: ctx.features,
    };
  }

  async checkFeature(
    userId: string | null | undefined,
    feature: FeatureKey
  ): Promise<GateResult> {
    if (!userId) {
      return denial({
        code: "AUTH_REQUIRED",
        status: 401,
        error: "Authentication required",
        message: "Authentication required",
        feature,
      });
    }

    if (!isFeatureKey(feature)) {
      return denial({
        code: "FEATURE_DISABLED",
        status: 400,
        error: `Unknown feature: ${feature}`,
        message: `Unknown feature: ${feature}`,
      });
    }

    if (gatingDisabled()) return this.allowAll(String(userId));

    const subResult = await this.checkSubscription(userId);
    if (!subResult.ok) {
      return { ...subResult, feature };
    }

    const requiredPlan = FEATURE_MIN_PLAN[feature];
    if (!planMeetsMinimum(subResult.planId, requiredPlan)) {
      return denial({
        code: "PLAN_REQUIRED",
        status: 403,
        error: `${feature} requires the ${requiredPlan} plan or higher`,
        message: `${feature} requires the ${requiredPlan} plan or higher`,
        feature,
        requiredPlan,
        currentPlan: subResult.planId,
        resetDate: resetDateFrom(subResult.usage, subResult.subscription),
        upgradeHint: upgradeHint(requiredPlan),
      });
    }

    return subResult;
  }

  async checkQuota(
    userId: string | null | undefined,
    metric: UsageMetric,
    quantity = 1
  ): Promise<GateResult> {
    if (!userId) {
      return denial({
        code: "AUTH_REQUIRED",
        status: 401,
        error: "Authentication required",
        message: "Authentication required",
        metric,
      });
    }

    if (!usageService.isMetric(metric)) {
      return denial({
        code: "FEATURE_DISABLED",
        status: 400,
        error: `Unknown usage metric: ${metric}`,
        message: `Unknown usage metric: ${metric}`,
        metric,
      });
    }

    const qty = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
    const subResult = await this.checkSubscription(userId);
    if (!subResult.ok) {
      return { ...subResult, metric };
    }

    if (gatingDisabled()) return subResult;

    const row = subResult.remaining.find((r) => r.metric === metric);
    const resetDate = resetDateFrom(subResult.usage, subResult.subscription);

    if (!row) {
      return denial({
        code: "QUOTA_EXCEEDED",
        status: 402,
        error: `No quota configured for ${metric}`,
        message: `No quota configured for ${metric}`,
        metric,
        currentPlan: subResult.planId,
        resetDate,
      });
    }

    if (row.unlimited) return subResult;

    // Hard lock: limit 0 means feature unavailable on this plan.
    if (row.limit === 0 || (row.remaining != null && row.remaining < qty)) {
      const requiredPlan: PlanId =
        subResult.planId === "free"
          ? "pro"
          : subResult.planId === "pro"
            ? "business"
            : "enterprise";
      return denial({
        code: "QUOTA_EXCEEDED",
        status: 402,
        error: `Monthly ${metric} quota exceeded`,
        message:
          row.limit === 0
            ? `Your ${subResult.plan.name} plan does not include ${metric.replace(/_/g, " ")}.`
            : `You've used ${row.used} of ${row.limit} ${metric.replace(/_/g, " ")} this month.`,
        metric,
        currentPlan: subResult.planId,
        requiredPlan,
        used: row.used,
        limit: row.limit,
        remaining: row.remaining,
        resetDate,
        upgradeHint: upgradeHint(requiredPlan),
      });
    }

    return subResult;
  }

  /**
   * Combined subscription + feature + associated quota check.
   * Preferred entry point for UsageGuard.
   */
  async checkAccess(
    userId: string | null | undefined,
    feature: FeatureKey,
    quantity = 1
  ): Promise<GateResult> {
    const featureResult = await this.checkFeature(userId, feature);
    if (!featureResult.ok) return featureResult;

    const metric = FEATURE_QUOTA_METRIC[feature];
    if (!metric) return featureResult;

    return this.checkQuota(userId, metric, quantity);
  }

  /** Throw-style helper for tools / services (non-Express). */
  async assertAccess(
    userId: string | null | undefined,
    feature: FeatureKey,
    quantity = 1
  ): Promise<GateAllow> {
    const result = await this.checkAccess(userId, feature, quantity);
    if (!result.ok) {
      const err = new Error(result.message) as Error & {
        status?: number;
        code?: string;
        gate?: GateDenial;
      };
      err.status = result.status;
      err.code = result.code;
      err.gate = result;
      throw err;
    }
    return result;
  }

  async assertQuota(
    userId: string | null | undefined,
    metric: UsageMetric,
    quantity = 1
  ): Promise<GateAllow> {
    const result = await this.checkQuota(userId, metric, quantity);
    if (!result.ok) {
      const err = new Error(result.message) as Error & {
        status?: number;
        code?: string;
        gate?: GateDenial;
      };
      err.status = result.status;
      err.code = result.code;
      err.gate = result;
      throw err;
    }
    return result;
  }
}

export const featureGate = new FeatureGate();
