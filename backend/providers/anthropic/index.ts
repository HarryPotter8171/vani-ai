import type {
  ModelInfo,
  ProviderAdapter,
  ProviderHealth,
  ProviderStreamEvent,
  StreamChatRequest,
} from "../types.ts";
import { contentsToAnthropic, toolsToAnthropic } from "../shared/content.ts";

const MODELS: Omit<ModelInfo, "provider" | "key" | "enabled">[] = [
  {
    id: "claude-sonnet-4-5",
    displayName: "Claude Sonnet 4.5",
    capabilities: ["chat", "streaming", "vision", "tools", "coding", "reasoning"],
    contextWindow: 200_000,
  },
  {
    id: "claude-sonnet-4-0",
    displayName: "Claude Sonnet 4",
    capabilities: ["chat", "streaming", "vision", "tools", "coding", "reasoning"],
    contextWindow: 200_000,
  },
  {
    id: "claude-haiku-4-5",
    displayName: "Claude Haiku 4.5",
    capabilities: ["chat", "streaming", "vision", "tools", "fast"],
    contextWindow: 200_000,
  },
  {
    id: "claude-opus-4-5",
    displayName: "Claude Opus 4.5",
    capabilities: ["chat", "streaming", "vision", "tools", "coding", "reasoning", "creative"],
    contextWindow: 200_000,
  },
];

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

export function createAnthropicProvider(): ProviderAdapter {
  function apiKey() {
    return (process.env.ANTHROPIC_API_KEY || "").trim();
  }

  return {
    id: "anthropic",
    displayName: "Anthropic Claude",
    isConfigured() {
      return Boolean(apiKey());
    },
    listModels() {
      const configured = this.isConfigured();
      return MODELS.map((m) => ({
        ...m,
        provider: "anthropic" as const,
        key: `anthropic/${m.id}`,
        enabled: configured,
      }));
    },
    async healthCheck(): Promise<ProviderHealth> {
      const checkedAt = new Date().toISOString();
      if (!this.isConfigured()) {
        return {
          provider: "anthropic",
          configured: false,
          healthy: false,
          error: "ANTHROPIC_API_KEY not set",
          checkedAt,
        };
      }
      const start = performance.now();
      try {
        const res = await fetch(ANTHROPIC_API, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey(),
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: MODELS[2]?.id || MODELS[0].id,
            max_tokens: 1,
            messages: [{ role: "user", content: "ping" }],
          }),
        });
        // 200 or 400-class from validation still proves auth/reachability;
        // 401/403 means misconfigured key.
        const healthy = res.status !== 401 && res.status !== 403;
        return {
          provider: "anthropic",
          configured: true,
          healthy,
          latencyMs: Math.round(performance.now() - start),
          error: healthy ? undefined : `HTTP ${res.status}`,
          checkedAt,
        };
      } catch (err) {
        return {
          provider: "anthropic",
          configured: true,
          healthy: false,
          latencyMs: Math.round(performance.now() - start),
          error: err instanceof Error ? err.message : String(err),
          checkedAt,
        };
      }
    },
    async *streamChat(req: StreamChatRequest): AsyncGenerator<ProviderStreamEvent> {
      if (!this.isConfigured()) {
        yield {
          type: "error",
          error: "Anthropic is not configured",
          retryable: true,
        };
        return;
      }

      const { system, messages } = contentsToAnthropic(
        req.contents,
        req.systemInstruction
      );
      const tools =
        req.toolChoice !== "none" && req.tools?.length
          ? toolsToAnthropic(req.tools)
          : undefined;

      const forceTool =
        typeof req.toolChoice === "object" &&
        req.toolChoice?.type === "required" &&
        req.toolChoice.name
          ? req.toolChoice.name
          : null;

      let anthropicToolChoice: { type: string; name?: string } | undefined;
      if (req.toolChoice === "none") {
        anthropicToolChoice = { type: "none" };
      } else if (forceTool) {
        anthropicToolChoice = { type: "tool", name: forceTool };
      } else if (tools?.length) {
        anthropicToolChoice = { type: "auto" };
      }

      let res: Response;
      try {
        res = await fetch(ANTHROPIC_API, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey(),
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: req.model,
            max_tokens: 8192,
            stream: true,
            system,
            messages,
            temperature: req.temperature,
            ...(tools?.length ? { tools } : {}),
            ...(anthropicToolChoice ? { tool_choice: anthropicToolChoice } : {}),
          }),
        });
      } catch (err) {
        yield {
          type: "error",
          error: err instanceof Error ? err.message : String(err),
          retryable: true,
        };
        return;
      }

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        yield {
          type: "error",
          error: `Anthropic HTTP ${res.status}: ${text.slice(0, 300)}`,
          retryable: res.status >= 500 || res.status === 429,
        };
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      /** Accumulate tool_use JSON by content-block index. */
      const toolBuf = new Map<
        number,
        { id: string; name: string; args: string }
      >();

      while (true) {
        if (req.signal && "aborted" in req.signal && req.signal.aborted) return;
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";

        for (const frame of frames) {
          const lines = frame.split("\n");
          let eventType = "message";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event:")) eventType = line.slice(6).trim();
            if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (!data || data === "[DONE]") continue;

          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(data);
          } catch {
            continue;
          }

          if (eventType === "content_block_start") {
            const block = payload.content_block as
              | { type?: string; id?: string; name?: string }
              | undefined;
            const index = Number(payload.index ?? 0);
            if (block?.type === "tool_use") {
              toolBuf.set(index, {
                id: block.id || "",
                name: block.name || "",
                args: "",
              });
            }
          } else if (eventType === "content_block_delta") {
            const delta = payload.delta as
              | { type?: string; text?: string; partial_json?: string }
              | undefined;
            if (delta?.type === "text_delta" && delta.text) {
              yield { type: "delta", text: delta.text };
            }
            if (delta?.type === "input_json_delta" && delta.partial_json != null) {
              const index = Number(payload.index ?? 0);
              const prev = toolBuf.get(index);
              if (prev) prev.args += delta.partial_json;
            }
          } else if (eventType === "content_block_stop") {
            const index = Number(payload.index ?? 0);
            const tc = toolBuf.get(index);
            if (tc?.name) {
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
              toolBuf.delete(index);
            }
          } else if (eventType === "message_delta") {
            const usage = (payload.usage || {}) as {
              input_tokens?: number;
              output_tokens?: number;
            };
            if (usage.input_tokens != null || usage.output_tokens != null) {
              yield {
                type: "usage",
                usage: {
                  inputTokens: usage.input_tokens || 0,
                  outputTokens: usage.output_tokens || 0,
                  totalTokens:
                    (usage.input_tokens || 0) + (usage.output_tokens || 0),
                },
              };
            }
          } else if (eventType === "error") {
            yield {
              type: "error",
              error: String(
                (payload.error as { message?: string })?.message ||
                  payload.message ||
                  "Anthropic stream error"
              ),
              retryable: true,
            };
          }
        }
      }
    },
  };
}
