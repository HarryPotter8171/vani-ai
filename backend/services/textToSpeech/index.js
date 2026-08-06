export {
  TTS_MODEL,
  TTS_MODEL_FALLBACKS,
  TTS_SAMPLE_RATE,
  TTS_CHANNELS,
  TTS_SAMPLE_WIDTH,
  TTS_MAX_CHARS,
  TTS_RATE_LIMIT_MAX,
  TTS_RATE_LIMIT_WINDOW_MS,
} from "./config.js";
export { TTS_VOICES, DEFAULT_VOICE, resolveVoice, clampSpeed } from "./voices.js";
export {
  sanitizeForSpeech,
  synthesizeSpeech,
  synthesizeSpeechStream,
} from "./synthesize.js";
