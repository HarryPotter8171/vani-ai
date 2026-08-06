import type { ModelCapability, ModelInfo, ProviderId } from "../providers/types.ts";

/**
 * Declares which capabilities each provider / model family is good at.
 * Used by automatic routing and UI badges.
 */

export const PROVIDER_STRENGTHS: Record<ProviderId, ModelCapability[]> = {
  gemini: ["reasoning", "vision", "tools", "chat", "streaming"],
  openai: ["creative", "chat", "vision", "tools", "streaming"],
  anthropic: ["coding", "reasoning", "tools", "chat", "streaming"],
  openrouter: ["chat", "streaming", "tools"],
  groq: ["fast", "chat", "streaming", "tools"],
  ollama: ["offline", "chat", "streaming"],
};

/** Intent → preferred capability for auto-routing. */
export const INTENT_CAPABILITIES: Record<string, ModelCapability> = {
  coding: "coding",
  code: "coding",
  debug: "coding",
  refactor: "coding",
  reasoning: "reasoning",
  analyze: "reasoning",
  research: "reasoning",
  creative: "creative",
  writing: "creative",
  story: "creative",
  poem: "creative",
  fast: "fast",
  quick: "fast",
  offline: "offline",
  local: "offline",
  vision: "vision",
  image: "vision",
};

export function modelSupports(model: ModelInfo, capability: ModelCapability): boolean {
  return model.capabilities.includes(capability);
}

export function scoreModelForCapabilities(
  model: ModelInfo,
  needed: ModelCapability[]
): number {
  if (!model.enabled) return -1;
  let score = 0;
  for (const cap of needed) {
    if (model.capabilities.includes(cap)) score += 10;
    else if (PROVIDER_STRENGTHS[model.provider]?.includes(cap)) score += 3;
  }
  // Prefer faster / cheaper defaults slightly when tied.
  if (model.capabilities.includes("fast")) score += 1;
  return score;
}
