/**
 * Central rate-limit tuning. Every value is env-overridable so limits can be
 * adjusted per environment without a code change. Backed by Redis when
 * REDIS_URL / REDIS_HOST is set (see middleware/rateLimit.js), otherwise an
 * in-process fallback with identical semantics.
 */

export const AUTH_RATE_LIMIT = {
  windowMs: Number(process.env.VANI_AUTH_RATE_LIMIT_WINDOW_MS) || 60_000,
  max: Number(process.env.VANI_AUTH_RATE_LIMIT_MAX) || 20,
};

export const CHAT_RATE_LIMIT = {
  windowMs: Number(process.env.VANI_CHAT_RATE_LIMIT_WINDOW_MS) || 60_000,
  max: Number(process.env.VANI_CHAT_RATE_LIMIT_MAX) || 60,
};

/** Lighter limit for the public/unauthenticated shared-chat read endpoint. */
export const CHAT_PUBLIC_RATE_LIMIT = {
  windowMs: Number(process.env.VANI_CHAT_PUBLIC_RATE_LIMIT_WINDOW_MS) || 60_000,
  max: Number(process.env.VANI_CHAT_PUBLIC_RATE_LIMIT_MAX) || 30,
};

export const PROJECTS_RATE_LIMIT = {
  windowMs: Number(process.env.VANI_PROJECTS_RATE_LIMIT_WINDOW_MS) || 60_000,
  max: Number(process.env.VANI_PROJECTS_RATE_LIMIT_MAX) || 120,
};
