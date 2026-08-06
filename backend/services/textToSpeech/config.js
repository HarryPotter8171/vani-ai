/** Text-to-speech configuration. */

export const TTS_MODEL =
  process.env.VANI_TTS_MODEL || "gemini-2.5-flash-preview-tts";

/** Fallback models tried in order when the primary is unavailable. */
export const TTS_MODEL_FALLBACKS = [
  TTS_MODEL,
  "gemini-2.5-flash-preview-tts",
  "gemini-2.5-pro-preview-tts",
].filter((v, i, arr) => arr.indexOf(v) === i);

export const TTS_SAMPLE_RATE = 24_000;
export const TTS_CHANNELS = 1;
export const TTS_SAMPLE_WIDTH = 2; // 16-bit PCM

export const TTS_MAX_CHARS = Number(process.env.VANI_TTS_MAX_CHARS) || 4_000;

export const TTS_RATE_LIMIT_WINDOW_MS = 60_000;
export const TTS_RATE_LIMIT_MAX = 60;
