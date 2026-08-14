/**
 * AnalyticsService — event logging, daily rollups, user-facing analytics.
 */

import AnalyticsEvent from "../../models/AnalyticsEvent.js";
import DailyUsage from "../../models/DailyUsage.js";
import { billingService } from "../../billing/init.js";
import {
  API_EVENT_SAMPLE_RATE,
  eachUtcDay,
  utcDayStart,
} from "./config.js";
import { logger } from "../../utils/logger.js";
import { isMongoReady } from "../../config/mongoReady.js";

const EMPTY_DAILY = () => ({
  chat_requests: 0,
  tokens: 0,
  image_generation: 0,
  voice_minutes: 0,
  research_runs: 0,
  browser_sessions: 0,
  code_executions: 0,
  mcp_calls: 0,
  file_storage_bytes: 0,
  api_requests: 0,
  errors: 0,
  latency_sum_ms: 0,
  latency_count: 0,
});

/** Mongo map keys cannot contain `.` — normalize model ids. */
function safeModelKey(model) {
  return String(model || "unknown")
    .replace(/\./g, "_")
    .slice(0, 120);
}

/**
 * Route → analytics category / daily metric mapping.
 * First match wins. quantity may be a number or (req) => number.
 */
export const ANALYTICS_ROUTE_RULES = [
  {
    methods: ["POST"],
    match: /^\/api\/chat\/?$/,
    category: "chat",
    metric: "chat_requests",
  },
  {
    methods: ["POST"],
    match: /^\/api\/agents\/run\/?$/,
    category: "agents",
    metric: "chat_requests",
  },
  {
    methods: ["POST"],
    match: /^\/api\/research\/run\/?$/,
    category: "research",
    metric: "research_runs",
  },
  {
    methods: ["POST"],
    match: /^\/api\/browser\/runs\/?$/,
    category: "browser",
    metric: "browser_sessions",
  },
  {
    methods: ["POST"],
    match: /^\/api\/code\/sessions\/[^/]+\/execute\/?$/,
    category: "code_interpreter",
    metric: "code_executions",
  },
  {
    methods: ["POST"],
    match: /^\/api\/voice\/(stt|tts|session)\/?$/,
    category: "voice",
    metric: "voice_minutes",
  },
  {
    methods: ["POST"],
    match: /^\/api\/mcp\/servers\/[^/]+\/tools\/call\/?$/,
    category: "mcp",
    metric: "mcp_calls",
  },
  {
    methods: ["POST"],
    match: /^\/api\/files\/upload\/?$/,
    category: "files",
    metric: "file_storage_bytes",
    quantity: (req) => {
      const files = req.files || (req.file ? [req.file] : []);
      const sum = files.reduce((n, f) => n + (Number(f.size) || 0), 0);
      if (sum > 0) return sum;
      const declared = Number(req.body?.size || req.body?.bytes);
      return Number.isFinite(declared) && declared > 0 ? declared : 0;
    },
  },
];

function normalizePath(req) {
  const raw = req.originalUrl || req.url || "";
  return String(raw).split("?")[0];
}

function resolveUserId(req) {
  if (req.user?._id) return String(req.user._id);
  if (req.user?.id) return String(req.user.id);
  return null;
}

function matchAnalyticsRule(req) {
  const method = String(req.method || "GET").toUpperCase();
  const path = normalizePath(req);
  for (const rule of ANALYTICS_ROUTE_RULES) {
    if (!rule.methods.includes(method)) continue;
    if (rule.match.test(path)) return rule;
  }
  return null;
}

function shouldPersistApiEvent(statusCode) {
  if (statusCode >= 400) return true;
  return Math.random() < API_EVENT_SAMPLE_RATE;
}

