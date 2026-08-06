import { createOpenAICompatibleProvider } from "../shared/openaiCompatible.ts";

export function createGroqProvider() {
  return createOpenAICompatibleProvider({
    id: "groq",
    displayName: "Groq",
    apiKeyEnv: "GROQ_API_KEY",
    defaultBaseURL: "https://api.groq.com/openai/v1",
    models: [
      {
        id: "llama-3.3-70b-versatile",
        displayName: "Llama 3.3 70B (Groq)",
        capabilities: ["chat", "streaming", "tools", "fast"],
        contextWindow: 128_000,
      },
      {
        id: "llama-3.1-8b-instant",
        displayName: "Llama 3.1 8B Instant (Groq)",
        capabilities: ["chat", "streaming", "tools", "fast"],
        contextWindow: 128_000,
      },
      {
        id: "qwen/qwen3-32b",
        displayName: "Qwen3 32B (Groq)",
        capabilities: ["chat", "streaming", "tools", "fast", "coding"],
        contextWindow: 128_000,
      },
    ],
  });
}
