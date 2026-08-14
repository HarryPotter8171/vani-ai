/**
 * UsageGuard — single middleware for premium feature enforcement.
 *
 * Before executing a premium feature, checks:
 *   1. Authentication
 *   2. Subscription / trial status
 *   3. Plan entitlement
 *   4. Remaining monthly quota
 *
 * Use after requireAuth:
 *   router.post("/", usageGuard("chat"), createOrUpdateChat);
 *   router.use(usageGuardFeature("browser"));
 *   router.post("/upload", usageGuard("file_upload", (req) => bytes), upload);
 */

import { userIdFromReq } from "./auth.js";
import { featureGate } from "../billing/FeatureGate.ts";
import { isFeatureKey } from "../billing/featureMatrix.ts";
import { toPublicErrorMessage } from "../utils/errors.js";

/** Structured denial payload — clients show remaining / reset / upgrade CTA. */
export function sendGateDenial(res, denial) {
  return res.status(denial.status || 403).json({
    error: denial.error,
    message: denial.message,
    code: denial.code,
    feature: denial.feature || null,
    metric: denial.metric || null,
    requiredPlan: denial.requiredPlan || null,
    currentPlan: denial.currentPlan || null,
    used: denial.used ?? null,
    limit: denial.limit ?? null,
    remaining: denial.remaining ?? null,
    resetDate: denial.resetDate || null,
    trialEnd: denial.trialEnd || null,
    subscriptionStatus: denial.subscriptionStatus || null,
    upgradeHint: denial.upgradeHint || null,
  });
}

function attachGate(req, result) {
  req.gate = result;
  req.plan = result.plan;
  req.subscription = result.subscription;
  req.usage = result.usage;
  req.remaining = result.remaining;
}

/**
 * Attach entitlements to req for downstream handlers (cached per request).
 */
export async function loadEntitlements(req, res, next) {
  try {
    const userId = userIdFromReq(req);
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const entitlements = await featureGate.getEntitlements(String(userId));
    req.entitlements = entitlements;
    req.plan = {
      planId: entitlements.planId,
      name: entitlements.planName,
      quotas: entitlements.quotas,
    };
    req.subscription = entitlements.subscription;
    req.usage = entitlements.usage;
    req.remaining = entitlements.remaining;
    return next();
  } catch (err) {
    console.error("[usage-guard]", err);
    return res.status(500).json({
      error: toPublicErrorMessage(err, "Unable to resolve plan entitlements"),
    });
  }
}

/**
 * Primary guard: subscription + feature + quota (when a meter exists).
 * @param {string} feature - FeatureKey
 * @param {number|((req)=>number)} [quantity=1]
 */
export function usageGuard(feature, quantity = 1) {
  if (!isFeatureKey(feature)) {
    throw new Error(`usageGuard: unknown feature "${feature}"`);
  }
  return async function usageGuardMiddleware(req, res, next) {
    try {
      const userId = userIdFromReq(req);
      const qty =
        typeof quantity === "function" ? Number(quantity(req)) || 1 : quantity;
      const result = await featureGate.checkAccess(
        userId ? String(userId) : null,
        feature,
        qty
      );
      if (!result.ok) return sendGateDenial(res, result);
      attachGate(req, result);
      return next();
    } catch (err) {
      console.error("[usage-guard]", err);
      // Never crash the request with an unhandled throw — structured 500.
      return res.status(500).json({
        error: toPublicErrorMessage(err, "Usage check failed"),
        code: "USAGE_GUARD_ERROR",
      });
    }
  };
}

/** Feature entitlement only (no quota meter). */
export function usageGuardFeature(feature) {
  if (!isFeatureKey(feature)) {
    throw new Error(`usageGuardFeature: unknown feature "${feature}"`);
  }
  return async function usageGuardFeatureMiddleware(req, res, next) {
    try {
      const userId = userIdFromReq(req);
      const result = await featureGate.checkFeature(
        userId ? String(userId) : null,
        feature
      );
      if (!result.ok) return sendGateDenial(res, result);
      attachGate(req, result);
      return next();
    } catch (err) {
      console.error("[usage-guard]", err);
      return res.status(500).json({
        error: toPublicErrorMessage(err, "Feature check failed"),
        code: "USAGE_GUARD_ERROR",
      });
    }
  };
}

/** Remaining monthly quota for a usage metric. */
export function usageGuardQuota(metric, quantity = 1) {
  return async function usageGuardQuotaMiddleware(req, res, next) {
    try {
      const userId = userIdFromReq(req);
      const qty =
        typeof quantity === "function" ? Number(quantity(req)) || 1 : quantity;
      const result = await featureGate.checkQuota(
        userId ? String(userId) : null,
        metric,
        qty
      );
      if (!result.ok) return sendGateDenial(res, result);
      attachGate(req, result);
      return next();
    } catch (err) {
      console.error("[usage-guard]", err);
      return res.status(500).json({
        error: toPublicErrorMessage(err, "Quota check failed"),
        code: "USAGE_GUARD_ERROR",
      });
    }
  };
}

/** Require plan rank >= minPlanId. */
export function usageGuardPlan(minPlanId) {
  return async function usageGuardPlanMiddleware(req, res, next) {
    try {
      const userId = userIdFromReq(req);
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const entitlements = await featureGate.getEntitlements(String(userId));
      const { planMeetsMinimum } = await import("../billing/featureMatrix.ts");
      if (!planMeetsMinimum(entitlements.planId, minPlanId)) {
        return sendGateDenial(res, {
          status: 403,
          code: "PLAN_REQUIRED",
          error: `Requires the ${minPlanId} plan or higher`,
          message: `Requires the ${minPlanId} plan or higher`,
          requiredPlan: minPlanId,
          currentPlan: entitlements.planId,
          resetDate: entitlements.resetDate,
          upgradeHint:
            minPlanId === "enterprise"
              ? "Contact sales for an Enterprise plan."
              : minPlanId === "business"
                ? "Upgrade to Business for team workspaces and admin controls."
                : "Upgrade to Pro to unlock this feature.",
        });
      }
      req.entitlements = entitlements;
      req.subscription = entitlements.subscription;
      req.plan = {
        planId: entitlements.planId,
        name: entitlements.planName,
        quotas: entitlements.quotas,
      };
      return next();
    } catch (err) {
      console.error("[usage-guard]", err);
      return res.status(500).json({
        error: toPublicErrorMessage(err, "Plan check failed"),
        code: "USAGE_GUARD_ERROR",
      });
    }
  };
}

// Backward-compatible aliases (Sprint 1 names).
export const requireAccess = usageGuard;
export const requireFeature = usageGuardFeature;
export const requireQuota = usageGuardQuota;
export const requirePlan = usageGuardPlan;
export const sendDenial = sendGateDenial;

export { featureGate };