export class AnalyticsService {
  /**
   * Fire-and-forget record of a completed HTTP request.
   * Safe: never throws to callers.
   */
  async recordApiRequest(req, res, latencyMs) {
    try {
      // Never block auth / API on analytics — skip entirely when DB is down.
      if (!isMongoReady()) return;

      const statusCode = res.statusCode || 0;
      const path = normalizePath(req);
      if (
        path === "/health" ||
        path === "/ready" ||
        path === "/version" ||
        path.startsWith("/api/billing/webhooks") ||
        path.startsWith("/api/analytics") ||
        path.startsWith("/api/auth/")
      ) {
        return;
      }

      const userId = resolveUserId(req);
      const rule = matchAnalyticsRule(req);
      const category = rule?.category || "api";
      const isError = statusCode >= 400;
      const latency = Math.max(0, Number(latencyMs) || 0);

      // Daily rollups — always update when we have a user or an error signal.
      if (userId) {
        const incs = {
          "metrics.api_requests": 1,
          "metrics.latency_sum_ms": latency,
          "metrics.latency_count": 1,
        };
        if (isError) incs["metrics.errors"] = 1;

        if (!isError && rule?.metric && statusCode >= 200 && statusCode < 300) {
          let qty =
            typeof rule.quantity === "function" ? rule.quantity(req) : 1;
          qty = Number(qty);
          if (Number.isFinite(qty) && qty !== 0) {
            incs[`metrics.${rule.metric}`] = qty;
          }
        }

        const tokens = Number(res.locals?.billingTokens || req.billingTokens);
        if (Number.isFinite(tokens) && tokens > 0) {
          incs["metrics.tokens"] = (incs["metrics.tokens"] || 0) + tokens;
        }
        const images = Number(res.locals?.billingImages || req.billingImages);
        if (Number.isFinite(images) && images > 0) {
          incs["metrics.image_generation"] =
            (incs["metrics.image_generation"] || 0) + images;
        }

        const model =
          res.locals?.billingModel ||
          req.billingModel ||
          req.body?.model ||
          "";
        const day = utcDayStart();
        const update = {
          $inc: incs,
          $setOnInsert: { user: userId, day },
        };
        if (model && Number.isFinite(tokens) && tokens > 0) {
          update.$inc[`models.${safeModelKey(model)}`] = tokens;
        }

        // Fire-and-forget — never await analytics from the request path.
        setImmediate(() => {
          if (!isMongoReady()) return;
          void DailyUsage.updateOne({ user: userId, day }, update, {
            upsert: true,
          }).catch((err) =>
            logger.debug(
              { err: err?.message },
              "[analytics] daily upsert failed"
            )
          );
        });
      }

      if (!shouldPersistApiEvent(statusCode)) return;
      if (!isMongoReady()) return;

      const event = {
        type: isError ? "error" : "api_request",
        user: userId || null,
        method: String(req.method || "GET").toUpperCase(),
        path: path.slice(0, 240),
        statusCode,
        latencyMs: latency,
        category,
        requestId: String(req.id || ""),
        errorMessage: isError
          ? String(res.locals?.errorMessage || "").slice(0, 500)
          : "",
      };

      // Fire-and-forget — analytics must never affect the request lifecycle.
      setImmediate(() => {
        if (!isMongoReady()) return;
        void AnalyticsEvent.create(event).catch((err) =>
          logger.debug({ err: err?.message }, "[analytics] event create failed")
        );
      });
    } catch (err) {
      logger.debug(
        { err: err instanceof Error ? err.message : err },
        "[analytics] recordApiRequest failed"
      );
    }
  }

  /** Explicit model-call log (controllers may call after LLM usage). */
  async recordModelCall({
    userId,
    model,
    tokens = 0,
    latencyMs = 0,
    meta,
  } = {}) {
    try {
      if (!isMongoReady()) return;
      if (!userId || !model) return;
      const day = utcDayStart();
      const tok = Math.max(0, Number(tokens) || 0);
      void DailyUsage.updateOne(
        { user: userId, day },
        {
          $inc: {
            "metrics.tokens": tok,
            [`models.${safeModelKey(model)}`]: tok || 1,
          },
          $setOnInsert: { user: userId, day },
        },
        { upsert: true }
      ).catch(() => undefined);

      void AnalyticsEvent.create({
        type: "model_call",
        user: userId,
        model: safeModelKey(model),
        tokens: tok,
        latencyMs: Math.max(0, Number(latencyMs) || 0),
        category: "model",
        meta,
      }).catch(() => undefined);
    } catch {
      /* never throw */
    }
  }

  /** Explicit tool invocation log. */
  async recordToolInvocation({
    userId,
    tool,
    category = "tool",
    latencyMs = 0,
    meta,
  } = {}) {
    try {
      if (!isMongoReady()) return;
      if (!tool) return;
      void AnalyticsEvent.create({
        type: "tool_invocation",
        user: userId || null,
        tool: String(tool).slice(0, 120),
        category: String(category).slice(0, 64),
        latencyMs: Math.max(0, Number(latencyMs) || 0),
        meta,
      }).catch(() => undefined);
    } catch {
      /* never throw */
    }
  }

