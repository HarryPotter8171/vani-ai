/**
 * Central Error Presentation Layer — map ANY internal/provider/network error
 * into production-safe copy before it reaches the UI.
 *
 * Rules:
 * - Never surface stacks, status codes, provider names, env vars, or infra.
 * - Developer mode (NODE_ENV=development or localhost) may log full detail
 *   to the console — never into toast / banners / chat.
 */

export type ErrorFeature =
  | 'voice'
  | 'image'
  | 'research'
  | 'search'
  | 'canvas'
  | 'browser'
  | 'upload'
  | 'file'
  | 'billing'
  | 'auth'
  | 'memory'
  | 'agent'
  | 'code'
  | 'tts'
  | 'chat'
  | 'generic';

export interface UserFriendlyErrorOptions {
  /** Feature-specific fallback when no pattern matches. */
  feature?: ErrorFeature;
  /** Override the final fallback string. */
  fallback?: string;
}

const FRIENDLY_DEFAULT = 'Something went wrong. Please try again later.';

const FEATURE_DEFAULTS: Record<ErrorFeature, string> = {
  voice: 'This feature is temporarily unavailable. Please try again later.',
  image: 'Image generation is temporarily unavailable.',
  research: "We couldn't complete your research right now.",
  search: 'Search is temporarily unavailable.',
  canvas: 'Canvas is temporarily unavailable.',
  browser: 'This feature is temporarily unavailable.',
  upload: 'Unable to upload your file. Please try again.',
  file: "We couldn't process this file. Please try again.",
  billing: "We couldn't complete that billing request. Please try again.",
  auth: 'Please sign in to continue.',
  memory: "We couldn't update memory right now. Please try again.",
  agent: "We couldn't complete that task right now. Please try again.",
  code: 'Code execution is temporarily unavailable.',
  tts: 'Speech is temporarily unavailable. Please try again later.',
  chat: "We couldn't generate a response. Please try again.",
  generic: FRIENDLY_DEFAULT,
};

/** Provider / infra tokens that must never appear in user-facing copy. */
const INTERNAL_LEAK_RE =
  /\b(elevenlabs|openai|anthropic|claude|gemini|vertex(\s*ai)?|google\s*ai|chatgpt|gpt-?\d|groq|ollama|openrouter|tavily|mongodb|mongo\b|redis|jwt|jsonwebtoken|razorpay|stripe|sentry|playwright|puppeteer|websocket|gcp|aws|azure|vertexai|genai|langchain)\b/i;

const ENV_VAR_RE =
  /\b([A-Z][A-Z0-9_]{2,}(_[A-Z0-9]+)+|NEXTAUTH_SECRET|AUTH_JWT_SECRET|MONGODB_URI|REDIS_URL|STRIPE_SECRET_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|ELEVENLABS_API_KEY|GOOGLE_CLOUD_PROJECT|GOOGLE_CLOUD_LOCATION|VANI_[A-Z0-9_]+)\b/;

const FEATURE_HINT_RE: Array<{ test: RegExp; feature: ErrorFeature }> = [
  {
    test: /voice|microphone|getusermedia|elevenlabs|tts|stt|speech|live\s*mode|listening/i,
    feature: 'voice',
  },
  {
    test: /image(\s*(gen|edit|generation))?|dall-?e|imagen|vision/i,
    feature: 'image',
  },
  { test: /deep\s*research|research\s*(session|failed|query)/i, feature: 'research' },
  { test: /web\s*search|search\s*(failed|unavailable)|tavily|grounding/i, feature: 'search' },
  { test: /canvas/i, feature: 'canvas' },
  { test: /browser(\s*automation)?|playwright|puppeteer/i, feature: 'browser' },
  { test: /upload|multipart|file\s*too\s*large/i, feature: 'upload' },
  { test: /quota|plan[_ ]required|billing|subscription|stripe|razorpay/i, feature: 'billing' },
  { test: /auth|sign[\s-]?in|token|unauthorized|jwt/i, feature: 'auth' },
  { test: /memory/i, feature: 'memory' },
  { test: /agent|tool\s*execution/i, feature: 'agent' },
  { test: /code\s*(interpreter|execution)|kernel|python/i, feature: 'code' },
];

