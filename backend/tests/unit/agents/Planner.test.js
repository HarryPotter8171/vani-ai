import { describe, it, expect } from "vitest";
import { buildFallbackPlan } from "../../../agents/Planner.js";
import { AGENT_CONFIG } from "../../../agents/config.js";

describe("agents/Planner buildFallbackPlan", () => {
  it("adds a web_search step for research-flavored questions", () => {
    const steps = buildFallbackPlan("What is the latest news on AI regulation?", "general");
    expect(steps.some((s) => s.tool === "web_search")).toBe(true);
  });

  it("adds a weather step for weather questions", () => {
    const steps = buildFallbackPlan("What's the weather in Mumbai today?", "general");
    expect(steps.some((s) => s.tool === "weather")).toBe(true);
    const weatherStep = steps.find((s) => s.tool === "weather");
    expect(weatherStep.args.location.toLowerCase()).toContain("mumbai");
  });

  it("adds a current_time step for time/date questions", () => {
    const steps = buildFallbackPlan("What time is it right now?", "general");
    expect(steps.some((s) => s.tool === "current_time")).toBe(true);
  });

  it("adds a calculator step for arithmetic-looking requests", () => {
    const steps = buildFallbackPlan("calculate 12 * (4 + 3)", "general");
    expect(steps.some((s) => s.tool === "calculator")).toBe(true);
  });

  it("falls back to a generic analyze step when nothing matches", () => {
    const steps = buildFallbackPlan("Tell me a fun fact", "general");
    expect(steps.length).toBeGreaterThan(0);
    expect(steps[steps.length - 1].tool).toBeNull(); // final synthesis step
  });

  it("never proposes a tool the agent type doesn't have access to", () => {
    // coding agent has no web_search / weather tools
    const steps = buildFallbackPlan("what's the weather like, calculate 2+2", "coding");
    for (const step of steps) {
      if (step.tool) {
        expect([
          "calculator",
          "file_upload",
          "vision",
          "image_generation",
          "image_edit",
          "memory",
          "canvas",
          "current_time",
          "code_execution",
        ]).toContain(step.tool);
      }
    }
  });

  it("adds an image_generation step for generate-image requests", () => {
    const steps = buildFallbackPlan("Generate an image of a red bicycle", "general");
    expect(steps.some((s) => s.tool === "image_generation")).toBe(true);
  });

  it("adds an image_edit step for edit-this requests", () => {
    const steps = buildFallbackPlan("Edit this and make the sky purple", "general");
    expect(steps.some((s) => s.tool === "image_edit")).toBe(true);
  });

  it("selects image_edit (not image_generation) when an image is uploaded with edit intent", () => {
    const steps = buildFallbackPlan("change the pool water to red", "general", {
      hasImages: true,
    });
    expect(steps.some((s) => s.tool === "image_edit")).toBe(true);
    expect(steps.some((s) => s.tool === "image_generation")).toBe(false);
    expect(steps.find((s) => s.tool === "image_edit")?.title).toMatch(/Editing image/i);
  });

  it("selects image_generation only when there is no uploaded image", () => {
    const steps = buildFallbackPlan("Generate an image of a red bicycle", "general", {
      hasImages: false,
    });
    expect(steps.some((s) => s.tool === "image_generation")).toBe(true);
    expect(steps.some((s) => s.tool === "image_edit")).toBe(false);
  });

  it("always ends with a null-tool synthesis step", () => {
    const steps = buildFallbackPlan("search for cats", "general");
    expect(steps[steps.length - 1]).toMatchObject({ tool: null, title: "Generating answer..." });
  });

  it("caps steps at AGENT_CONFIG.maxPlanSteps", () => {
    const steps = buildFallbackPlan(
      "search calculate weather time now research latest news",
      "general"
    );
    expect(steps.length).toBeLessThanOrEqual(AGENT_CONFIG.maxPlanSteps);
  });
});
