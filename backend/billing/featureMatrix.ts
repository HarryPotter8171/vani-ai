/**
 * Machine-readable feature entitlements by plan.
 * Marketing `plan.features[]` strings are display-only — gating uses this map.
 */

import type { PlanId, UsageMetric } from "./types.ts";

export type FeatureKey =
  | "chat"
  | "image_generation"
  | "research"
  | "voice"
  | "browser"
  | "agents"
  | "code_interpreter"
  | "mcp"
  | "canvas"
  | "file_upload"
  | "priority_routing"
  | "teams"
  | "shared_projects"
  | "admin";

export const FEATURE_KEYS: FeatureKey[] = [
  "chat",
  "image_generation",
  "research",
  "voice",
  "browser",
  "agents",
  "code_interpreter",
  "mcp",
  "canvas",
  "file_upload",
  "priority_routing",
  "teams",
  "shared_projects",
  "admin",
];

/** Minimum plan required to use a feature (by rank). */
export const FEATURE_MIN_PLAN: Record<FeatureKey, PlanId> = {
  chat: "free",
  image_generation: "free",
  research: "free",
  voice: "free",
  canvas: "free",
  file_upload: "free",
  browser: "pro",
  agents: "pro",
  code_interpreter: "pro",
  mcp: "pro",
  priority_routing: "pro",
  teams: "business",
  shared_projects: "business",
  admin: "business",
};

/** Usage metric consumed when exercising a feature (if any). */
export const FEATURE_QUOTA_METRIC: Partial<Record<FeatureKey, UsageMetric>> = {
  chat: "chat_requests",
  image_generation: "image_generation",
  research: "research_runs",
  voice: "voice_minutes",
  browser: "browser_sessions",
  code_interpreter: "code_executions",
  file_upload: "file_storage_bytes",
  // canvas / mcp / agents / priority_routing: plan-gated, no separate meter
};

export const PLAN_RANK: Record<PlanId, number> = {
  free: 0,
  pro: 1,
  business: 2,
  enterprise: 3,
};

export function isFeatureKey(value: unknown): value is FeatureKey {
  return typeof value === "string" && (FEATURE_KEYS as string[]).includes(value);
}

export function planMeetsMinimum(
  currentPlanId: PlanId | string,
  minPlanId: PlanId
): boolean {
  const current = PLAN_RANK[currentPlanId as PlanId];
  const required = PLAN_RANK[minPlanId];
  if (current == null || required == null) return false;
  return current >= required;
}

export function featuresForPlan(planId: PlanId | string): FeatureKey[] {
  return FEATURE_KEYS.filter((key) =>
    planMeetsMinimum(planId, FEATURE_MIN_PLAN[key])
  );
}
