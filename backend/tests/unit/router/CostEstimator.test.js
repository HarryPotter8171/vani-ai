import { describe, it, expect } from "vitest";
import {
  estimateCostUsd,
  estimateTokensFromText,
} from "../../../router/CostEstimator.ts";

describe("router/CostEstimator", () => {
  it("estimates tokens from text length", () => {
    expect(estimateTokensFromText("abcd")).toBe(1);
    expect(estimateTokensFromText("a".repeat(40))).toBe(10);
  });

  it("estimates USD cost for known model keys", () => {
    const cost = estimateCostUsd({
      modelKey: "openai/gpt-4o",
      provider: "openai",
      inputTokens: 1_000_000,
      outputTokens: 0,
    });
    expect(cost).toBe(2.5);
  });

  it("returns zero cost for local Ollama models", () => {
    const cost = estimateCostUsd({
      modelKey: "ollama/llama3.2",
      provider: "ollama",
      inputTokens: 50_000,
      outputTokens: 50_000,
    });
    expect(cost).toBe(0);
  });
});
