import { randomUUID } from "crypto";

/**
 * Standard API error envelope (additive — existing clients that only read
 * `error` continue to work):
 *
 *   {
 *     error: string,          // human-readable, production-safe message
 *     requestId?: string,     // correlates with X-Request-Id / logs
 *     errorId?: string,       // unique id for this failure (support / Sentry)
 *     code?: string           // machine-readable code when available
 *   }
 */

const PUBLIC_DEFAULT = "Something went wrong. Please try again later.";

/** Provider / infra tokens that must never appear in client-facing messages. */
const INTERNAL_LEAK_RE =
  /\b(elevenlabs|openai|anthropic|claude|gemini|vertex(\s*ai)?|google\s*ai|chatgpt|gpt-?\d|groq|ollama|openrouter|tavily|mongodb|mongo\b|redis|jwt|jsonwebtoken|razorpay|stripe|sentry|playwright|puppeteer|websocket|gcp|aws|azure|vertexai|genai|langchain)\b/i;

const ENV_VAR_RE =
  /\b([A-Z][A-Z0-9_]{2,}(_[A-Z0-9]+)+|NEXTAUTH_SECRET|AUTH_JWT_SECRET|MONGODB_URI|REDIS_URL|STRIPE_SECRET_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|ELEVENLABS_API_KEY|GOOGLE_CLOUD_PROJECT|GOOGLE_CLOUD_LOCATION|VANI_[A-Z0-9_]+)\b/;

const FEATURE_MESSAGES = {
  voice: "This feature is temporarily unavailable. Please try again later.",
  image: "Image generation is temporarily unavailable.",
  research: "We couldn't complete your research right now.",
  search: "Search is temporarily unavailable.",
  canvas: "Canvas is temporarily unavailable.",
  browser: "This feature is temporarily unavailable.",
  upload: "Unable to upload your file. Please try again.",
  billing: "We couldn't complete that billing request. Please try again.",
  auth: "Please sign in to continue.",
  chat: "We couldn't generate a response. Please try again.",
  tts: "Speech is temporarily unavailable. Please try again later.",
  code: "Code execution is temporarily unavailable.",
  generic: PUBLIC_DEFAULT,
};

const PATTERN_MAP = [
  {
    test: /elevenlabs|tts|speech synthesis|text-to-speech|voice\s*(mode|session)/i,
    message: FEATURE_MESSAGES.voice,
  },
  {
    test: /image\s*(gen|edit|generation)|dall-?e|imagen/i,
    message: FEATURE_MESSAGES.image,
  },
  {
    test: /deep\s*research|research\s*(failed|session)/i,
    message: FEATURE_MESSAGES.research,
  },
  {
    test: /web\s*search|tavily|grounding/i,
    message: FEATURE_MESSAGES.search,
  },
  { test: /canvas/i, message: FEATURE_MESSAGES.canvas },
  {
    test: /browser|playwright|puppeteer/i,
    message: FEATURE_MESSAGES.browser,
  },
  {
    test: /upload|multipart|file\s*too\s*large/i,
    message: FEATURE_MESSAGES.upload,
  },
  {
    test: /openai|anthropic|gemini|vertex|groq|chatgpt|gpt-?\d|claude|api\s*error|provider|is not configured/i,
    message: FEATURE_MESSAGES.chat,
  },
  {
    test: /mongodb|mongo\b|redis|mongoose/i,
    message: FEATURE_MESSAGES.generic,
  },
  {
    test: /jwt|jsonwebtoken|token\s*(expired|invalid|revoked)/i,
    message: "Please sign in again to continue.",
  },
  {
    test: /stripe|razorpay|payment|billing/i,
    message: FEATURE_MESSAGES.billing,
  },
  {
    test: /unauthorized|authentication required|sign[\s-]?in/i,
    message: FEATURE_MESSAGES.auth,
  },
  {
    test: /timed?\s*out|timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|failed to fetch|network/i,
    message: "Connection lost. Please try again.",
  },
  {
    test: /quota|plan[_ ]required|usage limit/i,
    message: "You've reached your plan limit. Upgrade to continue.",
  },
];

export function isDeveloperMode() {
  return process.env.NODE_ENV === "development";
}

/**
 * Map any internal error into a production-safe client message.
 * Never returns stacks, provider names, env vars, or infra details.
 *
 * @param {unknown} input
 * @param {string} [fallback]
 * @returns {string}
 */
