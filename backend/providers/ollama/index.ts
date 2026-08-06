import { createOpenAICompatibleProvider } from "../shared/openaiCompatible.ts";

export function createOllamaProvider() {
  return createOpenAICompatibleProvider({
    id: "ollama",
    displayName: "Ollama (Local)",
    apiKeyEnv: "OLLAMA_API_KEY",
    baseURLEnv: "OLLAMA_BASE_URL",
    defaultBaseURL: "http://127.0.0.1:11434/v1",
    allowMissingKey: true,
    models: [
      {
        id: "llama3.2",
        displayName: "Llama 3.2 (Ollama)",
        capabilities: ["chat", "streaming", "tools", "offline", "fast"],
        contextWindow: 128_000,
      },
      {
        id: "llama3.1",
        displayName: "Llama 3.1 (Ollama)",
        capabilities: ["chat", "streaming", "tools", "offline"],
        contextWindow: 128_000,
      },
      {
        id: "qwen2.5-coder",
        displayName: "Qwen2.5 Coder (Ollama)",
        capabilities: ["chat", "streaming", "tools", "coding", "offline"],
        contextWindow: 32_000,
      },
      {
        id: "llava",
        displayName: "LLaVA (Ollama Vision)",
        capabilities: ["chat", "streaming", "vision", "offline"],
        contextWindow: 32_000,
      },
    ],
  });
}
