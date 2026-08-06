/**
 * Feature gating — re-exports UsageGuard (Sprint 2 canonical middleware).
 * Prefer importing from `./usageGuard.js` in new code.
 */

export {
  usageGuard,
  usageGuardFeature,
  usageGuardQuota,
  usageGuardPlan,
  loadEntitlements,
  sendGateDenial,
  sendDenial,
  requireAccess,
  requireFeature,
  requireQuota,
  requirePlan,
  featureGate,
} from "./usageGuard.js";
