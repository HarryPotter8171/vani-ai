import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAN_DEFS,
  planService,
  usageService,
  monthPeriod,
} from "../../billing/index.ts";

describe("Billing foundation", () => {
  it("defines Free, Pro, Business, Enterprise plans", () => {
    const ids = DEFAULT_PLAN_DEFS.map((p) => p.planId);
    expect(ids).toEqual(["free", "pro", "business", "enterprise"]);
  });

  it("exposes soft quotas on every plan", () => {
    for (const plan of DEFAULT_PLAN_DEFS) {
      expect(plan.quotas).toHaveProperty("chat_requests");
      expect(plan.quotas).toHaveProperty("tokens");
      expect(plan.quotas).toHaveProperty("image_generation");
      expect(plan.quotas).toHaveProperty("voice_minutes");
      expect(plan.quotas).toHaveProperty("research_runs");
      expect(plan.quotas).toHaveProperty("browser_sessions");
      expect(plan.quotas).toHaveProperty("code_executions");
      expect(plan.quotas).toHaveProperty("file_storage_bytes");
    }
  });

  it("computes remaining quota", () => {
    const remaining = usageService.computeRemaining(
      {
        chat_requests: 40,
        tokens: 1000,
        image_generation: 0,
        voice_minutes: 0,
        research_runs: 0,
        browser_sessions: 0,
        code_executions: 0,
        file_storage_bytes: 0,
      },
      {
        chat_requests: 50,
        tokens: -1,
        image_generation: 5,
        voice_minutes: 0,
        research_runs: 3,
        browser_sessions: 0,
        code_executions: 0,
        file_storage_bytes: 1000,
      }
    );
    const chat = remaining.find((r) => r.metric === "chat_requests");
    const tokens = remaining.find((r) => r.metric === "tokens");
    expect(chat?.remaining).toBe(10);
    expect(chat?.unlimited).toBe(false);
    expect(tokens?.unlimited).toBe(true);
  });

  it("gives Free limited quotas and Pro unlimited premium features", () => {
    const free = DEFAULT_PLAN_DEFS.find((p) => p.planId === "free");
    const pro = DEFAULT_PLAN_DEFS.find((p) => p.planId === "pro");
    const business = DEFAULT_PLAN_DEFS.find((p) => p.planId === "business");
    const enterprise = DEFAULT_PLAN_DEFS.find((p) => p.planId === "enterprise");
    expect(free.quotas.chat_requests).toBe(100);
    expect(free.quotas.image_generation).toBe(20);
    expect(free.quotas.research_runs).toBe(5);
    expect(free.quotas.voice_minutes).toBe(10);
    expect(free.quotas.browser_sessions).toBe(0);
    expect(free.quotas.code_executions).toBe(0);
    expect(pro.quotas.chat_requests).toBe(-1);
    expect(pro.quotas.voice_minutes).toBe(-1);
    expect(pro.features).toEqual(
      expect.arrayContaining(["Agents", "Code Interpreter", "Priority model routing"])
    );
    expect(business.features).toEqual(
      expect.arrayContaining(["Team workspaces", "Shared projects", "Admin controls"])
    );
    expect(enterprise.features).toEqual(
      expect.arrayContaining(["Unlimited usage", "Custom limits"])
    );
  });

  it("monthPeriod returns UTC month bounds", () => {
    const { start, end } = monthPeriod(new Date("2026-08-15T12:00:00.000Z"));
    expect(start.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("default plan id is free", () => {
    expect(planService.getDefaultPlanId()).toBe("free");
  });

  it("validates usage metrics", () => {
    expect(usageService.isMetric("chat_requests")).toBe(true);
    expect(usageService.isMetric("not_a_metric")).toBe(false);
  });
});