  async getDailySeries(userId, days = 30) {
    const n = Math.min(90, Math.max(1, Number(days) || 30));
    const end = utcDayStart();
    const start = new Date(end.getTime() - (n - 1) * 86400000);
    const rows = await DailyUsage.find({
      user: userId,
      day: { $gte: start, $lte: end },
    })
      .lean()
      .exec();

    const byDay = new Map(
      rows.map((r) => [new Date(r.day).toISOString().slice(0, 10), r])
    );

    return eachUtcDay(start, end).map((day) => {
      const key = day.toISOString().slice(0, 10);
      const doc = byDay.get(key);
      const metrics = { ...EMPTY_DAILY(), ...(doc?.metrics || {}) };
      return {
        date: key,
        metrics,
        total:
          (metrics.chat_requests || 0) +
          (metrics.research_runs || 0) +
          (metrics.browser_sessions || 0) +
          (metrics.code_executions || 0) +
          (metrics.mcp_calls || 0) +
          (metrics.image_generation || 0) +
          (metrics.voice_minutes || 0),
      };
    });
  }

  aggregateSeries(series, bucketSize) {
    if (bucketSize <= 1) {
      return series.map((s) => ({
        label: s.date,
        start: s.date,
        end: s.date,
        metrics: s.metrics,
        total: s.total,
      }));
    }
    const buckets = [];
    for (let i = 0; i < series.length; i += bucketSize) {
      const slice = series.slice(i, i + bucketSize);
      const metrics = EMPTY_DAILY();
      for (const s of slice) {
        for (const k of Object.keys(metrics)) {
          metrics[k] += Number(s.metrics[k]) || 0;
        }
      }
      const total = slice.reduce((n, s) => n + (s.total || 0), 0);
      buckets.push({
        label: `${slice[0].date}–${slice[slice.length - 1].date}`,
        start: slice[0].date,
        end: slice[slice.length - 1].date,
        metrics,
        total,
      });
    }
    return buckets;
  }

  /**
   * Full user analytics payload (totals + quotas + charts).
   */
  async getUserAnalytics(userId) {
    const overview = await billingService.getOverview(userId);
    const usage = overview.usage?.metrics || {};
    const remaining = overview.remaining || [];
    const plan = overview.plan;

    // MCP + lifetime-ish totals from daily docs in current period when available.
    const periodStart = new Date(
      overview.usage?.periodStart || overview.subscription?.currentPeriodStart
    );
    const dailyInPeriod = await DailyUsage.find({
      user: userId,
      day: { $gte: utcDayStart(periodStart) },
    })
      .lean()
      .exec();

    let mcpCalls = 0;
    for (const d of dailyInPeriod) {
      mcpCalls += Number(d.metrics?.mcp_calls) || 0;
    }

    const daily = await this.getDailySeries(userId, 30);
    const weekly = this.aggregateSeries(daily, 7);
    const monthly = this.aggregateSeries(
      await this.getDailySeries(userId, 90),
      30
    );

    return {
      totals: {
        chats: Number(usage.chat_requests) || 0,
        tokens: Number(usage.tokens) || 0,
        imagesGenerated: Number(usage.image_generation) || 0,
        voiceMinutes: Number(usage.voice_minutes) || 0,
        deepResearchSessions: Number(usage.research_runs) || 0,
        browserSessions: Number(usage.browser_sessions) || 0,
        mcpCalls,
        codeInterpreterRuns: Number(usage.code_executions) || 0,
        fileStorageBytes: Number(usage.file_storage_bytes) || 0,
      },
      plan: {
        planId: plan?.planId || "free",
        name: plan?.name || "Free",
        rank: plan?.rank ?? 0,
      },
      monthlyUsage: usage,
      remaining,
      period: {
        start: overview.usage?.periodStart || null,
        end: overview.usage?.periodEnd || null,
      },
      charts: {
        daily,
        weekly,
        monthly,
      },
      subscription: {
        status: overview.subscription?.status || "active",
        billingInterval: overview.subscription?.billingInterval || null,
      },
    };
  }
}

export const analyticsService = new AnalyticsService();
