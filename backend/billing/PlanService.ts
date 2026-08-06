/**
 * PlanService — catalog of Free / Pro / Business / Enterprise plans.
 * Quotas are configurable via VANI_PLAN_* env overrides at seed time.
 */

import Plan from "../models/Plan.js";
import type { PlanId, PlanQuotas, PlanSnapshot, UsageMetric } from "./types.ts";

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Sprint 2 Free defaults (override with VANI_PLAN_FREE_*). */
export function freePlanQuotas(): PlanQuotas {
  return {
    chat_requests: envInt("VANI_PLAN_FREE_CHAT_REQUESTS", 100),
    tokens: envInt("VANI_PLAN_FREE_TOKENS", 500_000),
    image_generation: envInt("VANI_PLAN_FREE_IMAGE_GENERATION", 20),
    voice_minutes: envInt("VANI_PLAN_FREE_VOICE_MINUTES", 10),
    research_runs: envInt("VANI_PLAN_FREE_RESEARCH_RUNS", 5),
    browser_sessions: envInt("VANI_PLAN_FREE_BROWSER_SESSIONS", 0),
    code_executions: envInt("VANI_PLAN_FREE_CODE_EXECUTIONS", 0),
    file_storage_bytes: envInt(
      "VANI_PLAN_FREE_FILE_STORAGE_BYTES",
      100 * 1024 * 1024
    ),
  };
}

/** Soft monthly quotas. -1 = unlimited. */
export const DEFAULT_PLAN_DEFS: Array<{
  planId: PlanId;
  name: string;
  description: string;
  rank: number;
  priceMonthlyCents: number | null;
  priceYearlyCents: number | null;
  quotas: PlanQuotas;
  features: string[];
}> = [
  {
    planId: "free",
    name: "Free",
    description:
      "Limited chats, images, voice, and research. Upgrade for Browser, Agents, MCP, and Code Interpreter.",
    rank: 0,
    priceMonthlyCents: 0,
    priceYearlyCents: 0,
    // Defaults mirrored here for tests; ensureSeeded applies env overrides.
    quotas: {
      chat_requests: 100,
      tokens: 500_000,
      image_generation: 20,
      voice_minutes: 10,
      research_runs: 5,
      browser_sessions: 0,
      code_executions: 0,
      file_storage_bytes: 100 * 1024 * 1024,
    },
    features: [
      "100 chats / month",
      "20 images / month",
      "10 voice minutes / month",
      "5 research runs / month",
      "Canvas & file uploads",
      "Community support",
    ],
  },
  {
    planId: "pro",
    name: "Pro",
    description:
      "Unlimited chat, images, and research plus Browser, Code Interpreter, Agents, MCP, and priority model routing.",
    rank: 1,
    priceMonthlyCents: 2000,
    priceYearlyCents: 19200,
    quotas: {
      chat_requests: -1,
      tokens: -1,
      image_generation: -1,
      voice_minutes: -1,
      research_runs: -1,
      browser_sessions: -1,
      code_executions: -1,
      file_storage_bytes: 5 * 1024 * 1024 * 1024,
    },
    features: [
      "Unlimited chats, images, and research",
      "Voice",
      "Browser automation",
      "Agents",
      "MCP",
      "Code Interpreter",
      "Priority model routing",
    ],
  },
  {
    planId: "business",
    name: "Business",
    description:
      "Everything in Pro plus team workspaces, shared projects, and admin controls.",
    rank: 2,
    priceMonthlyCents: 5000,
    priceYearlyCents: 48000,
    quotas: {
      chat_requests: -1,
      tokens: -1,
      image_generation: -1,
      voice_minutes: -1,
      research_runs: -1,
      browser_sessions: -1,
      code_executions: -1,
      file_storage_bytes: 50 * 1024 * 1024 * 1024,
    },
    features: [
      "Everything in Pro",
      "Team workspaces",
      "Shared projects",
      "Admin controls",
      "Elevated file storage",
      "Email support",
    ],
  },
  {
    planId: "enterprise",
    name: "Enterprise",
    description:
      "Unlimited everything with custom limits, SSO readiness, and dedicated support.",
    rank: 3,
    priceMonthlyCents: null,
    priceYearlyCents: null,
    quotas: {
      chat_requests: -1,
      tokens: -1,
      image_generation: -1,
      voice_minutes: -1,
      research_runs: -1,
      browser_sessions: -1,
      code_executions: -1,
      file_storage_bytes: -1,
    },
    features: [
      "Everything in Business",
      "Unlimited usage",
      "Custom limits",
      "SSO / custom terms (coming soon)",
      "Dedicated support",
    ],
  },
];