const EXACT_MAP: Record<string, string> = {
  'failed to fetch': 'Connection lost. Please try again.',
  'networkerror when attempting to fetch resource.':
    'Connection lost. Please try again.',
  'network request failed': 'Connection lost. Please try again.',
  'load failed': 'Connection lost. Please try again.',
  'permission denied': "You don't have permission to do that.",
  notallowederror: 'Microphone access is needed for voice. Check your browser settings.',
  forbidden: "You don't have permission to do that.",
  unauthorized: 'Please sign in to continue.',
  'authentication required': 'Please sign in to continue.',
  'internal server error': "We're having trouble on our side. Please try again in a moment.",
  'bad gateway': "We're having trouble on our side. Please try again in a moment.",
  'service unavailable': "We're having trouble on our side. Please try again in a moment.",
  'gateway timeout': 'Connection lost. Please try again.',
  'request timed out': 'Connection lost. Please try again.',
  'backend unavailable': "We're having trouble connecting. We'll keep trying.",
  'cannot load': "We couldn't load that. Please try again.",
  fallback: "Something didn't work as expected. Please try again.",
  aborterror: 'Request was cancelled.',
  'the user aborted a request.': 'Request was cancelled.',
  'quota exceeded': "You've reached your plan limit. Upgrade to continue.",
  'plan limit reached': "You've reached your plan limit. Upgrade to continue.",
  'unable to obtain access token': 'Please sign in again to continue.',
  'unable to authenticate': 'Please sign in to continue.',
  'unable to issue access token': 'Please sign in again to continue.',
  'elevenlabs is not configured.': FEATURE_DEFAULTS.tts,
  'elevenlabs is not configured': FEATURE_DEFAULTS.tts,
  'gemini is not configured': FEATURE_DEFAULTS.chat,
  'openai is not configured': FEATURE_DEFAULTS.chat,
  'anthropic is not configured': FEATURE_DEFAULTS.chat,
  'vertex ai error': FEATURE_DEFAULTS.chat,
  'openai api error': FEATURE_DEFAULTS.chat,
  'gemini api error': FEATURE_DEFAULTS.chat,
  'mongodb error': FRIENDLY_DEFAULT,
  'redis error': FRIENDLY_DEFAULT,
  'jwt error': 'Please sign in again to continue.',
};

const PATTERN_MAP: Array<{ test: RegExp; message: string }> = [
  {
    test: /failed to fetch|networkerror|net::err_|econnrefused|enotfound|offline|connection lost/i,
    message: 'Connection lost. Please try again.',
  },
  {
    test: /timed?\s*out|timeout|aborted.*timeout|ETIMEDOUT/i,
    message: 'Connection lost. Please try again.',
  },
  {
    test: /microphone|getusermedia|notallowederror|mic(rophone)?\s*(access|permission)/i,
    message: 'Microphone access is needed for voice. Check your browser settings.',
  },
  {
    test: /permission denied|not allowed|forbidden|access denied|\b403\b/i,
    message: "You don't have permission to do that.",
  },
  {
    test: /unauthorized|\b401\b|authentication required|sign[\s-]?in/i,
    message: 'Please sign in to continue.',
  },
  {
    test: /internal server error|\b500\b|\b502\b|\b503\b|\b504\b|bad gateway|service unavailable/i,
    message: "We're having trouble on our side. Please try again in a moment.",
  },
  {
    test: /quota|plan[_ ]required|upgrade required|usage limit/i,
    message: "You've reached your plan limit. Upgrade to continue.",
  },
  {
    test: /not found|\b404\b|no longer exists/i,
    message: "We couldn't find that. It may have been moved or deleted.",
  },
  {
    test: /cors|cross-origin/i,
    message: "We couldn't connect securely. Please try again.",
  },
  {
    test: /elevenlabs|tts|speech synthesis|text-to-speech|voice\s*(mode|session|unavailable)/i,
    message: FEATURE_DEFAULTS.voice,
  },
  {
    test: /image\s*(gen|edit|generation|unavailable)|dall-?e|imagen/i,
    message: FEATURE_DEFAULTS.image,
  },
  {
    test: /deep\s*research|research\s*(failed|unavailable|session)/i,
    message: FEATURE_DEFAULTS.research,
  },
  {
    test: /web\s*search|search\s*(failed|unavailable)|tavily/i,
    message: FEATURE_DEFAULTS.search,
  },
  {
    test: /canvas\s*(failed|unavailable|error)/i,
    message: FEATURE_DEFAULTS.canvas,
  },
  {
    test: /browser(\s*automation)?\s*(failed|unavailable)|playwright|puppeteer/i,
    message: FEATURE_DEFAULTS.browser,
  },
  {
    test: /upload|file\s*(too large|rejected|failed)/i,
    message: FEATURE_DEFAULTS.upload,
  },
  {
    test: /openai|anthropic|gemini|vertex|groq|chatgpt|gpt-?\d|claude|api\s*error|provider/i,
    message: FEATURE_DEFAULTS.chat,
  },
  {
    test: /mongodb|mongo\b|redis|mongoose|ECONNREFUSED.*(27017|6379)/i,
    message: FRIENDLY_DEFAULT,
  },
  {
    test: /jwt|jsonwebtoken|token\s*(expired|invalid|revoked)|malformed\s*token/i,
    message: 'Please sign in again to continue.',
  },
  {
    test: /stripe|razorpay|payment\s*gateway|billing.*(not configured|unavailable)/i,
    message: FEATURE_DEFAULTS.billing,
  },
  {
    test: /is not configured|not configured|missing\s*(api\s*)?key|env(ironment)?\s*var/i,
    message: 'This feature is temporarily unavailable. Please try again later.',
  },
];

