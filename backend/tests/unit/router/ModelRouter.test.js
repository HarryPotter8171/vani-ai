import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ModelRouter } from "../../../router/ModelRouter.ts";
import { ProviderRegistry, resetProvidersForTests } from "../../../router/ProviderRegistry.ts";

describe("router/ModelRouter", () => {
  let snapshot;
  const ENV_KEYS = [
    "VANI_AUTO_ROUTE",
    "VANI_CHAT_MODEL",
    "GOOGLE_CLOUD_PROJECT",
    "GOOGLE_CLOUD_LOCATION",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GROQ_API_KEY",
    "OPENROUTER_API_KEY",
    "OLLAMA_BASE_URL",
    "VANI_E2E_MODE",
  ];

  beforeEach(() => {
    snapshot = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.GOOGLE_CLOUD_PROJECT = "test-proj";
    process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
    process.env.VANI_E2E_MODE = "true";
    resetProvidersForTests();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (snapshot[key] === undefined) delete process.env[key];
      else process.env[key] = snapshot[key];
    }
    resetProvidersForTests();
  });

  it("defaults to Gemini when no model is requested", () => {
    const router = new ModelRouter(new ProviderRegistry());
    const decision = router.resolve({});
    expect(decision.model.provider).toBe("gemini");
    expect(decision.reason).toMatch(/gemini|default/);
  });

  it("resolves legacy model value 'gemini'", () => {
    const router = new ModelRouter(new ProviderRegistry());
    const decision = router.resolve({ model: "gemini" });
    expect(decision.model.provider).toBe("gemini");
  });

  it("routes coding intent to Anthropic when configured", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    resetProvidersForTests();
    const router = new ModelRouter(new ProviderRegistry());
    const decision = router.resolve({
      model: "auto",
      userMessage: "Please debug this TypeScript compile error in my React code",
    });
    expect(decision.model.provider).toBe("anthropic");
    expect(decision.reason).toMatch(/auto:coding/);
  });

  it("routes fast intent to Groq when configured", () => {
    process.env.GROQ_API_KEY = "gsk-test";
    resetProvidersForTests();
    const router = new ModelRouter(new ProviderRegistry());
    const decision = router.resolve({
      model: "auto",
      userMessage: "Give me a quick tl;dr of this paragraph",
    });
    expect(decision.model.provider).toBe("groq");
  });

  it("routes creative writing to OpenAI when configured", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    resetProvidersForTests();
    const router = new ModelRouter(new ProviderRegistry());
    const decision = router.resolve({
      model: "auto",
      userMessage: "Write a creative short story about a lighthouse",
    });
    expect(decision.model.provider).toBe("openai");
  });

  it("honors explicit user-selected model key", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    resetProvidersForTests();
    const router = new ModelRouter(new ProviderRegistry());
    const decision = router.resolve({ model: "openai/gpt-4o-mini" });
    expect(decision.model.key).toBe("openai/gpt-4o-mini");
    expect(decision.reason).toBe("user_selected");
  });

  it("builds fallbacks excluding the primary provider", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    resetProvidersForTests();
    const router = new ModelRouter(new ProviderRegistry());
    const decision = router.resolve({ model: "gemini" });
    expect(decision.fallbacks.every((f) => f.provider !== "gemini")).toBe(true);
    expect(decision.fallbacks.length).toBeGreaterThan(0);
  });
});
