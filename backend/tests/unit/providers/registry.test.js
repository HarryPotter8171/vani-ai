import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getAllProviders,
  resetProvidersForTests,
} from "../../../providers/index.ts";
import { providerRegistry } from "../../../router/ProviderRegistry.ts";

describe("providers registry", () => {
  let snapshot;

  beforeEach(() => {
    snapshot = {
      GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
      GOOGLE_CLOUD_LOCATION: process.env.GOOGLE_CLOUD_LOCATION,
      VANI_E2E_MODE: process.env.VANI_E2E_MODE,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    };
    process.env.GOOGLE_CLOUD_PROJECT = "p";
    process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
    process.env.VANI_E2E_MODE = "true";
    delete process.env.OPENAI_API_KEY;
    resetProvidersForTests();
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(snapshot)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetProvidersForTests();
  });

  it("registers all six providers", () => {
    const ids = getAllProviders().map((p) => p.id).sort();
    expect(ids).toEqual([
      "anthropic",
      "gemini",
      "groq",
      "ollama",
      "openai",
      "openrouter",
    ]);
  });

  it("lists Gemini models as enabled when configured", () => {
    const models = providerRegistry.listModels({ configuredOnly: true });
    expect(models.some((m) => m.provider === "gemini")).toBe(true);
    expect(models.every((m) => m.enabled)).toBe(true);
  });

  it("does not list OpenAI models as configured without a key", () => {
    const models = providerRegistry.listModels({ configuredOnly: true });
    expect(models.some((m) => m.provider === "openai")).toBe(false);
  });
});
