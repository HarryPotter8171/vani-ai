/**
 * UsageService — period-scoped metric aggregation for billing.
 */

import Usage, { USAGE_METRICS } from "../models/Usage.js";
import type {
  QuotaRemaining,
  RecordUsageInput,
  UsageMetric,
  UsageMetricsMap,
  UsageSnapshot,
} from "./types.ts";
import type { PlanQuotas } from "./types.ts";

function emptyMetrics(): UsageMetricsMap {
  return {
    chat_requests: 0,
    tokens: 0,
    image_generation: 0,
    voice_minutes: 0,
    research_runs: 0,
    browser_sessions: 0,
    code_executions: 0,
    file_storage_bytes: 0,
  };
}

/** Calendar-month period in UTC (foundation; gateway can switch later). */
export function monthPeriod(now = new Date()): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0)
  );
  return { start, end };
}

function serializeUsage(doc: Record<string, unknown>, userId: string): UsageSnapshot {
  const metrics = emptyMetrics();
  const raw = (doc.metrics || {}) as Partial<UsageMetricsMap>;
  for (const key of USAGE_METRICS as UsageMetric[]) {
    const n = Number(raw[key]);
    metrics[key] = Number.isFinite(n) && n > 0 ? n : 0;
  }
  return {
    userId,
    periodStart: new Date(doc.periodStart as Date).toISOString(),
    periodEnd: new Date(doc.periodEnd as Date).toISOString(),
    metrics,
    lastEventAt: doc.lastEventAt
      ? new Date(doc.lastEventAt as Date).toISOString()
      : null,
  };
}

export class UsageService {
  isMetric(value: unknown): value is UsageMetric {
    return typeof value === "string" && (USAGE_METRICS as string[]).includes(value);
  }

  async getOrCreatePeriod(
    userId: string,
    at: Date = new Date()
  ): Promise<UsageSnapshot> {
    const { start, end } = monthPeriod(at);
    const doc = await Usage.findOneAndUpdate(
      { user: userId, periodStart: start },
      {
        $setOnInsert: {
          user: userId,
          periodStart: start,
          periodEnd: end,
          metrics: emptyMetrics(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    return serializeUsage(doc as Record<string, unknown>, String(userId));
  }

  /**
   * Atomically increment a usage metric. Never throws to callers of middleware —
   * returns null on failure after logging.
   */
  async record(input: RecordUsageInput): Promise<UsageSnapshot | null> {
    try {
      if (!input.userId || !this.isMetric(input.metric)) return null;
      const quantity = Number(input.quantity);
      const delta =
        Number.isFinite(quantity) && quantity !== 0 ? quantity : 1;
      if (delta < 0 && input.metric !== "file_storage_bytes") {
        // Only storage may decrease (delete). Other metrics are counters.
        return null;
      }

      const { start, end } = monthPeriod();
      const field = `metrics.${input.metric}`;
      const doc = await Usage.findOneAndUpdate(
        { user: input.userId, periodStart: start },
        {
          $inc: { [field]: delta },
          // periodEnd must not appear in both $set and $setOnInsert (Mongo conflict).
          $set: { lastEventAt: new Date(), periodEnd: end },
          $setOnInsert: {
            user: input.userId,
            periodStart: start,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean();

      // Floor storage at 0 if deletes overshoot
      if (
        input.metric === "file_storage_bytes" &&
        doc &&
        (doc as { metrics?: { file_storage_bytes?: number } }).metrics
          ?.file_storage_bytes != null &&
        (doc as { metrics: { file_storage_bytes: number } }).metrics
          .file_storage_bytes < 0
      ) {
        await Usage.updateOne(
          { user: input.userId, periodStart: start },
          { $set: { "metrics.file_storage_bytes": 0 } }
        );
      }

      return serializeUsage(doc as Record<string, unknown>, String(input.userId));
    } catch (err) {
      console.warn(
        "[billing:usage] record failed",
        err instanceof Error ? err.message : err
      );
      return null;
    }
  }

  async getUsage(userId: string): Promise<UsageSnapshot> {
    return this.getOrCreatePeriod(userId);
  }

  computeRemaining(
    usage: UsageMetricsMap,
    quotas: PlanQuotas
  ): QuotaRemaining[] {
    return (USAGE_METRICS as UsageMetric[]).map((metric) => {
      const used = Number(usage[metric]) || 0;
      const limit = Number(quotas[metric]);
      const unlimited = !Number.isFinite(limit) || limit < 0;
      if (unlimited) {
        return {
          metric,
          used,
          limit: -1,
          remaining: null,
          unlimited: true,
          percentUsed: null,
        };
      }
      const remaining = Math.max(0, limit - used);
      const percentUsed =
        limit === 0 ? 100 : Math.min(100, Math.round((used / limit) * 1000) / 10);
      return {
        metric,
        used,
        limit,
        remaining,
        unlimited: false,
        percentUsed,
      };
    });
  }
}

export const usageService = new UsageService();
