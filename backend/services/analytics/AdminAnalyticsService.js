/**
 * AdminAnalyticsService — platform-wide metrics for platform admins.
 */

import User from "../../models/User.js";
import Subscription from "../../models/Subscription.js";
import Invoice from "../../models/Invoice.js";
import Usage from "../../models/Usage.js";
import DailyUsage from "../../models/DailyUsage.js";
import AnalyticsEvent from "../../models/AnalyticsEvent.js";
import Plan from "../../models/Plan.js";
import {
  ACTIVE_USER_WINDOW_DAYS,
  estimateApiCost,
  eachUtcDay,
  utcDayStart,
} from "./config.js";
import { getMetricsSnapshot } from "../../utils/metrics.js";
import { runHealthChecks } from "../../controllers/healthController.js";
import os from "os";

function emptyTotals() {
  return {
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
  };
}

export class AdminAnalyticsService {
  async getDashboard() {
    const now = new Date();
    const dayStart = utcDayStart(now);
    const activeSince = new Date(
      now.getTime() - ACTIVE_USER_WINDOW_DAYS * 86400000
    );
    const newUserSince = new Date(now.getTime() - 30 * 86400000);
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    );

    const [
      totalUsers,
      newUsers,
      activeUsers,
      paidUsers,
      revenueAgg,
      usageAgg,
      dailyAgg,
      errorCount,
      requestCount,
      plans,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: newUserSince } }),
      DailyUsage.distinct("user", { day: { $gte: utcDayStart(activeSince) } }),
      Subscription.countDocuments({
        planId: { $in: ["pro", "business", "enterprise"] },
        status: { $in: ["active", "trialing", "past_due"] },
      }),
      Invoice.aggregate([
        {
          $match: {
            status: "paid",
            $or: [
              { paidAt: { $gte: monthStart } },
              { paidAt: null, createdAt: { $gte: monthStart } },
            ],
          },
        },
        { $group: { _id: null, totalCents: { $sum: "$totalCents" } } },
      ]),
      Usage.aggregate([
        { $match: { periodStart: { $gte: monthStart } } },
        {
          $group: {
            _id: null,
            tokens: { $sum: "$metrics.tokens" },
            images: { $sum: "$metrics.image_generation" },
            voice: { $sum: "$metrics.voice_minutes" },
            chats: { $sum: "$metrics.chat_requests" },
            research: { $sum: "$metrics.research_runs" },
            browser: { $sum: "$metrics.browser_sessions" },
            code: { $sum: "$metrics.code_executions" },
          },
        },
      ]),
      DailyUsage.aggregate([
        { $match: { day: { $gte: monthStart } } },
        {
          $group: {
            _id: null,
            mcp: { $sum: "$metrics.mcp_calls" },
            api: { $sum: "$metrics.api_requests" },
            errors: { $sum: "$metrics.errors" },
            latencySum: { $sum: "$metrics.latency_sum_ms" },
            latencyCount: { $sum: "$metrics.latency_count" },
          },
        },
      ]),
      AnalyticsEvent.countDocuments({
        type: "error",
        createdAt: { $gte: dayStart },
      }),
      AnalyticsEvent.countDocuments({
        type: { $in: ["api_request", "error"] },
        createdAt: { $gte: dayStart },
      }),
      Plan.find({ isActive: true }).lean(),
    ]);

    const usage = usageAgg[0] || {};
    const daily = dailyAgg[0] || {};
    const revenueCents = Number(revenueAgg[0]?.totalCents) || 0;

    // Estimated MRR from active paid subscriptions × plan prices (fallback).
    const planPrice = new Map(
      (plans || []).map((p) => [p.planId, Number(p.priceMonthlyCents) || 0])
    );
    const paidSubs = await Subscription.find({
      planId: { $in: ["pro", "business", "enterprise"] },
      status: { $in: ["active", "trialing"] },
    })
      .select("planId billingInterval")
      .lean();

    let estimatedMrrCents = 0;
    for (const sub of paidSubs) {
      const monthly = planPrice.get(sub.planId) || 0;
      if (sub.billingInterval === "year") {
        estimatedMrrCents += Math.round(monthly); // already monthly-equivalent catalog
      } else {
        estimatedMrrCents += monthly;
      }
    }

    const revenue = revenueCents > 0 ? revenueCents : estimatedMrrCents;
    const apiCost = estimateApiCost({
      tokens: usage.tokens || 0,
      images: usage.images || 0,
      voiceMinutes: usage.voice || 0,
    });
    const apiCostCents = Math.round(apiCost * 100);
    const profitCents = revenue - apiCostCents;

    const latencyCount = Number(daily.latencyCount) || 0;
    const avgResponseTimeMs =
      latencyCount > 0
        ? +((Number(daily.latencySum) || 0) / latencyCount).toFixed(1)
        : 0;

    const apiToday = Number(requestCount) || Number(daily.api) || 0;
    const errorsToday = Number(errorCount) || Number(daily.errors) || 0;
    const errorRate =
      apiToday > 0 ? +((errorsToday / apiToday) * 100).toFixed(2) : 0;

    // Model usage from daily maps this month
    const modelDocs = await DailyUsage.find({ day: { $gte: monthStart } })
      .select("models")
      .lean();
    const modelUsage = {};
    for (const doc of modelDocs) {
      if (!doc.models) continue;
      const entries =
        doc.models instanceof Map
          ? doc.models.entries()
          : Object.entries(doc.models);
      for (const [model, toks] of entries) {
        modelUsage[model] = (modelUsage[model] || 0) + (Number(toks) || 0);
      }
    }

    const chartsDaily = await this.getPlatformDailySeries(30);

    return {
      users: {
        total: totalUsers,
        active: Array.isArray(activeUsers) ? activeUsers.length : 0,
        new: newUsers,
        paid: paidUsers,
      },
      finance: {
        revenueCents: revenue,
        revenueSource: revenueCents > 0 ? "invoices" : "estimated_mrr",
        apiCostCents,
        apiCostUsd: apiCost,
        profitEstimateCents: profitCents,
        currency: "usd",
      },
      performance: {
        errorRate,
        errorsToday,
        requestsToday: apiToday,
        averageResponseTimeMs: avgResponseTimeMs,
      },
      usage: {
        tokens: Number(usage.tokens) || 0,
        images: Number(usage.images) || 0,
        voiceMinutes: Number(usage.voice) || 0,
        chats: Number(usage.chats) || 0,
        research: Number(usage.research) || 0,
        browser: Number(usage.browser) || 0,
        code: Number(usage.code) || 0,
        mcp: Number(daily.mcp) || 0,
      },
      modelUsage,
      charts: {
        daily: chartsDaily,
      },
      generatedAt: now.toISOString(),
    };
  }

  async getPlatformDailySeries(days = 30) {
    const n = Math.min(90, Math.max(1, Number(days) || 30));
    const end = utcDayStart();
    const start = new Date(end.getTime() - (n - 1) * 86400000);
    const rows = await DailyUsage.aggregate([
      { $match: { day: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: "$day",
          chat_requests: { $sum: "$metrics.chat_requests" },
          tokens: { $sum: "$metrics.tokens" },
          image_generation: { $sum: "$metrics.image_generation" },
          voice_minutes: { $sum: "$metrics.voice_minutes" },
          research_runs: { $sum: "$metrics.research_runs" },
          browser_sessions: { $sum: "$metrics.browser_sessions" },
          code_executions: { $sum: "$metrics.code_executions" },
          mcp_calls: { $sum: "$metrics.mcp_calls" },
          api_requests: { $sum: "$metrics.api_requests" },
          errors: { $sum: "$metrics.errors" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const byDay = new Map(
      rows.map((r) => [new Date(r._id).toISOString().slice(0, 10), r])
    );

    return eachUtcDay(start, end).map((day) => {
      const key = day.toISOString().slice(0, 10);
      const r = byDay.get(key) || {};
      return {
        date: key,
        metrics: {
          ...emptyTotals(),
          chat_requests: r.chat_requests || 0,
          tokens: r.tokens || 0,
          image_generation: r.image_generation || 0,
          voice_minutes: r.voice_minutes || 0,
          research_runs: r.research_runs || 0,
          browser_sessions: r.browser_sessions || 0,
          code_executions: r.code_executions || 0,
          mcp_calls: r.mcp_calls || 0,
          api_requests: r.api_requests || 0,
          errors: r.errors || 0,
        },
      };
    });
  }

  async getSystemHealth() {
    const health = await runHealthChecks();
    const mem = process.memoryUsage();
    const load = os.loadavg?.() || [0, 0, 0];
    const cpus = os.cpus?.() || [];
    const cpuUsage = (() => {
      if (!cpus.length) return null;
      let idle = 0;
      let total = 0;
      for (const cpu of cpus) {
        for (const t of Object.values(cpu.times || {})) total += t;
        idle += cpu.times?.idle || 0;
      }
      const used = total > 0 ? 1 - idle / total : 0;
      return +((used * 100) / 1).toFixed(1);
    })();

    // No dedicated job queue yet — surface in-process request pressure as "queue".
    const snap = getMetricsSnapshot();
    const httpTimingEntries = Object.entries(snap.timings || {}).filter(([k]) =>
      k.startsWith("http.request.duration")
    );
    let queueDepth = 0;
    let queueAvgMs = 0;
    if (httpTimingEntries.length) {
      let count = 0;
      let sum = 0;
      for (const [, t] of httpTimingEntries) {
        count += t.count || 0;
        sum += t.sumMs || 0;
      }
      queueDepth = count;
      queueAvgMs = count ? +(sum / count).toFixed(1) : 0;
    }

    return {
      status: health.status,
      timestamp: health.timestamp,
      uptimeSeconds: health.uptimeSeconds,
      services: {
        mongodb: {
          healthy: health.checks.mongo.healthy,
          detail: health.checks.mongo,
        },
        redis: {
          healthy: health.checks.redis.healthy,
          configured: health.checks.redis.configured,
          detail: health.checks.redis,
        },
        queue: {
          healthy: true,
          mode: "in_process",
          recentRequests: queueDepth,
          avgLatencyMs: queueAvgMs,
          note: "No external job queue configured; shows recent in-process HTTP load.",
        },
        storage: {
          healthy: health.checks.disk.healthy,
          detail: health.checks.disk,
        },
        cpu: {
          healthy: cpuUsage == null || cpuUsage < 95,
          usagePercent: cpuUsage,
          cores: cpus.length,
          loadAverage: load.map((n) => +Number(n).toFixed(2)),
        },
        memory: {
          healthy: health.checks.memory.healthy,
          systemUsedPct: health.checks.memory.systemUsedPct,
          rssMB: +(mem.rss / 1e6).toFixed(1),
          heapUsedMB: +(mem.heapUsed / 1e6).toFixed(1),
          heapTotalMB: +(mem.heapTotal / 1e6).toFixed(1),
        },
        uptime: {
          healthy: true,
          seconds: health.uptimeSeconds,
          processStartedAt: new Date(
            Date.now() - health.uptimeSeconds * 1000
          ).toISOString(),
        },
      },
    };
  }

  async listRecentLogs({
    limit = 50,
    type,
    userId,
  } = {}) {
    const q = {};
    if (type) q.type = type;
    if (userId) q.user = userId;
    const rows = await AnalyticsEvent.find(q)
      .sort({ createdAt: -1 })
      .limit(Math.min(200, Math.max(1, Number(limit) || 50)))
      .lean();
    return rows.map((r) => ({
      id: String(r._id),
      type: r.type,
      userId: r.user ? String(r.user) : null,
      method: r.method,
      path: r.path,
      statusCode: r.statusCode,
      latencyMs: r.latencyMs,
      category: r.category,
      model: r.model,
      tool: r.tool,
      tokens: r.tokens,
      errorMessage: r.errorMessage,
      requestId: r.requestId,
      createdAt: r.createdAt?.toISOString?.() || r.createdAt,
    }));
  }
}

export const adminAnalyticsService = new AdminAnalyticsService();
