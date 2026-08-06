/**
 * Live Voice WebSocket frames.
 *
 * Reuses the legacy envelope shape (`{ type, ts, ... }`) so a future frontend
 * can share parsers. Live-specific types are additive; legacy types that map
 * cleanly (ping/bind/config/interrupt/close) stay valid.
 */

import {
  MAX_AUDIO_CHUNK_CHARS,
  serverFrame as legacyServerFrame,
} from "../voice/protocol.js";
import { LIVE_MAX_AUDIO_CHUNK_CHARS } from "./config.js";

export const LIVE_CLIENT_TYPES = Object.freeze([
  "ping",
  "bind",
  "config",
  "live.start",
  "live.stop",
  "audio.chunk",
  "audio.end",
  "text",
  "interrupt",
  "close",
]);

export const LIVE_SERVER_TYPES = Object.freeze([
  "pong",
  "ready",
  "state",
  "live.ready",
  "live.closed",
  "transcript.partial",
  "transcript.final",
  "transcript.output",
  "tts.meta",
  "tts.audio",
  "tts.done",
  "interrupted",
  "error",
]);

export { LIVE_MAX_AUDIO_CHUNK_CHARS, MAX_AUDIO_CHUNK_CHARS };

/**
 * @param {unknown} raw
 * @returns {{ ok: true, msg: object } | { ok: false, error: string }}
 */
export function parseLiveClientMessage(raw) {
  let msg;
  try {
    msg = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return { ok: false, error: "Invalid JSON frame." };
  }
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
    return { ok: false, error: "Frame must be a JSON object." };
  }
  const type = msg.type;
  if (typeof type !== "string" || !LIVE_CLIENT_TYPES.includes(type)) {
    return { ok: false, error: `Unknown message type: ${type}` };
  }
  return { ok: true, msg };
}

export function serverFrame(type, payload = {}) {
  return legacyServerFrame(type, payload);
}
