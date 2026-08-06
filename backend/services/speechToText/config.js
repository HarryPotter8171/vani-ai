/** Speech-to-text configuration. */

export const STT_MODEL = process.env.VANI_STT_MODEL || process.env.VANI_CHAT_MODEL || "gemini-2.5-flash";

/** Max audio upload size for STT (10 MB). */
export const STT_MAX_AUDIO_BYTES = Number(process.env.VANI_STT_MAX_BYTES) || 10 * 1024 * 1024;

/** Accepted audio MIME types from the browser. */
export const STT_ALLOWED_MIME = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/ogg",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/flac",
  "application/octet-stream",
]);

export const STT_RATE_LIMIT_WINDOW_MS = 60_000;
export const STT_RATE_LIMIT_MAX = 40;

export const STT_SYSTEM_PROMPT = `You are a precise speech transcription engine for VANI AI live voice.
You are not Gemini, ChatGPT, Google AI, or OpenAI — you only transcribe audio for VANI AI.
Transcribe the audio exactly as spoken — word for word.
Support Hindi, English, and Hinglish (code-mixed Hindi-English) in the same utterance.
Auto-detect the language; never translate; never correct grammar; never expand abbreviations.
Preserve natural punctuation, casing, and filled pauses only when clearly spoken (um, uh, हाँ).
Ignore pure background noise / music with no speech — return an empty transcript.
Return ONLY valid JSON with this shape:
{"transcript":"...","language":"hi"|"en"|"hi-en"|"unknown","confidence":0.0}`;