/** True when running locally / in development — full diagnostics allowed in console only. */
export function isDeveloperMode(): boolean {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
    return true;
  }
  if (typeof window !== 'undefined') {
    const host = window.location?.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') {
      return true;
    }
  }
  return false;
}

/** Log full technical detail only in developer mode. */
export function logDevError(input: unknown, context?: string): void {
  if (typeof console === 'undefined') return;
  // Intentional cancels (Stop / barge-in) — never look like hard failures.
  if (
    (input instanceof Error &&
      (input.name === 'AbortError' || /aborted/i.test(input.message))) ||
    (typeof DOMException !== 'undefined' &&
      input instanceof DOMException &&
      input.name === 'AbortError')
  ) {
    if (isDeveloperMode()) {
      console.debug(context ? `[cancel:${context}]` : '[cancel]', input);
    }
    return;
  }
  const label = context ? `[error:${context}]` : '[error]';
  if (isDeveloperMode()) {
    console.error(label, input);
  } else if (input instanceof Error) {
    console.error(label, input.message);
  } else {
    console.error(label, typeof input === 'string' ? input : 'request failed');
  }
}

function extractRaw(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input instanceof Error) return input.message;
  if (input && typeof input === 'object') {
    const obj = input as { message?: unknown; error?: unknown };
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.error === 'string') return obj.error;
  }
  return '';
}

function resolveFallback(opts?: UserFriendlyErrorOptions, raw = ''): string {
  if (opts?.fallback) return opts.fallback;
  if (opts?.feature) return FEATURE_DEFAULTS[opts.feature];
  for (const { test, feature } of FEATURE_HINT_RE) {
    if (test.test(raw)) return FEATURE_DEFAULTS[feature];
  }
  return FRIENDLY_DEFAULT;
}

/** True when a string looks like raw technical noise unsuitable for users. */
export function isTechnicalErrorMessage(raw: string): boolean {
  const s = raw.trim();
  if (!s) return true;
  if (/^Error:/i.test(s)) return true;
  if (/\bat\s+\S+\s*\(/.test(s)) return true; // stack frame
  if (/^\s*\{[\s\S]*\}\s*$/.test(s)) return true; // raw JSON
  if (/^(TypeError|ReferenceError|SyntaxError|NetworkError|DOMException)\b/i.test(s))
    return true;
  if (/status\s*[:=]?\s*\d{3}/i.test(s)) return true;
  if (/ECONN|ENOTFOUND|ETIMEDOUT|ERR_/i.test(s)) return true;
  if (/Failed to fetch|Internal Server Error|Permission denied/i.test(s)) return true;
  if (/^https?:\/\//i.test(s)) return true;
  if (INTERNAL_LEAK_RE.test(s)) return true;
  if (ENV_VAR_RE.test(s)) return true;
  if (/is not configured/i.test(s)) return true;
  if (/API error/i.test(s)) return true;
  if (/stack|traceback|exception/i.test(s) && s.length > 80) return true;
  return false;
}

/**
 * Convert any thrown value / API string into short, production-safe copy.
 * Prefer this (or `toUserFacingError`) at every UI boundary.
 */
export function getUserFriendlyError(
  input: unknown,
  optionsOrFallback?: UserFriendlyErrorOptions | string
): string {
  const opts: UserFriendlyErrorOptions =
    typeof optionsOrFallback === 'string'
      ? { fallback: optionsOrFallback }
      : optionsOrFallback || {};

  const raw = extractRaw(input);
  const trimmed = raw.trim();
  const fallback = resolveFallback(opts, trimmed);

  if (!trimmed) return fallback;

  const lower = trimmed.toLowerCase();
  if (EXACT_MAP[lower]) return EXACT_MAP[lower];

  for (const { test, message } of PATTERN_MAP) {
    if (test.test(trimmed)) return message;
  }

  // Hard scrub: never pass through provider / env / infra leaks.
  if (INTERNAL_LEAK_RE.test(trimmed) || ENV_VAR_RE.test(trimmed)) {
    return fallback;
  }

  // Explicit feature context → never echo arbitrary upstream strings.
  if (opts.feature) {
    return fallback;
  }

  let cleaned = trimmed
    .replace(/^(Error|TypeError|NetworkError):\s*/i, '')
    .replace(/\s*\(\d{3}\)\s*$/, '')
    .replace(/\s+status\s*[:=]?\s*\d{3}\s*$/i, '')
    .trim();

  if (!cleaned || isTechnicalErrorMessage(cleaned)) {
    return fallback;
  }

  if (cleaned.length > 140) {
    cleaned = `${cleaned.slice(0, 137).trimEnd()}…`;
  }

  return cleaned;
}

/** Alias kept for existing call sites. */
export function toUserFacingError(
  input: unknown,
  fallback: string = FRIENDLY_DEFAULT
): string {
  return getUserFriendlyError(input, { fallback });
}

/** Log technical detail (dev-gated), return friendly string for UI. */
export function reportAndFace(
  input: unknown,
  fallback?: string,
  context?: string
): string {
  logDevError(input, context);
  return getUserFriendlyError(input, { fallback });
}
