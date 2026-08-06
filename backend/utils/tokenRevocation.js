import crypto from "crypto";
import { decodeJwt } from "jose";
import { getRedisClient, isRedisConfigured } from "../config/redis.js";
import { logger } from "./logger.js";

/** In-memory JWT denylist: key → expiry epoch ms (L1 + single-instance fallback). */
const revoked = new Map();

const REDIS_JTI_PREFIX = "jwt:deny:jti:";
const REDIS_TOK_PREFIX = "jwt:deny:tok:";

function prune() {
  const now = Date.now();
  for (const [key, expMs] of revoked) {
    if (expMs <= now) revoked.delete(key);
  }
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function ttlSecondsUntil(expMs) {
  const sec = Math.ceil((expMs - Date.now()) / 1000);
  return Math.max(1, sec);
}

function rememberLocal(key, expMs) {
  revoked.set(key, expMs);
}

/**
 * Persist denylist entries to Redis when configured (multi-replica logout).
 * Best-effort — local Map always holds the entry for this process.
 * @param {string[]} keys
 * @param {number} expMs
 */
async function persistRedis(keys, expMs) {
  if (!isRedisConfigured()) return;
  const redis = getRedisClient();
  if (!redis) return;

  const ttl = ttlSecondsUntil(expMs);
  try {
    if (redis.status !== "ready") {
      // Attempt connect once; ignore failure (local Map still protects this instance).
      try {
        await redis.connect();
      } catch {
        /* fall through */
      }
    }
    if (redis.status !== "ready") return;

    const pipeline = redis.pipeline();
    for (const key of keys) {
      pipeline.set(key, "1", "EX", ttl);
    }
    await pipeline.exec();
  } catch (err) {
    logger.warn(
      { err: err?.message || String(err) },
      "[auth] Redis JWT denylist write failed — local denylist still applied"
    );
  }
}

/**
 * @param {string[]} keys
 * @returns {Promise<boolean>}
 */
async function isRevokedInRedis(keys) {
  if (!isRedisConfigured()) return false;
  const redis = getRedisClient();
  if (!redis || redis.status !== "ready") return false;

  try {
    for (const key of keys) {
      const hit = await redis.get(key);
      if (hit) return true;
    }
  } catch (err) {
    logger.warn(
      { err: err?.message || String(err) },
      "[auth] Redis JWT denylist read failed — falling back to local"
    );
  }
  return false;
}

/**
 * Mark an access token as revoked until its natural expiry (or 1h fallback).
 * Writes local Map immediately and Redis when configured (awaited).
 * @param {string} token
 */
export async function revokeAccessToken(token) {
  if (!token) return;
  prune();

  let expMs = Date.now() + 60 * 60 * 1000;
  /** @type {string[]} */
  const redisKeys = [];

  try {
    const payload = decodeJwt(String(token));
    if (typeof payload.exp === "number") {
      expMs = payload.exp * 1000;
    }
    if (typeof payload.jti === "string" && payload.jti) {
      const jtiKey = `jti:${payload.jti}`;
      rememberLocal(jtiKey, expMs);
      redisKeys.push(`${REDIS_JTI_PREFIX}${payload.jti}`);
    }
  } catch {
    /* still revoke by raw hash */
  }

  const hash = tokenHash(token);
  rememberLocal(`tok:${hash}`, expMs);
  redisKeys.push(`${REDIS_TOK_PREFIX}${hash}`);

  await persistRedis(redisKeys, expMs);
}

/**
 * Sync local-only check (tests / hot path before Redis). Prefer
 * {@link isAccessTokenRevoked} for production auth.
 * @param {string} token
 * @returns {boolean}
 */
export function isAccessTokenRevokedLocal(token) {
  if (!token) return false;
  prune();

  try {
    const payload = decodeJwt(String(token));
    if (
      typeof payload.jti === "string" &&
      payload.jti &&
      revoked.has(`jti:${payload.jti}`)
    ) {
      return true;
    }
  } catch {
    /* fall through to hash check */
  }

  return revoked.has(`tok:${tokenHash(token)}`);
}

/**
 * @param {string} token
 * @returns {Promise<boolean>}
 */
export async function isAccessTokenRevoked(token) {
  if (!token) return false;
  if (isAccessTokenRevokedLocal(token)) return true;

  /** @type {string[]} */
  const redisKeys = [];
  try {
    const payload = decodeJwt(String(token));
    if (typeof payload.jti === "string" && payload.jti) {
      redisKeys.push(`${REDIS_JTI_PREFIX}${payload.jti}`);
    }
  } catch {
    /* hash only */
  }
  redisKeys.push(`${REDIS_TOK_PREFIX}${tokenHash(token)}`);

  const remote = await isRevokedInRedis(redisKeys);
  if (remote) {
    // Warm local cache so subsequent checks on this instance are sync-fast.
    const expMs = Date.now() + 60 * 60 * 1000;
    try {
      const payload = decodeJwt(String(token));
      if (typeof payload.exp === "number") {
        rememberLocal(
          typeof payload.jti === "string" && payload.jti
            ? `jti:${payload.jti}`
            : `tok:${tokenHash(token)}`,
          payload.exp * 1000
        );
      } else {
        rememberLocal(`tok:${tokenHash(token)}`, expMs);
      }
      if (typeof payload.jti === "string" && payload.jti) {
        rememberLocal(`jti:${payload.jti}`, typeof payload.exp === "number" ? payload.exp * 1000 : expMs);
      }
      rememberLocal(`tok:${tokenHash(token)}`, typeof payload.exp === "number" ? payload.exp * 1000 : expMs);
    } catch {
      rememberLocal(`tok:${tokenHash(token)}`, expMs);
    }
  }
  return remote;
}

/** Test helper — clear in-memory denylist. */
export function __resetTokenRevocationForTests() {
  revoked.clear();
}
