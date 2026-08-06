import type { ProviderId, StreamUsage } from "../providers/types.ts";

interface Aggregate {
  requests: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  totalLatencyMs: number;
  lastLatencyMs: number;
  lastAt?: string;
}

const byModel = new Map<string, Aggregate>();
const byProvider = new Map<ProviderId, Aggregate>();

function bump(
  map: Map<string, Aggregate>,
  key: string,
  usage: StreamUsage,
  isError = false
) {
  const prev = map.get(key) || {
    requests: 0,
    errors: 0,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    totalLatencyMs: 0,
    lastLatencyMs: 0,
  };
  prev.requests += 1;
  if (isError) prev.errors += 1;
  prev.inputTokens += usage.inputTokens || 0;
  prev.outputTokens += usage.outputTokens || 0;
  prev.costUsd += usage.costUsd || 0;
  prev.totalLatencyMs += usage.latencyMs || 0;
  prev.lastLatencyMs = usage.latencyMs || 0;
  prev.lastAt = new Date().toISOString();
  map.set(key, prev);
}

export function recordModelMetrics(usage: StreamUsage, isError = false) {
  bump(byModel, usage.modelKey, usage, isError);
  bump(byProvider as Map<string, Aggregate>, usage.provider, usage, isError);
}

export function getModelMetricsSnapshot() {
  const summarize = (agg: Aggregate) => ({
    ...agg,
    costUsd: Math.round(agg.costUsd * 1_000_000) / 1_000_000,
    avgLatencyMs: agg.requests
      ? Math.round(agg.totalLatencyMs / agg.requests)
      : 0,
  });

  return {
    byModel: Object.fromEntries(
      [...byModel.entries()].map(([k, v]) => [k, summarize(v)])
    ),
    byProvider: Object.fromEntries(
      [...byProvider.entries()].map(([k, v]) => [k, summarize(v)])
    ),
  };
}

export function resetModelMetrics() {
  byModel.clear();
  byProvider.clear();
}
