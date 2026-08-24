import { FunctionCallingConfigMode } from "@google/genai";
import { CHAT_MODEL, getGeminiClient } from "../../services/geminiClient.js";
import type {
  ModelInfo,
  ProviderAdapter,
  ProviderHealth,
  ProviderStreamEvent,
  StreamChatRequest,
} from "../types.ts";

const MODELS: Omit<ModelInfo, "provider" | "key" | "enabled">[] = [
  {
    id: "gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    capabilities: ["chat", "streaming", "vision", "tools", "reasoning", "fast"],
    contextWindow: 1_000_000,
  },
  {
    id: "gemini-2.5-pro",
    displayName: "Gemini 2.5 Pro",
    capabilities: ["chat", "streaming", "vision", "tools", "reasoning", "coding"],
    contextWindow: 1_000_000,
  },
  {
    id: "gemini-2.0-flash",
    displayName: "Gemini 2.0 Flash",
    capabilities: ["chat", "streaming", "vision", "tools", "fast"],
    contextWindow: 1_000_000,
  },
];

function collectFunctionCalls(chunk: unknown, bucket: Map<string, { name: string; args: Record<string, unknown>; id?: string }>) {
  const c = chunk as {
    functionCalls?: Array<{ name?: string; args?: Record<string, unknown>; id?: string }>;
    candidates?: Array<{ content?: { parts?: Array<{ functionCall?: { name?: string; args?: Record<string, unknown>; id?: string } }> } }>;
  };
  const calls = c.functionCalls;
  if (Array.isArray(calls)) {
    for (const fc of calls) {
      if (!fc?.name) continue;
      const key = fc.id || `${fc.name}:${JSON.stringify(fc.args || {})}`;
      bucket.set(key, { name: fc.name, args: fc.args || {}, id: fc.id });
    }
  }
  const parts = c.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return;
  for (const part of parts) {
    const fc = part.functionCall;
    if (!fc?.name) continue;
    const key = fc.id || `${fc.name}:${JSON.stringify(fc.args || {})}`;
    bucket.set(key, { name: fc.name, args: fc.args || {}, id: fc.id });
  }
}

export function createGeminiProvider(): ProviderAdapter {
  return {
    id: "gemini",
    displayName: "Google Gemini",
    isConfigured() {
      const hasGcp = Boolean(
        process.env.GOOGLE_CLOUD_PROJECT && process.env.GOOGLE_CLOUD_LOCATION
      );
      const hasApiKey = Boolean(
        process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY
      );
      
      if (!hasGcp && !hasApiKey) {
        throw new Error("Gemini provider is not configured: Missing GCP credentials or API Key.");
      }
      
      return hasGcp || hasApiKey || process.env.VANI_E2E_MODE === "true";
    },
    listModels() {
      const configured = this.isConfigured();
      const envModel = process.env.VANI_CHAT_MODEL;
      const list = [...MODELS];
      if (envModel && !list.some((m) => m.id === envModel)) {
        list.unshift({
          id: envModel,
          displayName: envModel,
          capabilities: ["chat", "streaming", "vision", "tools"],
        });
      }
      return list.map((m) => ({
        ...m,
        provider: "gemini" as const,
        key: `gemini/${m.id}`,
        enabled: configured,
      }));
    },
    async healthCheck(): Promise<ProviderHealth> {
      const checkedAt = new Date().toISOString();
      if (!this.isConfigured()) {
        return {
          provider: "gemini",
          configured: false,
          healthy: false,
          error: "not configured",
          checkedAt,
        };
      }
      const start = performance.now();
      try {
        // Construction + a no-op list proves the client boots. Full generate
        // would cost money; configuration + client init is enough for readiness.
        getGeminiClient();
        return {
          provider: "gemini",
          configured: true,
          healthy: true,
          latencyMs: Math.round(performance.now() - start),
          checkedAt,
        };
      } catch (err) {
        return {
          provider: "gemini",
          configured: true,
          healthy: false,
          error: err instanceof Error ? err.message : String(err),
          latencyMs: Math.round(performance.now() - start),
          checkedAt,
        };
      }
    },
    async *streamChat(req: StreamChatRequest): AsyncGenerator<ProviderStreamEvent> {
      if (!this.isConfigured()) {
        yield {
          type: "error",
          error: "This feature is temporarily unavailable. Please try again later.",
          retryable: true,
        };
        return;
      }

      const model = req.model || CHAT_MODEL;
      const declarations = (req.tools || []).map((t) => ({
        name: t.name,
        description: t.description,
        parametersJsonSchema: t.parametersJsonSchema,
      }));

      const forceTool =
        typeof req.toolChoice === "object" &&
        req.toolChoice?.type === "required" &&
        req.toolChoice.name
          ? req.toolChoice.name
          : null;

      const toolMode =
        req.toolChoice === "none"
          ? FunctionCallingConfigMode.NONE
          : forceTool
            ? FunctionCallingConfigMode.ANY
            : FunctionCallingConfigMode.AUTO;

      let stream;
      try {
        stream = await getGeminiClient().models.generateContentStream({
          model,
          contents: req.contents,
          config: {
            systemInstruction: req.systemInstruction,
            temperature: req.temperature,
            tools: declarations.length
              ? [{ functionDeclarations: declarations }]
              : undefined,
            toolConfig: declarations.length
              ? {
                  functionCallingConfig: {
                    mode: toolMode,
                    ...(forceTool ? { allowedFunctionNames: [forceTool] } : {}),
                  },
                }
              : undefined,
          },
        });
      } catch (err) {
        console.error("[provider:gemini] stream failed:", err);
        yield {
          type: "error",
          error: "We couldn't generate a response. Please try again.",
          retryable: true,
        };
        return;
      }

      const functionCalls = new Map<
        string,
        { name: string; args: Record<string, unknown>; id?: string }
      >();

      for await (const chunk of stream) {
        if (req.signal && "aborted" in req.signal && req.signal.aborted) return;
        const text = (chunk as { text?: string }).text;
        if (text) yield { type: "delta", text };
        collectFunctionCalls(chunk, functionCalls);

        const usage = (chunk as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } }).usageMetadata;
        if (usage) {
          yield {
            type: "usage",
            usage: {
              inputTokens: usage.promptTokenCount || 0,
              outputTokens: usage.candidatesTokenCount || 0,
              totalTokens: usage.totalTokenCount || 0,
            },
          };
        }
      }

      for (const fc of functionCalls.values()) {
        yield {
          type: "tool_call",
          id: fc.id || fc.name,
          name: fc.name,
          args: fc.args || {},
        };
      }
    },
  };
}

export { CHAT_MODEL };
