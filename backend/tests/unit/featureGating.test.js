import { describe, expect, it } from "vitest";
import {
  FEATURE_MIN_PLAN,
  FEATURE_QUOTA_METRIC,
  featuresForPlan,
  planMeetsMinimum,
} from "../../billing/featureMatrix.ts";
import { featureGate } from "../../billing/FeatureGate.ts";
import { DEFAULT_PLAN_DEFS } from "../../billing/PlanService.ts";

describe("feature matrix", () => {
  it("locks premium features behind Pro / Business", () => {
    expect(FEATURE_MIN_PLAN.chat).toBe("free");
    expect(FEATURE_MIN_PLAN.image_generation).toBe("free");
    expect(FEATURE_MIN_PLAN.research).toBe("free");
    expect(FEATURE_MIN_PLAN.voice).toBe("free");
    expect(FEATURE_MIN_PLAN.canvas).toBe("free");
    expect(FEATURE_MIN_PLAN.file_upload).toBe("free");
    expect(FEATURE_MIN_PLAN.browser).toBe("pro");
    expect(FEATURE_MIN_PLAN.agents).toBe("pro");
    expect(FEATURE_MIN_PLAN.code_interpreter).toBe("pro");
    expect(FEATURE_MIN_PLAN.mcp).toBe("pro");
    expect(FEATURE_MIN_PLAN.priority_routing).toBe("pro");
    expect(FEATURE_MIN_PLAN.teams).toBe("business");
    expect(FEATURE_MIN_PLAN.shared_projects).toBe("business");
    expect(FEATURE_MIN_PLAN.admin).toBe("business");
  });

  it("maps features to quota metrics where applicable", () => {
    expect(FEATURE_QUOTA_METRIC.chat).toBe("chat_requests");
    expect(FEATURE_QUOTA_METRIC.image_generation).toBe("image_generation");
    expect(FEATURE_QUOTA_METRIC.research).toBe("research_runs");
    expect(FEATURE_QUOTA_METRIC.voice).toBe("voice_minutes");
    expect(FEATURE_QUOTA_METRIC.browser).toBe("browser_sessions");
    expect(FEATURE_QUOTA_METRIC.code_interpreter).toBe("code_executions");
    expect(FEATURE_QUOTA_METRIC.file_upload).toBe("file_storage_bytes");
    expect(FEATURE_QUOTA_METRIC.agents).toBeUndefined();
    expect(FEATURE_QUOTA_METRIC.mcp).toBeUndefined();
  });

  it("lists features for each plan rank", () => {
    const free = featuresForPlan("free");
    expect(free).toContain("chat");
    expect(free).toContain("research");
    expect(free).toContain("voice");
    expect(free).toContain("canvas");
    expect(free).not.toContain("browser");
    expect(free).not.toContain("agents");
    expect(free).not.toContain("mcp");
    expect(free).not.toContain("teams");

    const pro = featuresForPlan("pro");
    expect(pro).toEqual(
      expect.arrayContaining([
        "voice",
        "browser",
        "agents",
        "code_interpreter",
        "mcp",
        "priority_routing",
      ])
    );
    expect(pro).not.toContain("teams");

    const business = featuresForPlan("business");
    expect(business).toEqual(
      expect.arrayContaining(["teams", "shared_projects", "admin", "agents"])
    );

    const enterprise = featuresForPlan("enterprise");
    expect(enterprise).toEqual(
      expect.arrayContaining(["teams", "admin", "agents", "voice"])
    );
  });

  it("compares plan ranks correctly", () => {
    expect(planMeetsMinimum("pro", "pro")).toBe(true);
    expect(planMeetsMinimum("business", "pro")).toBe(true);
    expect(planMeetsMinimum("free", "pro")).toBe(false);
    expect(planMeetsMinimum("pro", "enterprise")).toBe(false);
    expect(planMeetsMinimum("business", "business")).toBe(true);
    expect(planMeetsMinimum("enterprise", "enterprise")).toBe(true);
  });
});

describe("FeatureGate helpers", () => {
  it("denies unauthenticated feature checks", async () => {
    const result = await featureGate.checkFeature(null, "voice");
    expect(result.ok).toBe(false);
    expect(result.code).toBe("AUTH_REQUIRED");
    expect(result.status).toBe(401);
  });

  it("hasFeature respects plan ranks", () => {
    expect(featureGate.hasFeature("free", "chat")).toBe(true);
    expect(featureGate.hasFeature("free", "voice")).toBe(true);
    expect(featureGate.hasFeature("free", "browser")).toBe(false);
    expect(featureGate.hasFeature("pro", "agents")).toBe(true);
    expect(featureGate.hasFeature("pro", "teams")).toBe(false);
    expect(featureGate.hasFeature("business", "admin")).toBe(true);
    expect(featureGate.hasFeature("enterprise", "admin")).toBe(true);
  });

  it("keeps Sprint 2 Free / Pro / Business / Enterprise catalog", () => {
    const free = DEFAULT_PLAN_DEFS.find((p) => p.planId === "free");
    const pro = DEFAULT_PLAN_DEFS.find((p) => p.planId === "pro");
    const business = DEFAULT_PLAN_DEFS.find((p) => p.planId === "business");
    expect(free.quotas.chat_requests).toBe(100);
    expect(free.quotas.image_generation).toBe(20);
    expect(free.quotas.voice_minutes).toBe(10);
    expect(free.quotas.research_runs).toBe(5);
    expect(free.quotas.browser_sessions).toBe(0);
    expect(free.quotas.code_executions).toBe(0);
    expect(pro.quotas.chat_requests).toBe(-1);
    expect(pro.quotas.code_executions).toBe(-1);
    expect(pro.features).toEqual(
      expect.arrayContaining(["Priority model routing", "MCP", "Code Interpreter"])
    );
    expect(business.features).toEqual(
      expect.arrayContaining(["Team workspaces", "Shared projects", "Admin controls"])
    );
  });
});