export function toPublicErrorMessage(input, fallback = PUBLIC_DEFAULT) {
  let raw = "";
  if (typeof input === "string") raw = input;
  else if (input instanceof Error) raw = input.message;
  else if (input && typeof input === "object" && "message" in input) {
    raw = String(/** @type {{ message?: unknown }} */ (input).message ?? "");
  }

  const trimmed = raw.trim();
  if (!trimmed) return fallback;

  // AppError / intentional 4xx that already looks safe — still scrub leaks.
  for (const { test, message } of PATTERN_MAP) {
    if (test.test(trimmed)) return message;
  }

  if (INTERNAL_LEAK_RE.test(trimmed) || ENV_VAR_RE.test(trimmed)) {
    return fallback;
  }

  if (/\bat\s+\S+\s*\(/.test(trimmed)) return fallback; // stack frame
  if (/^(TypeError|ReferenceError|SyntaxError|MongoError|MongoServerError)\b/i.test(trimmed)) {
    return fallback;
  }
  if (/ECONN|ENOTFOUND|ETIMEDOUT|ERR_/i.test(trimmed)) return fallback;
  if (/^\s*\{[\s\S]*\}\s*$/.test(trimmed)) return fallback;
  if (/status\s*[:=]?\s*\d{3}/i.test(trimmed)) return fallback;
  if (/API error|is not configured/i.test(trimmed)) return fallback;

  // Cap length — long SDK dumps are never useful to end users.
  if (trimmed.length > 160) return fallback;

  // Allow short, curated product messages (validation, not-found, etc.).
  return trimmed;
}

/**
 * Resolve a feature-scoped public message, falling back to scrubbing `input`.
 * @param {keyof typeof FEATURE_MESSAGES | string} feature
 * @param {unknown} [input]
 */
export function publicFeatureError(feature, input) {
  const scoped =
    FEATURE_MESSAGES[/** @type {keyof typeof FEATURE_MESSAGES} */ (feature)] ||
    PUBLIC_DEFAULT;
  if (input == null || input === "") return scoped;
  return toPublicErrorMessage(input, scoped);
}

export class AppError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, code?: string, expose?: boolean, cause?: unknown }} [opts]
   */
  constructor(message, opts = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "AppError";
    this.status = Number.isInteger(opts.status) ? opts.status : 500;
    this.code = opts.code || undefined;
    // 4xx are safe to expose by default; 5xx hide internals unless opted in.
    this.expose = opts.expose ?? this.status < 500;
    this.errorId = randomUUID();
  }
}

/** @param {number} status @param {string} message @param {string} [code] */
export function createHttpError(status, message, code) {
  return new AppError(message, { status, code, expose: status < 500 });
}

/**
 * Build the standard JSON body for an error response.
 * Never leaks stack traces, provider names, or internal details.
 *
 * @param {unknown} err
 * @param {{ requestId?: string | null, fallback?: string }} [ctx]
 */
export function toErrorBody(err, ctx = {}) {
  const appErr = err instanceof AppError ? err : null;
  const status = Number.isInteger(err?.status)
    ? err.status
    : Number.isInteger(err?.statusCode)
      ? err.statusCode
      : 500;
  const errorId = appErr?.errorId || randomUUID();
  const code = appErr?.code || err?.code;
  const expose = appErr ? appErr.expose : status < 500;
  const fallback = ctx.fallback || (status >= 500 ? "Internal server error" : "Request failed");

  let message;
  if (expose && err?.message) {
    message = toPublicErrorMessage(err.message, fallback);
  } else {
    message = status >= 500 ? "Internal server error" : fallback;
  }

  // Database-down: never leak mongo internals; always use the stable code.
  const isDbDown =
    code === "DATABASE_UNAVAILABLE" ||
    /buffering timed out|MongoNotConnectedError|failed to connect/i.test(
      String(err?.message || "")
    );

  const body = {
    error: isDbDown ? "Database temporarily unavailable" : message,
    errorId,
  };
  if (isDbDown) {
    body.success = false;
    body.code = "DATABASE_UNAVAILABLE";
    return { status: 503, body, errorId };
  }
  if (ctx.requestId) body.requestId = ctx.requestId;
  if (typeof code === "string" && code && code !== "ERR_HTTP_INVALID_STATUS_CODE") {
    // Only surface intentional application codes (not Node internal codes).
    if (/^[A-Z][A-Z0-9_]+$/.test(code) || code.startsWith("ENV_")) {
      // Never expose ENV_* codes to clients in production — they tip off config.
      if (!(code.startsWith("ENV_") && process.env.NODE_ENV === "production")) {
        body.code = code;
      }
    }
  }
  return { status, body, errorId };
}

/**
 * Express helper — write a sanitized JSON error. Prefer this over
 * `res.status().json({ error: err.message })`.
 *
 * @param {import('express').Response} res
 * @param {unknown} err
 * @param {{ fallback?: string, status?: number, code?: string, requestId?: string }} [opts]
 */
export function respondError(res, err, opts = {}) {
  const status =
    opts.status ||
    (Number.isInteger(err?.status) ? err.status : undefined) ||
    (Number.isInteger(err?.statusCode) ? err.statusCode : undefined) ||
    500;
  const fallback = opts.fallback || (status >= 500 ? "Internal server error" : "Request failed");
  const message = toPublicErrorMessage(err, fallback);
  const body = {
    error: message,
    errorId: err?.errorId || randomUUID(),
  };
  if (opts.requestId) body.requestId = opts.requestId;
  const code = opts.code || err?.code;
  if (typeof code === "string" && /^[A-Z][A-Z0-9_]+$/.test(code)) {
    body.code = code;
  }
  return res.status(status).json(body);
}
