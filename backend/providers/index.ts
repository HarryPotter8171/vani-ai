import { createGeminiProvider } from "./gemini/index.ts";
import { createOpenAIProvider } from "./openai/index.ts";
import { createAnthropicProvider } from "./anthropic/index.ts";
import { createOpenRouterProvider } from "./openrouter/index.ts";
import { createGroqProvider } from "./groq/index.ts";
import { createOllamaProvider } from "./ollama/index.ts";
import type { ProviderAdapter, ProviderId } from "./types.ts";

let cached: ProviderAdapter[] | null = null;

/** Build (once) the full provider catalog. */
export function getAllProviders(): ProviderAdapter[] {
  if (!cached) {
    cached = [
      createGeminiProvider(),
      createOpenAIProvider(),
      createAnthropicProvider(),
      createOpenRouterProvider(),
      createGroqProvider(),
      createOllamaProvider(),
    ];
  }
  return cached;
}

/** Test helper — clear singleton between unit tests. */
export function resetProvidersForTests() {
  cached = null;
}

export function getProvider(id: ProviderId): ProviderAdapter | null {
  return getAllProviders().find((p) => p.id === id) || null;
}

export type {
  ProviderAdapter,
  ProviderId,
  ModelInfo,
  ProviderHealth,
  StreamUsage,
  ContentMessage,
  ToolDeclaration,
  ProviderStreamEvent,
  StreamChatRequest,
  ModelCapability,
} from "./types.ts";
