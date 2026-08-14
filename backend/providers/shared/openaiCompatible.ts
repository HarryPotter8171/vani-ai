import OpenAI from "openai";
import type {
  ModelInfo,
  ProviderAdapter,
  ProviderHealth,
  ProviderId,
  ProviderStreamEvent,
  StreamChatRequest,
} from "../types.ts";
import {
  contentsToOpenAIMessages,
  toolsToOpenAI,
} from "./content.ts";

export interface OpenAICompatibleConfig {
  id: ProviderId;
  displayName: string;
  apiKeyEnv: string;
  baseURLEnv?: string;
  defaultBaseURL?: string;
  models: Omit<ModelInfo, "provider" | "key" | "enabled">[];
  /** Optional extra headers (e.g. OpenRouter HTTP-Referer). */
  defaultHeaders?: () => Record<string, string>;
  /** When true, treat missing API key as OK if base URL is set (Ollama). */
  allowMissingKey?: boolean;
}

function resolveBaseURL(cfg: OpenAICompatibleConfig): string | undefined {
  if (cfg.baseURLEnv && process.env[cfg.baseURLEnv]) {
    return process.env[cfg.baseURLEnv];
  }
  return cfg.defaultBaseURL;
}

export function createOpenAICompatibleProvider(
  cfg: OpenAICompatibleConfig
): ProviderAdapter {
  function getApiKey(): string {
    return (process.env[cfg.apiKeyEnv] || "").trim();
  }

  function isConfigured(): boolean {
    const key = getApiKey();
    const base = resolveBaseURL(cfg);
    if (cfg.allowMissingKey) return Boolean(base || key);
    return Boolean(key);
  }

  function getClient(): OpenAI {
    const apiKey = getApiKey() || (cfg.allowMissingKey ? "ollama" : "");
    return new OpenAI({
      apiKey,
      baseURL: resolveBaseURL(cfg),
      defaultHeaders: cfg.defaultHeaders?.(),
    });
  }

  return {
    id: cfg.id,
    displayName: cfg.displayName,
    isConfigured,
    listModels() {
      const configured = isConfigured();
      return cfg.models.map((m) => ({
        ...m,
        provider: cfg.id,
        key: `${cfg.id}/${m.id}`,
        enabled: configured,
      }));
    },
    async healthCheck(): Promise<ProviderHealth> {
      const checkedAt = new Date().toISOString();
      if (!isConfigured()) {
        return {
          provider: cfg.id,
          configured: false,
          healthy: false,
          error: "not configured",
          checkedAt,
        };
      }
      const start = performance.now();
      try {
        const client = getClient();
        // Lightweight probe — list models when available; otherwise a tiny chat.
        await client.models.list({ limit: 1 } as never).catch(async () => {
          await client.chat.completions.create({
            model: cfg.models[0]?.id || "unknown",
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1,
          });
        });
        return {
          provider: cfg.id,
          configured: true,
          healthy: true,
          latencyMs: Math.round(performance.now() - start),
          checkedAt,
        };
      } catch (err) {
        return {
          provider: cfg.id,
          configured: true,
          healthy: false,
          latencyMs: Math.round(performance.now() - start),
          error: err instanceof Error ? err.message : String(err),
          checkedAt,
        };
      }
    },
    async *streamChat(req: StreamChatRequest): AsyncGenerator<ProviderStreamEvent> {
      if (!isConfigured()) {
        yield {
          type: "error",
          error: "This feature is temporarily unavailable. Please try again later.",
          retryable: true,
        };
        return;
      }

      const client = getClient();
      const messages = contentsToOpenAIMessages(req.contents, req.systemInstruction);
      const tools =
        req.toolChoice !== "none" && req.tools?.length
          ? toolsToOpenAI(req.tools)
          : undefined;

      const forceTool =
        typeof req.toolChoice === "object" &&
        req.toolChoice?.type === "required" &&
        req.toolChoice.name
          ? req.toolChoice.name
          : null;

      const openAiToolChoice =
        req.toolChoice === "none"
          ? "none"
          : forceTool
            ? { type: "function", function: { name: forceTool } }
            : "auto";

      let stream;
      try {
        stream = await client.chat.completions.create({
          model: req.model,
          messages: messages as never,
          stream: true,
          stream_options: { include_usage: true },
          temperature: req.temperature,
          ...(tools?.length
            ? {
                tools,
                tool_choice: openAiToolChoice as never,
              }
            : {}),
        });
      } catch (err) {
        console.error(`[provider:${cfg.id}] stream failed:`, err);
        yield {
          type: "error",
          error: "We couldn't generate a response. Please try again.",
          retryable: true,
        };
        return;
      }

      /** Accumulate streamed tool call fragments by index. */
      const toolBuf = new Map<
        number,
        { id: string; name: string; args: string }
      >();

      for await (const chunk of stream) {
        if (req.signal && "aborted" in req.signal && req.signal.aborted) return;

        const choice = chunk.choices?.[0];
        const delta = choice?.delta;

        if (delta?.content) {
          yield { type: "delta", text: delta.content };
        }

        if (Array.isArray(delta?.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            const prev = toolBuf.get(idx) || { id: "", name: "", args: "" };
            if (tc.id) prev.id = tc.id;
            if (tc.function?.name) prev.name += tc.function.name;
            if (tc.function?.arguments) prev.args += tc.function.arguments;
            toolBuf.set(idx, prev);
          }
        }

        if (chunk.usage) {
          yield {
            type: "usage",
            usage: {
              inputTokens: chunk.usage.prompt_tokens || 0,
              outputTokens: chunk.usage.completion_tokens || 0,
              totalTokens: chunk.usage.total_tokens || 0,
            },
          };
        }

        if (choice?.finish_reason === "tool_calls" || toolBuf.size) {
          // Emit completed tool calls once the stream signals finish or ends.
          if (choice?.finish_reason === "tool_calls") {
            for (const [, tc] of toolBuf) {
              let args: Record<string, unknown> = {};
              try {
                args = tc.args ? JSON.parse(tc.args) : {};
              } catch {
                args = {};
              }
              yield {
                type: "tool_call",
                id: tc.id || tc.name,
                name: tc.name,
                args,
              };
            }
            toolBuf.clear();
          }
        }
      }

      // Flush any remaining tool buffers (some providers omit finish_reason).
      for (const [, tc] of toolBuf) {
        if (!tc.name) continue;
        let args: Record<string, unknown> = {};
        try {
          args = tc.args ? JSON.parse(tc.args) : {};
        } catch {
          args = {};
        }
        yield {
          type: "tool_call",
          id: tc.id || tc.name,
          name: tc.name,
          args,
        };
      }
    },
  };
}