const EMPTY_QUOTAS = (): PlanQuotas => ({
  chat_requests: 0,
  tokens: 0,
  image_generation: 0,
  voice_minutes: 0,
  research_runs: 0,
  browser_sessions: 0,
  code_executions: 0,
  file_storage_bytes: 0,
});

function quotasForSeed(planId: PlanId, defaults: PlanQuotas): PlanQuotas {
  if (planId === "free") return freePlanQuotas();
  return { ...defaults };
}

function serializePlan(doc: Record<string, unknown>): PlanSnapshot {
  const quotasRaw = (doc.quotas || {}) as Partial<PlanQuotas>;
  const quotas = EMPTY_QUOTAS();
  for (const key of Object.keys(quotas) as UsageMetric[]) {
    const n = Number(quotasRaw[key]);
    quotas[key] = Number.isFinite(n) ? n : 0;
  }
  return {
    planId: doc.planId as PlanId,
    name: String(doc.name || doc.planId),
    description: String(doc.description || ""),
    rank: Number(doc.rank) || 0,
    priceMonthlyCents:
      doc.priceMonthlyCents == null ? null : Number(doc.priceMonthlyCents),
    priceYearlyCents:
      doc.priceYearlyCents == null ? null : Number(doc.priceYearlyCents),
    currency: String(doc.currency || "usd"),
    quotas,
    features: Array.isArray(doc.features)
      ? doc.features.map((f) => String(f))
      : [],
    isPublic: doc.isPublic !== false,
    isActive: doc.isActive !== false,
  };
}

export class PlanService {
  private seeded = false;

  async ensureSeeded(): Promise<void> {
    if (this.seeded) return;
    for (const def of DEFAULT_PLAN_DEFS) {
      const quotas = quotasForSeed(def.planId, def.quotas);
      await Plan.findOneAndUpdate(
        { planId: def.planId },
        {
          $set: {
            name: def.name,
            description: def.description,
            rank: def.rank,
            priceMonthlyCents: def.priceMonthlyCents,
            priceYearlyCents: def.priceYearlyCents,
            currency: "usd",
            quotas,
            features: def.features,
            isPublic: true,
            isActive: true,
          },
          $setOnInsert: { planId: def.planId },
        },
        { upsert: true, new: true }
      );
    }
    this.seeded = true;
  }

  async listPlans(opts: { includePrivate?: boolean } = {}): Promise<PlanSnapshot[]> {
    await this.ensureSeeded();
    const filter: Record<string, unknown> = { isActive: true };
    if (!opts.includePrivate) filter.isPublic = true;
    const docs = await Plan.find(filter).sort({ rank: 1 }).lean();
    return docs.map((d) => serializePlan(d as Record<string, unknown>));
  }

  async getPlan(planId: string): Promise<PlanSnapshot | null> {
    await this.ensureSeeded();
    const doc = await Plan.findOne({ planId, isActive: true }).lean();
    if (!doc) {
      const fallback = DEFAULT_PLAN_DEFS.find((p) => p.planId === planId);
      if (!fallback) return null;
      const quotas = quotasForSeed(fallback.planId, fallback.quotas);
      return {
        planId: fallback.planId,
        name: fallback.name,
        description: fallback.description,
        rank: fallback.rank,
        priceMonthlyCents: fallback.priceMonthlyCents,
        priceYearlyCents: fallback.priceYearlyCents,
        currency: "usd",
        quotas,
        features: [...fallback.features],
        isPublic: true,
        isActive: true,
      };
    }
    return serializePlan(doc as Record<string, unknown>);
  }

  getDefaultPlanId(): PlanId {
    return "free";
  }
}

export const planService = new PlanService();
