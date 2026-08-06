/**
 * Voice WebSocket duplex protocol — message types and validation.
 * Client and server exchange JSON frames (binary audio is base64 in JSON
 * for simplicity and proxy-friendliness).
 */

export const CLIENT_TYPES = Object.freeze([
  "ping",
  "bind",
  "config",
  "audio.start",
  "audio.chunk",
  "audio.end",
  "tts",
  "interrupt",
  "close",
]);

export const SERVER_TYPES = Object.freeze([
  "pong",
  "ready",
  "state",
  "transcript.partial",
  "transcript.final",
  "tts.meta",
  "tts.audio",
  "tts.done",
  "interrupted",
  "error",
]);

/** Max base64 audio chunk size from client (~256 KB decoded). */
export const MAX_AUDIO_CHUNK_CHARS = 350_000;

/** Max buffered audio per utterance before forced flush. */
export const MAX_UTTERANCE_BYTES = Number(process.env.VANI_STT_MAX_BYTES) || 10 * 1024 * 1024;

/**
 * @param {unknown} raw
 * @returns {{ ok: true, msg: object } | { ok: false, error: string }}
 */
export function parseClientMessage(raw) {
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
  if (typeof type !== "string" || !CLIENT_TYPES.includes(type)) {
    return { ok: false, error: `Unknown message type: ${type}` };
  }
  return { ok: true, msg };
}

/**
 * @param {string} type
 * @param {Record<string, unknown>} [payload]
 */
export function serverFrame(type, payload = {}) {
  // Spread payload first so the envelope `type` cannot be overwritten by
  // upstream events that also carry a `type` field (e.g. TTS stream "meta").
  const { type: _ignored, ...rest } = payload;
  return JSON.stringify({ ...rest, type, ts: Date.now() });
}
