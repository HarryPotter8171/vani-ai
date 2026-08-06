/** Voice session configuration. */

export const SESSION_TTL_MS = Number(process.env.VANI_VOICE_SESSION_TTL_MS) || 30 * 60_000;

export const SESSION_RATE_LIMIT_WINDOW_MS = 60_000;
export const SESSION_RATE_LIMIT_MAX = 30;

export const VOICE_MODES = Object.freeze(["push-to-talk", "hands-free"]);
export const DEFAULT_VOICE_MODE = "hands-free";

export const SESSION_STATES = Object.freeze([
  "idle",
  "listening",
  "processing",
  "speaking",
  "muted",
  "ended",
]);
