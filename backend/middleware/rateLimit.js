import { getRedisClient, isRedisConfigured } from "../config/redis.js";
import { logger } from "../utils/logger.js";

/**
 * In-memory fixed-window counter — used when Redis isn't configured, and as
 * an automatic fallback if Redis is unreachable. Single-process only; swap
 * to Redis (REDIS_URL / REDIS_HOST) for correct limits across instances.
 */
function createMemoryStore(windowMs) {
  /** @type {Map<string, { count: number, resetAt: number }>} */
  const buckets = new Map();

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, Math.max(windowMs, 30_000));
  if (typeof sweep.unref === "function") sweep.unref();

  return {
    increment(key) {
      const now = Date.now();
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        bucket = { count: 0, resetAt: now + windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      return { count: bucket.count, resetAt: bucket.resetAt };
    },
  };
}

function defaultKeyFn(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

/**
 * Rate limiter middleware. Uses a Redis-backed fixed-window counter (atomic
 * INCR + PEXPIRE via Lua) when REDIS_URL / REDIS_HOST is configured, so
 * limits are shared and correct across every instance in a multi-process /
 * multi-node deployment. Falls back to an in-process counter — used
 * automatically whenever Redis is not configured, not yet connected, or a
 * request to it fails — so a Redis outage degrades to per-instance limits
 * rather than failing requests open or closed.
 *
 * Synchronous when Redis is not configured (unchanged behavior / test
 * compatibility); asynchronous (Promise-based, transparent to Express) when
 * backed by Redis.
 *
 * @param {{ windowMs?: number, max?: number, message?: string, keyFn?: (req) => string, prefix?: string }} options
 */
export function createRateLimiter(options = {}) {
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max ?? 60;
  const message = options.message ?? "Too many requests. Please try again shortly.";
  const keyFn = options.keyFn ?? defaultKeyFn;
  const prefix = options.prefix ?? "rl";

  const memoryStore = createMemoryStore(windowMs);

  function respond(res, count, resetAt) {
    const remaining = Math.max(0, max - count);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));

    if (count > max) {
      const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      return false;
    }
    return true;
  }

  function allowViaMemory(req, res, next) {
    const { count, resetAt } = memoryStore.increment(keyFn(req));
    if (respond(res, count, resetAt)) return next();
    return res.status(429).json({ error: message });
  }

  return function rateLimit(req, res, next) {
    if (!isRedisConfigured()) return allowViaMemory(req, res, next);

    const redis = getRedisClient();
    if (!redis) return allowViaMemory(req, res, next);

    const redisKey = `${prefix}:${keyFn(req)}`;

    redis
      .rateLimitIncr(redisKey, windowMs)
      .then((result) => {
        const [count, ttl] = result;
        const resetAt = Date.now() + (ttl > 0 ? ttl : windowMs);
        if (respond(res, count, resetAt)) return next();
        return res.status(429).json({ error: message });
      })
      .catch((err) => {
        logger.warn(
          { err: err.message, key: redisKey },
          "[rateLimit] Redis unavailable — falling back to in-memory limiter"
        );
        return allowViaMemory(req, res, next);
      });
  };
}
