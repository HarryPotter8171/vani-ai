import {
  getAllProviders,
  getProvider,
  resetProvidersForTests,
} from "../providers/index.ts";
import type {
  ModelInfo,
  ProviderAdapter,
  ProviderHealth,
  ProviderId,
} from "../providers/types.ts";

/**
 * Catalog of registered providers + models. Thin façade over providers/
 * so the router can swap implementations in tests.
 */
export class ProviderRegistry {
  listProviders(): ProviderAdapter[] {
    return getAllProviders();
  }

  get(id: ProviderId): ProviderAdapter | null {
    return getProvider(id);
  }

  listModels({ configuredOnly = false } = {}): ModelInfo[] {
    const models: ModelInfo[] = [];
    for (const provider of getAllProviders()) {
      for (const model of provider.listModels()) {
        if (configuredOnly && !model.enabled) continue;
        models.push(model);
      }
    }
    return models;
  }

  /** Resolve `provider/model`, bare model id, or legacy aliases. */
  resolveModelKey(input?: string | null): ModelInfo | null {
    const raw = (input || "").trim();
    if (!raw || raw === "auto") return null;

    // Legacy chat/project default.
    if (raw === "gemini") {
      return (
        this.listModels().find(
          (m) =>
            m.provider === "gemini" &&
            m.id === (process.env.VANI_CHAT_MODEL || "gemini-2.5-flash")
        ) ||
        this.listModels().find((m) => m.provider === "gemini") ||
        null
      );
    }

    const all = this.listModels();
    const byKey = all.find((m) => m.key === raw);
    if (byKey) return byKey;

    // Bare model id — prefer configured provider that owns it.
    const byIdConfigured = all.find((m) => m.id === raw && m.enabled);
    if (byIdConfigured) return byIdConfigured;
    const byId = all.find((m) => m.id === raw);
    if (byId) return byId;

    // provider/model where model itself contains slashes (OpenRouter).
    const slash = raw.indexOf("/");
    if (slash > 0) {
      const provider = raw.slice(0, slash) as ProviderId;
      const modelId = raw.slice(slash + 1);
      const match = all.find((m) => m.provider === provider && m.id === modelId);
      if (match) return match;
      // Synthesize an enabled entry if the provider is configured.
      const adapter = this.get(provider);
      if (adapter?.isConfigured()) {
        return {
          id: modelId,
          key: raw,
          provider,
          displayName: modelId,
          capabilities: ["chat", "streaming", "tools"],
          enabled: true,
        };
      }
    }

    return null;
  }

  async healthAll(): Promise<ProviderHealth[]> {
    const results = await Promise.all(
      getAllProviders().map((p) => p.healthCheck())
    );
    return results;
  }
}

export const providerRegistry = new ProviderRegistry();

export { resetProvidersForTests };
