import { captureException } from "../utils/errorTracking.js";
import { getRequestId } from "../utils/logger.js";
import { toErrorBody } from "../utils/errors.js";
import { increment } from "../utils/metrics.js";

/** CORS rejection → 403 instead of an unhandled error. */
export function corsErrorHandler(err, req, res, next) {
  if (err?.message?.startsWith("CORS origin not allowed")) {
    return res.status(403).json({
      error: "Origin not allowed",
      requestId: getRequestId(req),
    });
  }
  return next(err);
}

/**
 * Final safety net — catches anything a controller didn't handle itself.
 * Never leaks stack traces / internals to the client; always logs
 * (structured + Sentry-ready) with requestId + errorId for correlation.
 */
export function globalErrorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const requestId = getRequestId(req);
  const { status, body, errorId } = toErrorBody(err, { requestId });

  // captureException writes structured logs + Sentry (when configured).
  captureException(err, {
    requestId,
    errorId,
    method: req.method,
    url: req.originalUrl,
    status,
  });

  increment("http.errors", { status: String(status) });

  return res.status(status).json(body);
}
