/**
 * Production security headers for the API.
 *
 * Applied to every response (including /health, /ready, /version). Values are
 * conservative for a JSON API that is never meant to be framed or execute
 * untrusted scripts. HSTS is production-only so local HTTP dev is unaffected.
 */

const isProduction = () => process.env.NODE_ENV === "production";

/** Build a restrictive CSP suitable for a JSON API backend. */
export function buildContentSecurityPolicy() {
  // API responses are not HTML documents; block everything by default and
  // forbid framing. Controllers that serve rare HTML (none today) can override.
  return [
    "default-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

/** @param {import('express').Request} _req @param {import('express').Response} res @param {import('express').NextFunction} next */
export function securityHeaders(_req, res, next) {
  res.setHeader("Content-Security-Policy", buildContentSecurityPolicy());
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Permissions-Policy",
    [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "interest-cohort=()",
    ].join(", ")
  );
  res.setHeader("X-DNS-Prefetch-Control", "off");

  if (isProduction()) {
    // 2 years, includeSubDomains. preload only when explicitly opted in —
    // submitting to the HSTS preload list is irreversible for a domain.
    const preload = process.env.HSTS_PRELOAD === "true" ? "; preload" : "";
    res.setHeader(
      "Strict-Transport-Security",
      `max-age=63072000; includeSubDomains${preload}`
    );
  }

  next();
}
