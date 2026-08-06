import { CHAT_MODEL } from "../services/geminiClient.js";
import { planMeetsMinimum } from "../billing/featureMatrix.ts";
import type {
  ContentMessage,
  ModelCapability,
  ModelInfo,
  ProviderId,
  ProviderStreamEvent,
  StreamUsage,
  ToolDeclaration,
} from "../providers/types.ts";
import { contentsHaveVision } from "../providers/shared/content.ts";
import {
  INTENT_CAPABILITIES,
  scoreModelForCapabilities,
} from "./CapabilityMatrix.ts";
import { estimateCostUsd } from "./CostEstimator.ts";
import { providerRegistry, ProviderRegistry } from "./ProviderRegistry.ts";
import { recordModelMetrics } from "./metricsStore.ts";

/** Pro+ default when user has not picked an explicit non-default model. */
const PRIORITY_MODEL_KEY =
  process.env.VANI_PRIORITY_MODEL || "gemini/gemini-2.5-pro";

export interface RouteDecision {
  model: ModelInfo;
  reason: string;
  /** Ordered fallbacks if the primary fails. */
  fallbacks: ModelInfo[];
}

export interface RouteRequest {
  /** Explicit model key (`provider/model`), `auto`, or legacy `gemini`. */
  model?: string | null;
  /** Project default model (used when request model unset). */
  projectModel?: string | null;
  /** Chat sticky model. */
  chatModel?: string | null;
  userMessage?: string;
  contents?: ContentMessage[];
  requireVision?: boolean;
  requireTools?: boolean;
  preferOffline?: boolean;
  /** Subscription plan — enables priority model routing for Pro+. */
  planId?: string | null;
  /** Explicit override; defaults to planId >= pro. */
  priorityRouting?: boolean;
}

const FALLBACK_ORDER: ProviderId[] = [
  "gemini",
  "openai",
  "anthropic",
  "openrouter",
  "groq",
  "ollama",
];

export class ModelRouter {
  registry: ProviderRegistry;

  constructor(registry: ProviderRegistry = providerRegistry) {
    this.registry = registry;
  }

  /**
   * Resolve which model to use.
   * Priority: request model → chat model → project model → auto/env default.
   */
  resolve(req: RouteRequest = {}): RouteDecision {
    const explicit =
      req.model ||
      (req.chatModel && req.chatModel !== "gemini" ? req.chatModel : null) ||
      (req.projectModel && req.projectModel !== "gemini"
        ? req.projectModel
        : null);

    const wantsAuto =
      explicit === "auto" ||
      (!explicit && process.env.VANI_AUTO_ROUTE === "true");

    if (explicit && explicit !== "auto") {
      const model = this.registry.resolveModelKey(explicit);
      if (model?.enabled) {
        return {
          model,
          reason: "user_selected",
          fallbacks: this.buildFallbacks(model, req),
        };
      }
      // Requested model not configured — fall through to auto/default.
    }

    if (wantsAuto) {
      const auto = this.autoRoute(req);
      if (auto) return auto;
    }

    const priorityEnabled =
      req.priorityRouting === true ||
      (req.priorityRouting !== false &&
        !!req.planId &&
        planMeetsMinimum(req.planId, "pro"));

    // Pro+ priority routing: prefer a higher-tier model when no explicit pick.
    if (
      priorityEnabled &&
      (!explicit || explicit === "gemini" || explicit === "auto")
    ) {
      const priority =
        this.registry.resolveModelKey(PRIORITY_MODEL_KEY) ||
        this.registry.resolveModelKey("gemini/gemini-2.5-pro");
      if (priority?.enabled) {
        return {
          model: priority,
          reason: "priority_plan",
          fallbacks: this.buildFallbacks(priority, req),
        };
      }
    }

    // Legacy "gemini" chat/project defaults → keep Gemini as primary.
    if (!explicit || explicit === "gemini" || explicit === "auto") {
      const gemini = this.registry.resolveModelKey("gemini");
      if (gemini?.enabled) {
        return {
          model: gemini,
          reason: explicit === "auto" ? "auto_default_gemini" : "default_gemini",
          fallbacks: this.buildFallbacks(gemini, req),
        };
      }
    }

    // Absolute fallback — env chat model / gemini flash.
    const fallback =
      this.registry.resolveModelKey(`gemini/${CHAT_MODEL}`) ||
      this.registry.resolveModelKey("gemini") ||
      this.registry.listModels({ configuredOnly: true })[0];

    if (!fallback) {
      throw new Error(
        "No AI providers are configured. Set GOOGLE_CLOUD_* or another provider API key."
      );
    }

    return {
      model: fallback,
      reason: "default_fallback",
      fallbacks: this.buildFallbacks(fallback, req),
    };
  }

