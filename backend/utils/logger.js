import { randomUUID } from "crypto";
import pino from "pino";
import pinoHttp from "pino-http";

const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

const SENSITIVE_QUERY_KEYS = new Set([
  "access_token",
  "token",
  "authorization",
  "auth",
  "password",
  "secret",
  "api_key",
  "apikey",
]);

/**
 * Strip bearer-like query params from URLs before they hit access logs
 * (proxies, Referer, and log drains must not retain session tokens).
 * @param {string|undefined|null} url
 * @returns {string|undefined|null}
 */
export function scrubUrlForLogs(url) {
  if (!url || typeof url !== "string") return url;
  const q = url.indexOf("?");
  if (q === -1) return url;
  const path = url.slice(0, q);
  const search = url.slice(q + 1);
  try {
    const params = new URLSearchParams(search);
    let changed = false;
    for (const key of [...params.keys()]) {
      if (SENSITIVE_QUERY_KEYS.has(String(key).toLowerCase())) {
        params.set(key, "[REDACTED]");
        changed = true;
      }
    }
    if (!changed) return url;
    const next = params.toString();
    return next ? `${path}?${next}` : path;
  } catch {
    return path;
  }
}

/**
 * Structured (JSON) logger. Same shape in every environment so logs are
 * grep/parse-friendly locally and ingestible by any log aggregator in prod.
 * Silenced to "silent" during automated tests to keep test output clean.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || (isTest ? "silent" : isProduction ? "info" : "debug"),
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.password",
      "*.token",
      "*.accessToken",
      "*.access_token",
    ],
    remove: true,
  },
  base: { service: "vani-backend", pid: process.pid },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Request-scoped HTTP logger. Attaches `req.id` / `req.log` to every request,
 * echoes (or generates) `X-Request-Id`, and logs a single structured line per
 * request with method/url/status/duration — no bodies, no auth headers.
 */
export const httpLogger = pinoHttp({
  logger,
  genReqId(req, res) {
    const incoming = req.headers["x-request-id"];
    const id = (typeof incoming === "string" && incoming.trim()) || randomUUID();
    res.setHeader("X-Request-Id", id);
    return id;
  },
  customLogLevel(req, res, err) {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  autoLogging: {
    ignore: (req) =>
      req.url === "/health" || req.url === "/ready" || req.url === "/version",
  },
  serializers: {
    req(req) {
      return { id: req.id, method: req.method, url: scrubUrlForLogs(req.url) };
    },
    res(res) {
      return { statusCode: res.statusCode };
    },
  },
});

export function getRequestId(req) {
  return req?.id || req?.headers?.["x-request-id"] || null;
}
