import { createOpenAICompatibleProvider } from "../shared/openaiCompatible.ts";

export function createOpenAIProvider() {
  return createOpenAICompatibleProvider({
    id: "openai",
    displayName: "OpenAI",
    apiKeyEnv: "OPENAI_API_KEY",
    models: [
      {
        id: "gpt-4o",
        displayName: "GPT-4o",
        capabilities: ["chat", "streaming", "vision", "tools", "creative", "coding"],
        contextWindow: 128_000,
      },
      {
        id: "gpt-4o-mini",
        displayName: "GPT-4o Mini",
        capabilities: ["chat", "streaming", "vision", "tools", "fast", "creative"],
        contextWindow: 128_000,
      },
      {
        id: "gpt-4.1",
        displayName: "GPT-4.1",
        capabilities: ["chat", "streaming", "vision", "tools", "coding", "reasoning"],
        contextWindow: 1_000_000,
      },
      {
        id: "o4-mini",
        displayName: "o4-mini",
        capabilities: ["chat", "streaming", "tools", "reasoning", "coding"],
        contextWindow: 200_000,
      },
    ],
  });
}
