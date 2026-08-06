/**
 * Per-user in-memory cache for frequently retrieved / listed memories.
 * Single-process only — swap for Redis if you scale horizontally.
 */

import { MEMORY_CONFIG } from "./config.js";

/** @type {Map<string, { value: any, expiresAt: number }>} */
const store = new Map();

function makeKey(userId, suffix) {
  return `${String(userId)}:${suffix}`;
}

export function cacheGet(userId, suffix) {
  const key = makeKey(userId, suffix);
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

export function cacheSet(userId, suffix, value, ttlMs = MEMORY_CONFIG.cacheTtlMs) {
  store.set(makeKey(userId, suffix), {
    value,
    expiresAt: Date.now() + ttlMs,
  });
  return value;
}

export function cacheInvalidateUser(userId) {
  const prefix = `${String(userId)}:`;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

// Periodic sweep
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}, 60_000);
if (typeof sweep.unref === "function") sweep.unref();