  /** Heuristic routing by prompt intent + required capabilities. */
  autoRoute(req: RouteRequest): RouteDecision | null {
    const needed = this.detectCapabilities(req);
    const candidates = this.registry
      .listModels({ configuredOnly: true })
      .map((m) => ({ model: m, score: scoreModelForCapabilities(m, needed) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score);

    if (!candidates.length) return null;

    // Intent-specific preferred providers (examples from the brief).
    const intent = this.detectIntent(req.userMessage || "");
    const preferredProvider = intentPreferredProvider(intent);
    if (preferredProvider) {
      const preferred = candidates.find(
        (c) => c.model.provider === preferredProvider
      );
      if (preferred) {
        return {
          model: preferred.model,
          reason: `auto:${intent || needed.join("+")}`,
          fallbacks: this.buildFallbacks(preferred.model, req),
        };
      }
    }

    const best = candidates[0];
    return {
      model: best.model,
      reason: `auto:${intent || needed.join("+") || "general"}`,
      fallbacks: this.buildFallbacks(best.model, req),
    };
  }

  detectCapabilities(req: RouteRequest): ModelCapability[] {
    const caps: ModelCapability[] = ["chat", "streaming"];
    if (req.requireTools !== false) caps.push("tools");
    if (
      req.requireVision ||
      (req.contents && contentsHaveVision(req.contents))
    ) {
      caps.push("vision");
    }
    if (req.preferOffline) caps.push("offline");

    const intent = this.detectIntent(req.userMessage || "");
    if (intent && INTENT_CAPABILITIES[intent]) {
      caps.push(INTENT_CAPABILITIES[intent]);
    }
    return caps;
  }

  detectIntent(text: string): string {
    const t = text.toLowerCase();
    if (!t.trim()) return "";
    if (
      /\b(code|coding|debug|refactor|typescript|javascript|python|bug|stack trace|compile)\b/.test(
        t
      )
    ) {
      return "coding";
    }
    if (
      /\b(reason|analyze|prove|step by step|think hard|long.?form analysis|deep dive)\b/.test(
        t
      )
    ) {
      return "reasoning";
    }
    if (
      /\b(story|poem|novel|creative|write a|screenplay|blog post|essay)\b/.test(
        t
      )
    ) {
      return "creative";
    }
    if (/\b(quick|fast|tl;dr|summarize briefly)\b/.test(t)) return "fast";
    if (/\b(offline|local|ollama|air.?gapped)\b/.test(t)) return "offline";
    if (/\b(image|screenshot|photo|diagram|chart|pdf page)\b/.test(t)) {
      return "vision";
    }
    return "";
  }

  buildFallbacks(primary: ModelInfo, req: RouteRequest): ModelInfo[] {
    const needed = this.detectCapabilities(req);
    const out: ModelInfo[] = [];
    for (const providerId of FALLBACK_ORDER) {
      if (providerId === primary.provider) continue;
      const candidates = this.registry
        .listModels({ configuredOnly: true })
        .filter((m) => m.provider === providerId)
        .map((m) => ({ m, score: scoreModelForCapabilities(m, needed) }))
        .filter((x) => x.score >= 0)
        .sort((a, b) => b.score - a.score);
      if (candidates[0]) out.push(candidates[0].m);
    }
    return out.slice(0, 3);
  }

  /**
   * Stream a single model turn with automatic failover to alternates.
   * Does NOT run the tool loop — callers (multiProviderAgent) do that.
   */
  async *streamWithFallback(opts: {
    decision: RouteDecision;
    contents: ContentMessage[];
    systemInstruction?: string;
    tools?: ToolDeclaration[];
    toolChoice?: "auto" | "none" | { type: "required"; name: string };
    temperature?: number;
    signal?: { aborted?: boolean } | AbortSignal;
  }): AsyncGenerator<
    | ProviderStreamEvent
    | { type: "route"; decision: RouteDecision; attempt: number }
    | { type: "usage_final"; usage: StreamUsage }
  > {
    const chain = [opts.decision.model, ...opts.decision.fallbacks];
    const started = performance.now();
    let lastError = "All providers failed";

    for (let i = 0; i < chain.length; i += 1) {
      const model = chain[i];
      const adapter = this.registry.get(model.provider);
      if (!adapter?.isConfigured()) continue;

      const attemptDecision: RouteDecision = {
        model,
        reason: i === 0 ? opts.decision.reason : `fallback_from_${chain[0].provider}`,
        fallbacks: chain.slice(i + 1),
      };
      yield { type: "route", decision: attemptDecision, attempt: i };

      let inputTokens = 0;
      let outputTokens = 0;
      let sawContent = false;
      let failed = false;

      try {
        for await (const event of adapter.streamChat({
          model: model.id,
          contents: opts.contents,
          systemInstruction: opts.systemInstruction,
          tools: opts.tools,
          toolChoice: opts.toolChoice,
          temperature: opts.temperature,
          signal: opts.signal,
        })) {
          if (event.type === "error") {
            lastError = event.error;
            failed = Boolean(event.retryable) || i < chain.length - 1;
            if (!failed) yield event;
            break;
          }
          if (event.type === "usage") {
            inputTokens = event.usage.inputTokens ?? inputTokens;
            outputTokens = event.usage.outputTokens ?? outputTokens;
          }
          if (event.type === "delta" || event.type === "tool_call") {
            sawContent = true;
          }
          yield event;
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        failed = true;
      }

      if (failed && !sawContent && i < chain.length - 1) {
        continue; // retry with next provider
      }

      const latencyMs = Math.round(performance.now() - started);
      const usage: StreamUsage = {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        costUsd: estimateCostUsd({
          modelKey: model.key,
          provider: model.provider,
          inputTokens,
          outputTokens,
        }),
        latencyMs,
        provider: model.provider,
        model: model.id,
        modelKey: model.key,
      };
      recordModelMetrics(usage);
      yield { type: "usage_final", usage };
      return;
    }

    yield { type: "error", error: lastError, retryable: false };
  }
}

function intentPreferredProvider(intent: string): ProviderId | null {
  switch (intent) {
    case "coding":
      return "anthropic";
    case "reasoning":
      return "gemini";
    case "creative":
      return "openai";
    case "fast":
      return "groq";
    case "offline":
      return "ollama";
    default:
      return null;
  }
}

export const modelRouter = new ModelRouter();
