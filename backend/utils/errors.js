import { randomUUID } from "crypto";

/**
 * Standard API error envelope (additive — existing clients that only read
 * `error` continue to work):
 *
 *   {
 *     error: string,          // human-readable message
 *     requestId?: string,     // correlates with X-Request-Id / logs
 *     errorId?: string,       // unique id for this failure (support / Sentry)
 *     code?: string           // machine-readable code when available
 *   }
 */

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
 * Never leaks stack traces or internal details for 5xx.
 *
 * @param {unknown} err
 * @param {{ requestId?: string | null }} [ctx]
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
  const message = expose
    ? err?.message || "Request failed"
    : "Internal server error";

  const body = {
    error: message,
    errorId,
  };
  if (ctx.requestId) body.requestId = ctx.requestId;
  if (typeof code === "string" && code && code !== "ERR_HTTP_INVALID_STATUS_CODE") {
    // Only surface intentional application codes (not Node internal codes).
    if (/^[A-Z][A-Z0-9_]+$/.test(code) || code.startsWith("ENV_")) {
      body.code = code;
    }
  }
  return { status, body, errorId };
}
