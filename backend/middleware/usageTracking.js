/**
 * Usage tracking middleware — records billing metrics after successful requests.
 *
 * Non-blocking: never fails the request. Maps route patterns → usage metrics.
 * Requires auth to have run first when placed after requireAuth on routers,
 * OR reads req.user when available after global finish (set by route auth).
 *
 * Soft tracking only — does not enforce quotas (foundation phase).
 */

import { billingService } from "../billing/init.js";

/** @typedef {import("../billing/types.ts").UsageMetric} UsageMetric */

/**
 * Route → metric mapping. First match wins.
 * quantity can be a number or a function(req, res) → number.
 */
const ROUTE_RULES = [
  // Primary chat upsert / stream path
  {
    methods: ["POST"],
    match: /^\/api\/chat\/?$/,
    metric: "chat_requests",
    quantity: 1,
  },
  {
    methods: ["POST"],
    match: /^\/api\/agents\/run\/?$/,
    metric: "chat_requests",
    quantity: 1,
  },
  {
    methods: ["POST"],
    match: /^\/api\/research\/run\/?$/,
    metric: "research_runs",
    quantity: 1,
  },
  {
    methods: ["POST"],
    match: /^\/api\/browser\/runs\/?$/,
    metric: "browser_sessions",
    quantity: 1,
  },
  {
    methods: ["POST"],
    match: /^\/api\/code\/sessions\/[^/]+\/execute\/?$/,
    metric: "code_executions",
    quantity: 1,
  },
  {
    methods: ["POST"],
    match: /^\/api\/voice\/(stt|tts)\/?$/,
    metric: "voice_minutes",
    // Approximate: 1 unit per call until duration plumbing lands.
    quantity: 1,
  },
  {
    methods: ["POST"],
    match: /^\/api\/voice\/session\/?$/,
    metric: "voice_minutes",
    quantity: 1,
  },
  {
    methods: ["POST"],
    match: /^\/api\/files\/upload\/?$/,
    metric: "file_storage_bytes",
    quantity: (req) => {
      const files = req.files || (req.file ? [req.file] : []);
      const sum = files.reduce((n, f) => n + (Number(f.size) || 0), 0);
      if (sum > 0) return sum;
      const declared = Number(req.body?.size || req.body?.bytes);
      return Number.isFinite(declared) && declared > 0 ? declared : 0;
    },
  },
];

function normalizePath(req) {
  const raw = req.originalUrl || req.url || "";
  return String(raw).split("?")[0];
}

function resolveUserId(req) {
  if (req.user?._id) return String(req.user._id);
  if (req.user?.id) return String(req.user.id);
  if (req.billingUserId) return String(req.billingUserId);
  return null;
}

function matchRule(req) {
  const method = String(req.method || "GET").toUpperCase();
  const path = normalizePath(req);
  for (const rule of ROUTE_RULES) {
    if (!rule.methods.includes(method)) continue;
    if (rule.match.test(path)) return rule;
  }
  return null;
}

/**
 * Controllers may call this to record token / image usage with precise amounts.
 * Safe no-op when billing is unavailable.
 */
export async function recordBillingUsage(userId, metric, quantity = 1, meta) {
  if (!userId || !billingService.isMetric(metric)) return null;
  return billingService.recordUsage({ userId, metric, quantity, meta });
}

/**
 * Express middleware — attach once after body parsers in createApp().
 * Records on res "finish" when status is 2xx and a rule matches.
 */
export function usageTrackingMiddleware(req, res, next) {
  const path = normalizePath(req);
  if (
    path === "/health" ||
    path === "/ready" ||
    path === "/version" ||
    path.startsWith("/api/billing/webhooks")
  ) {
    return next();
  }

  res.on("finish", () => {
    try {
      const status = res.statusCode || 0;
      if (status < 200 || status >= 300) return;

      const userId = resolveUserId(req);
      if (!userId) return;

      const rule = matchRule(req);
      if (!rule) return;

      let quantity =
        typeof rule.quantity === "function"
          ? rule.quantity(req, res)
          : rule.quantity;
      quantity = Number(quantity);
      if (!Number.isFinite(quantity) || quantity === 0) return;

      // Fire-and-forget — never block response teardown.
      void billingService
        .recordUsage({
          userId,
          metric: rule.metric,
          quantity,
          meta: { path: normalizePath(req), method: req.method, status },
        })
        .catch(() => undefined);

      // Optional token hint from controllers (e.g. chat stream).
      const tokens = Number(res.locals?.billingTokens || req.billingTokens);
      if (Number.isFinite(tokens) && tokens > 0) {
        void billingService
          .recordUsage({
            userId,
            metric: "tokens",
            quantity: tokens,
            meta: { path: normalizePath(req) },
          })
          .catch(() => undefined);
      }

      const images = Number(res.locals?.billingImages || req.billingImages);
      if (Number.isFinite(images) && images > 0) {
        void billingService
          .recordUsage({
            userId,
            metric: "image_generation",
            quantity: images,
            meta: { path: normalizePath(req) },
          })
          .catch(() => undefined);
      }
    } catch (err) {
      console.warn(
        "[billing:middleware]",
        err instanceof Error ? err.message : err
      );
    }
  });

  next();
}

export { ROUTE_RULES };
