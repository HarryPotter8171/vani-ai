/**
 * Shared types for VANI AI model providers.
 * Providers normalize to these shapes so ModelRouter stays provider-agnostic.
 */

export type ProviderId =
  | "gemini"
  | "openai"
  | "anthropic"
  | "openrouter"
  | "groq"
  | "ollama";

export type ModelCapability =
  | "chat"
  | "streaming"
  | "vision"
  | "tools"
  | "image_generation"
  | "reasoning"
  | "coding"
  | "creative"
  | "fast"
  | "offline";

export interface ModelInfo {
  id: string;
  /** Fully-qualified id: `provider/model` */
  key: string;
  provider: ProviderId;
  displayName: string;
  capabilities: ModelCapability[];
  /** Approximate context window in tokens (informational). */
  contextWindow?: number;
  /** Whether this model is selectable when the provider is configured. */
  enabled: boolean;
}

export interface ProviderHealth {
  provider: ProviderId;
  configured: boolean;
  healthy: boolean;
  latencyMs?: number;
  error?: string;
  checkedAt: string;
}

export interface ToolDeclaration {
  name: string;
  description: string;
  parametersJsonSchema: Record<string, unknown>;
}

/** Gemini-style content parts (existing chat pipeline language). */
export interface ContentPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
  functionResponse?: {
    name: string;
    response: unknown;
    id?: string;
  };
}

export interface ContentMessage {
  role: "user" | "model" | "system";
  parts: ContentPart[];
}

export interface StreamUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Estimated USD cost for this turn (may be 0 for local/unknown). */
  costUsd: number;
  latencyMs: number;
  provider: ProviderId;
  model: string;
  modelKey: string;
}

export type ProviderStreamEvent =
  | { type: "delta"; text: string }
  | { type: "tool_call"; id: string; name: string; args: Record<string, unknown> }
  | { type: "usage"; usage: Partial<StreamUsage> }
  | { type: "error"; error: string; retryable?: boolean };

export interface StreamChatRequest {
  model: string;
  contents: ContentMessage[];
  systemInstruction?: string;
  tools?: ToolDeclaration[];
  /**
   * Tool calling policy:
   * - "auto" — model decides
   * - "none" — disable tools
   * - { type: "required", name } — force a specific tool this turn
   */
  toolChoice?: "auto" | "none" | { type: "required"; name: string };
  temperature?: number;
  signal?: { aborted?: boolean } | AbortSignal;
}

export interface ProviderAdapter {
  id: ProviderId;
  displayName: string;
  /** True when API keys / base URL are present. */
  isConfigured(): boolean;
  listModels(): ModelInfo[];
  /** Best-effort reachability probe. */
  healthCheck(): Promise<ProviderHealth>;
  /**
   * Stream a single model turn (no tool execution loop).
   * Yields text deltas and optional tool_call events.
   */
  streamChat(req: StreamChatRequest): AsyncGenerator<ProviderStreamEvent>;
}
