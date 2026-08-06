/**
 * Analytics config — cost estimates, sampling, retention.
 * Tunable via env; defaults are conservative for production.
 */

/** USD per 1M tokens (blended estimate across providers). */
export const TOKEN_COST_PER_MILLION =
  Number(process.env.VANI_ANALYTICS_TOKEN_COST_PER_M) || 2.5;

/** USD per generated image (estimate). */
export const IMAGE_COST_EACH =
  Number(process.env.VANI_ANALYTICS_IMAGE_COST) || 0.04;

/** USD per voice minute (estimate). */
export const VOICE_COST_PER_MINUTE =
  Number(process.env.VANI_ANALYTICS_VOICE_COST_PER_MIN) || 0.006;

/** Sample rate for successful API request event persistence (0–1). Errors always logged. */
export const API_EVENT_SAMPLE_RATE = (() => {
  const n = Number(process.env.VANI_ANALYTICS_SAMPLE_RATE);
  if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  return process.env.NODE_ENV === "production" ? 0.25 : 1;
})();

export const ACTIVE_USER_WINDOW_DAYS =
  Number(process.env.VANI_ANALYTICS_ACTIVE_DAYS) || 30;

export function estimateApiCost({ tokens = 0, images = 0, voiceMinutes = 0 } = {}) {
  const tokenCost = (Number(tokens) / 1_000_000) * TOKEN_COST_PER_MILLION;
  const imageCost = Number(images) * IMAGE_COST_EACH;
  const voiceCost = Number(voiceMinutes) * VOICE_COST_PER_MINUTE;
  return +(tokenCost + imageCost + voiceCost).toFixed(4);
}

/** UTC midnight for a Date. */
export function utcDayStart(d = new Date()) {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)
  );
}

/** Inclusive list of UTC day starts from `start` through `end`. */
export function eachUtcDay(start, end) {
  const days = [];
  let cur = utcDayStart(start);
  const last = utcDayStart(end);
  while (cur <= last) {
    days.push(new Date(cur));
    cur = new Date(cur.getTime() + 86400000);
  }
  return days;
}
