import Redis from "ioredis";
import { logger } from "../utils/logger.js";

/**
 * Atomic fixed-window counter: INCR then PEXPIRE-once-on-first-hit.
 * Works on Redis >= 2.6 (plain EVAL) rather than relying on the
 * Redis 7-only `PEXPIRE ... NX` flag, so it's compatible with any
 * Redis-protocol-compatible service (Redis, Valkey, ElastiCache, etc).
 */
const RATE_LIMIT_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
if tonumber(current) == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return { current, ttl }
`;

let client = null;

/** Whether a Redis backend has been configured via env vars. */
export function isRedisConfigured() {
  return !!(process.env.REDIS_URL || process.env.REDIS_HOST);
}

/**
 * Lazy singleton Redis client. Returns `null` when Redis is not configured
 * so callers can cleanly fall back to in-process behavior (single instance
 * deployments, local dev, tests).
 */
export function getRedisClient() {
  if (!isRedisConfigured()) return null;
  if (client) return client;

  const commonOptions = {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  };

  client = process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, commonOptions)
    : new Redis({
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        username: process.env.REDIS_USERNAME || undefined,
        tls: process.env.REDIS_TLS === "true" ? {} : undefined,
        ...commonOptions,
      });

  client.defineCommand("rateLimitIncr", {
    numberOfKeys: 1,
    lua: RATE_LIMIT_SCRIPT,
  });

  client.on("error", (err) => {
    logger.warn({ err: err.message }, "[redis] connection error");
  });
  client.on("connect", () => logger.info("[redis] connected"));
  client.on("close", () => logger.warn("[redis] connection closed"));

  return client;
}

/** Eagerly connect at boot (best-effort — rate limiting/health fall back gracefully on failure). */
export async function connectRedis() {
  const redis = getRedisClient();
  if (!redis) return null;
  if (redis.status === "ready" || redis.status === "connecting") return redis;
  try {
    await redis.connect();
  } catch (err) {
    logger.warn(
      { err: err.message },
      "[redis] initial connection failed — rate limiting/health checks will use fallbacks"
    );
  }
  return redis;
}

/** @returns {Promise<{ configured: boolean, healthy: boolean, error?: string }>} */
export async function pingRedis(timeoutMs = 1000) {
  const redis = getRedisClient();
  if (!redis) return { configured: false, healthy: true };

  try {
    const result = await Promise.race([
      redis.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("ping timeout")), timeoutMs)),
    ]);
    return { configured: true, healthy: result === "PONG" };
  } catch (err) {
    return { configured: true, healthy: false, error: err.message };
  }
}

/** Graceful shutdown — closes the connection cleanly, never throws. */
export async function closeRedis() {
  if (!client) return;
  const toClose = client;
  client = null;
  try {
    await toClose.quit();
  } catch {
    toClose.disconnect();
  }
}
