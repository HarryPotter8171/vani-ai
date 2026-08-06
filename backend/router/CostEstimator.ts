import type { ProviderId } from "../providers/types.ts";

/**
 * Approximate USD per 1M tokens. Numbers are intentionally conservative
 * estimates for UX cost previews — not billing-grade.
 */
const RATES: Record<string, { input: number; output: number }> = {
  // Gemini
  "gemini/gemini-2.5-flash": { input: 0.15, output: 0.6 },
  "gemini/gemini-2.5-pro": { input: 1.25, output: 10 },
  "gemini/gemini-2.0-flash": { input: 0.1, output: 0.4 },
  // OpenAI
  "openai/gpt-4o": { input: 2.5, output: 10 },
  "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
  "openai/gpt-4.1": { input: 2, output: 8 },
  "openai/o4-mini": { input: 1.1, output: 4.4 },
  // Anthropic
  "anthropic/claude-sonnet-4-5": { input: 3, output: 15 },
  "anthropic/claude-sonnet-4-0": { input: 3, output: 15 },
  "anthropic/claude-haiku-4-5": { input: 1, output: 5 },
  "anthropic/claude-opus-4-5": { input: 15, output: 75 },
  // Groq (very cheap / often free-tier)
  "groq/llama-3.3-70b-versatile": { input: 0.59, output: 0.79 },
  "groq/llama-3.1-8b-instant": { input: 0.05, output: 0.08 },
  // Local
  "ollama/llama3.2": { input: 0, output: 0 },
  "ollama/llama3.1": { input: 0, output: 0 },
  "ollama/qwen2.5-coder": { input: 0, output: 0 },
  "ollama/llava": { input: 0, output: 0 },
};

const PROVIDER_DEFAULTS: Record<ProviderId, { input: number; output: number }> = {
  gemini: { input: 0.15, output: 0.6 },
  openai: { input: 2.5, output: 10 },
  anthropic: { input: 3, output: 15 },
  openrouter: { input: 2, output: 8 },
  groq: { input: 0.2, output: 0.4 },
  ollama: { input: 0, output: 0 },
};

export function estimateCostUsd(opts: {
  modelKey: string;
  provider: ProviderId;
  inputTokens: number;
  outputTokens: number;
}): number {
  const rates =
    RATES[opts.modelKey] ||
    PROVIDER_DEFAULTS[opts.provider] ||
    { input: 1, output: 3 };
  const cost =
    (opts.inputTokens / 1_000_000) * rates.input +
    (opts.outputTokens / 1_000_000) * rates.output;
  return Math.round(cost * 1_000_000) / 1_000_000; // 6 decimal places
}

/** Rough pre-flight estimate from character counts when tokens unknown. */
export function estimateTokensFromText(text: string): number {
  if (!text) return 0;
  // ~4 chars/token heuristic for mixed EN content.
  return Math.ceil(text.length / 4);
}
