import { logger } from "./logger.js";

/**
 * Lightweight metrics hooks. In-process counters + timings that are always
 * safe to call. When a metrics backend is wired later (Prometheus, Datadog,
 * CloudWatch, …) swap the sink — call sites stay unchanged.
 *
 * No public scrape endpoint is exposed by default (avoids unauthenticated
 * information leakage). Snapshots are available via `getMetricsSnapshot()`
 * for ops tooling and tests.
 */

/** @typedef {{ count: number, tags: Record<string, string> }} CounterEntry */
/** @typedef {{ count: number, sumMs: number, minMs: number, maxMs: number, tags: Record<string, string> }} TimingEntry */

const counters = new Map();
const timings = new Map();

/** Optional external sink — set via `setMetricsSink`. */
let sink = null;

function tagKey(name, tags = {}) {
  const parts = Object.keys(tags)
    .sort()
    .map((k) => `${k}=${tags[k]}`);
  return parts.length ? `${name}|${parts.join(",")}` : name;
}

/**
 * Register an optional external sink (e.g. StatsD / OTel). Signature:
 *   sink({ type: 'counter'|'timing', name, value, tags })
 * @param {((event: { type: string, name: string, value: number, tags: Record<string, string> }) => void) | null} fn
 */
export function setMetricsSink(fn) {
  sink = typeof fn === "function" ? fn : null;
}

/** Increment a named counter. */
export function increment(name, tags = {}, value = 1) {
  const key = tagKey(name, tags);
  const prev = counters.get(key);
  if (prev) prev.count += value;
  else counters.set(key, { count: value, tags: { ...tags } });

  if (sink) {
    try {
      sink({ type: "counter", name, value, tags });
    } catch (err) {
      logger.debug({ err: err?.message }, "[metrics] sink error");
    }
  }
}

/** Record a duration in milliseconds. */
export function timing(name, durationMs, tags = {}) {
  const ms = Math.max(0, Number(durationMs) || 0);
  const key = tagKey(name, tags);
  const prev = timings.get(key);
  if (prev) {
    prev.count += 1;
    prev.sumMs += ms;
    prev.minMs = Math.min(prev.minMs, ms);
    prev.maxMs = Math.max(prev.maxMs, ms);
  } else {
    timings.set(key, {
      count: 1,
      sumMs: ms,
      minMs: ms,
      maxMs: ms,
      tags: { ...tags },
    });
  }

  if (sink) {
    try {
      sink({ type: "timing", name, value: ms, tags });
    } catch (err) {
      logger.debug({ err: err?.message }, "[metrics] sink error");
    }
  }
}

/**
 * Start a high-resolution timer. Call the returned function to record.
 * @param {string} name
 * @param {Record<string, string>} [tags]
 * @returns {() => number} end() → elapsed ms
 */
export function startTimer(name, tags = {}) {
  const start = performance.now();
  return () => {
    const elapsed = performance.now() - start;
    timing(name, elapsed, tags);
    return elapsed;
  };
}

/** Snapshot for diagnostics / tests. */
export function getMetricsSnapshot() {
  return {
    counters: Object.fromEntries(
      [...counters.entries()].map(([k, v]) => [k, { count: v.count, tags: v.tags }])
    ),
    timings: Object.fromEntries(
      [...timings.entries()].map(([k, v]) => [
        k,
        {
          count: v.count,
          sumMs: +v.sumMs.toFixed(3),
          minMs: +v.minMs.toFixed(3),
          maxMs: +v.maxMs.toFixed(3),
          avgMs: +(v.sumMs / v.count).toFixed(3),
          tags: v.tags,
        },
      ])
    ),
  };
}

/** Reset in-memory state (tests only). */
export function resetMetrics() {
  counters.clear();
  timings.clear();
}
