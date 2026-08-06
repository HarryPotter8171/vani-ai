/**
 * Gemini Live Native Audio — engine flag + session defaults.
 *
 * VOICE_ENGINE=legacy  → existing STT → chat SSE → TTS pipeline (default)
 * VOICE_ENGINE=live    → Gemini Live bidirectional PCM audio
 */

export const VOICE_ENGINE_LEGACY = "legacy";
export const VOICE_ENGINE_LIVE = "live";

/**
 * @returns {"legacy" | "live"}
 */
export function getVoiceEngine() {
  const raw = String(process.env.VOICE_ENGINE || VOICE_ENGINE_LEGACY)
    .trim()
    .toLowerCase();
  return raw === VOICE_ENGINE_LIVE ? VOICE_ENGINE_LIVE : VOICE_ENGINE_LEGACY;
}

export function isLiveVoiceEngine() {
  return getVoiceEngine() === VOICE_ENGINE_LIVE;
}

/** Vertex Live Native Audio model (override via VANI_LIVE_MODEL). */
export const LIVE_MODEL =
  process.env.VANI_LIVE_MODEL || "gemini-live-2.5-flash-native-audio";

/** Input PCM expected from browser → Gemini Live (16-bit LE mono). */
export const LIVE_INPUT_SAMPLE_RATE = Number(process.env.VANI_LIVE_INPUT_RATE) || 16_000;

/** Output PCM from Gemini Live (16-bit LE mono). */
export const LIVE_OUTPUT_SAMPLE_RATE = Number(process.env.VANI_LIVE_OUTPUT_RATE) || 24_000;

export const LIVE_INPUT_MIME =
  process.env.VANI_LIVE_INPUT_MIME || `audio/pcm;rate=${LIVE_INPUT_SAMPLE_RATE}`;

export const LIVE_OUTPUT_MIME =
  process.env.VANI_LIVE_OUTPUT_MIME || `audio/pcm;rate=${LIVE_OUTPUT_SAMPLE_RATE}`;

export const LIVE_OUTPUT_FORMAT = "pcm_s16le";

/** Max concurrent Live sessions per user. */
export const LIVE_MAX_SESSIONS_PER_USER =
  Number(process.env.VANI_LIVE_MAX_SESSIONS_PER_USER) || 2;

/** Idle timeout for a Live bridge with no audio activity. */
export const LIVE_IDLE_TIMEOUT_MS =
  Number(process.env.VANI_LIVE_IDLE_TIMEOUT_MS) || 5 * 60_000;

/** Max base64 PCM chunk from browser (~256 KB decoded). */
export const LIVE_MAX_AUDIO_CHUNK_CHARS = 350_000;
