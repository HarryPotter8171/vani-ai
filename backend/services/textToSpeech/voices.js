/**
 * Gemini prebuilt TTS voices.
 * Curated subset tuned for conversational Hindi / English / Hinglish.
 */
export const TTS_VOICES = Object.freeze([
  { id: "Kore", name: "Kore", gender: "female", style: "clear, warm" },
  { id: "Aoede", name: "Aoede", gender: "female", style: "bright, expressive" },
  { id: "Leda", name: "Leda", gender: "female", style: "soft, calm" },
  { id: "Zephyr", name: "Zephyr", gender: "female", style: "airy, light" },
  { id: "Puck", name: "Puck", gender: "male", style: "upbeat, playful" },
  { id: "Charon", name: "Charon", gender: "male", style: "deep, steady" },
  { id: "Fenrir", name: "Fenrir", gender: "male", style: "strong, grounded" },
  { id: "Orus", name: "Orus", gender: "male", style: "smooth, narrative" },
]);

export const DEFAULT_VOICE = "Kore";

const VOICE_IDS = new Set(TTS_VOICES.map((v) => v.id));

export function resolveVoice(voice) {
  if (typeof voice === "string" && VOICE_IDS.has(voice)) return voice;
  return DEFAULT_VOICE;
}

/** Playback rate clamp for client-side speed control. */
export function clampSpeed(speed) {
  const n = Number(speed);
  if (!Number.isFinite(n)) return 1;
  return Math.min(1.5, Math.max(0.7, n));
}

/**
 * @deprecated Robotic [slow]/[fast] tags removed — pacing is client playbackRate only.
 * Kept as a no-op export for any residual imports.
 * @param {number} _speed
 */
export function speedToPacingTag(_speed) {
  return "";
}
