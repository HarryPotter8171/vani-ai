/**
 * Analytics logging middleware — records every API request (sampled),
 * latency, and errors into AnalyticsEvent + DailyUsage.
 *
 * Non-blocking: never fails the request.
 */

import { analyticsService } from "../services/analytics/index.js";

/**
 * Mount early (after requestTiming / httpLogger). Captures duration via
 * high-resolution timer; reads req.user after route auth on finish.
 */
export function analyticsLoggingMiddleware(req, res, next) {
  const url = req.url || "";
  if (url === "/health" || url === "/ready" || url === "/version") {
    return next();
  }

  const start = performance.now();

  res.on("finish", () => {
    const latencyMs = performance.now() - start;
    void analyticsService.recordApiRequest(req, res, latencyMs);
  });

  next();
}

/** Controllers may call these for precise model/tool telemetry. */
export async function recordModelAnalytics(input) {
  return analyticsService.recordModelCall(input);
}

export async function recordToolAnalytics(input) {
  return analyticsService.recordToolInvocation(input);
}
