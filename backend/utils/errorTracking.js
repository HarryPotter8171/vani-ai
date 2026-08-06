import * as Sentry from "@sentry/node";
import { logger } from "./logger.js";
import { startTimer as metricsStartTimer } from "./metrics.js";

let sentryEnabled = false;

/**
 * Initialize Sentry when SENTRY_DSN is configured. No-op (logging only)
 * otherwise, so this is always safe to call at boot.
 */
export function initErrorTracking() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.info("[errorTracking] SENTRY_DSN not set — using structured logs only");
    return;
  }
  if (sentryEnabled) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    release: process.env.SENTRY_RELEASE || process.env.npm_package_version,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0,
  });
  sentryEnabled = true;
  logger.info("[errorTracking] Sentry initialized");
}

export function isErrorTrackingEnabled() {
  return sentryEnabled;
}

/**
 * Report an error to structured logs (always) and Sentry (when configured).
 * @param {unknown} err
 * @param {Record<string, unknown>} [context]
 */
export function captureException(err, context = {}) {
  const error = err instanceof Error ? err : new Error(String(err));
  logger.error({ err: error, ...context }, error.message || "Unhandled error");
  if (sentryEnabled) {
    Sentry.withScope((scope) => {
      if (context.requestId) scope.setTag("requestId", String(context.requestId));
      if (context.errorId) scope.setTag("errorId", String(context.errorId));
      scope.setExtras(context);
      Sentry.captureException(error);
    });
  }
}

/**
 * Capture a non-exception breadcrumb/message (Sentry-ready).
 * @param {string} message
 * @param {Record<string, unknown>} [context]
 * @param {'info'|'warning'|'error'} [level]
 */
export function captureMessage(message, context = {}, level = "info") {
  const logLevel = level === "warning" ? "warn" : level === "error" ? "error" : "info";
  logger[logLevel]({ ...context }, message);
  if (sentryEnabled) {
    Sentry.captureMessage(message, { level, extra: context });
  }
}

/**
 * Performance timing hook — records local metrics and (when Sentry tracing
 * is enabled) a simple span around the work.
 *
 * Usage:
 *   const end = startPerformanceSpan('chat.generate');
 *   // ... work ...
 *   end();
 *
 * @param {string} name
 * @param {Record<string, string>} [tags]
 * @returns {() => number}
 */
export function startPerformanceSpan(name, tags = {}) {
  const endMetrics = metricsStartTimer(name, tags);
  // Sentry v8+ transactions are automatic via Express integration when
  // tracesSampleRate > 0; this hook still gives us a local timing always.
  return () => endMetrics();
}

/** Flush pending Sentry events before process exit (best-effort, bounded). */
export async function flushErrorTracking(timeoutMs = 2000) {
  if (!sentryEnabled) return;
  try {
    await Sentry.close(timeoutMs);
  } catch {
    // best-effort — never block shutdown on Sentry.
  }
}
