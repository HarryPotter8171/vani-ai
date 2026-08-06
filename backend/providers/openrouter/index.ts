import { createOpenAICompatibleProvider } from "../shared/openaiCompatible.ts";

export function createOpenRouterProvider() {
  return createOpenAICompatibleProvider({
    id: "openrouter",
    displayName: "OpenRouter",
    apiKeyEnv: "OPENROUTER_API_KEY",
    defaultBaseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: () => ({
      "HTTP-Referer":
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.APP_URL ||
        "https://vani.ai",
      "X-Title": "VANI AI",
    }),
    models: [
      {
        id: "anthropic/claude-sonnet-4",
        displayName: "Claude Sonnet 4 (via OpenRouter)",
        capabilities: ["chat", "streaming", "vision", "tools", "coding", "reasoning"],
        contextWindow: 200_000,
      },
      {
        id: "openai/gpt-4o",
        displayName: "GPT-4o (via OpenRouter)",
        capabilities: ["chat", "streaming", "vision", "tools", "creative"],
        contextWindow: 128_000,
      },
      {
        id: "google/gemini-2.5-flash",
        displayName: "Gemini 2.5 Flash (via OpenRouter)",
        capabilities: ["chat", "streaming", "vision", "tools", "fast", "reasoning"],
        contextWindow: 1_000_000,
      },
      {
        id: "meta-llama/llama-3.3-70b-instruct",
        displayName: "Llama 3.3 70B (via OpenRouter)",
        capabilities: ["chat", "streaming", "tools", "fast"],
        contextWindow: 128_000,
      },
    ],
  });
}
