import { startTimer, increment } from "../utils/metrics.js";

/**
 * Records per-request duration + status-class counters via metrics hooks.
 * Complements pino-http (which logs the same data as structured JSON).
 */
export function requestTiming(req, res, next) {
  // Skip probe noise — same set as httpLogger.autoLogging.ignore.
  const url = req.url || "";
  if (url === "/health" || url === "/ready" || url === "/version") {
    return next();
  }

  const end = startTimer("http.request.duration", {
    method: req.method || "GET",
  });

  res.on("finish", () => {
    end();
    const statusClass = `${Math.floor((res.statusCode || 0) / 100)}xx`;
    increment("http.requests", {
      method: req.method || "GET",
      statusClass,
    });
  });

  next();
}
