import express from "express";
import cors from "cors";
import compression from "compression";
import chatRoutes from "./routes/chatRoutes.js";
import legacyChatRoutes from "./routes/legacyChatRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";
import fileRoutes from "./routes/fileRoutes.js";
import voiceRoutes from "./routes/voiceRoutes.js";
import ttsRoutes from "./routes/ttsRoutes.js";
import memoryRoutes from "./routes/memoryRoutes.js";
import canvasRoutes from "./routes/canvasRoutes.js";
import agentRoutes from "./routes/agentRoutes.js";
import researchRoutes from "./routes/researchRoutes.js";
import mcpRoutes from "./routes/mcpRoutes.js";
import browserRoutes from "./routes/browserRoutes.js";
import codeInterpreterRoutes from "./routes/codeInterpreterRoutes.js";
import billingRoutes from "./routes/billingRoutes.js";
import billingWebhookRoutes from "./routes/billingWebhookRoutes.js";
import teamsRoutes from "./routes/teamsRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import modelRoutes from "./routes/modelRoutes.js";
import { initTools, listTools } from "./tools/index.js";
import { initAgentTools, listAgentTools } from "./agents/index.js";
import { initMcp } from "./mcp/init.js";
import { initBrowser } from "./browser/init.js";
import { initCodeInterpreter } from "./services/codeInterpreter/init.js";
import { initBilling } from "./billing/init.js";
import { usageTrackingMiddleware } from "./middleware/usageTracking.js";
import { analyticsLoggingMiddleware } from "./middleware/analyticsLogging.js";
import { requireMongoReady } from "./middleware/mongoReady.js";
import { corsOriginDelegate } from "./utils/corsOrigins.js";
import { httpLogger } from "./utils/logger.js";
import { securityHeaders } from "./middleware/securityHeaders.js";
import { requestTiming } from "./middleware/requestTiming.js";
import { corsErrorHandler, globalErrorHandler } from "./middleware/errorHandler.js";
import { configureMongoose } from "./config/mongoReady.js";

/**
 * Build the Express application (no DB connect, no `listen`).
 * Kept separate from `server.js` so tests can import a real, fully-wired
 * app with Supertest without opening a network port or a live Mongo
 * connection at import time.
 */
export function createApp() {
  // Ensure buffering is off even when tests import createApp without server.js.
  configureMongoose();

  // Register model-callable tools / agent plugins / MCP / browser wiring.
  // Idempotent — safe to call once per process even across multiple test files.
  initTools();
  initAgentTools();
  initMcp();
  initBrowser();
  initCodeInterpreter();
  // Seed plan catalog when Mongo is already up; otherwise soft-defers.
  void initBilling();

  const app = express();

  // Behind a reverse proxy / load balancer, trust X-Forwarded-* so rate
  // limiting and logs see the real client IP. Opt-in via TRUST_PROXY, or
  // on by default in production. Tests leave this unset.
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy === "true" || trustProxy === "1") {
    app.set("trust proxy", 1);
  } else if (trustProxy && /^\d+$/.test(trustProxy)) {
    app.set("trust proxy", Number(trustProxy));
  } else if (process.env.NODE_ENV === "production" && trustProxy !== "false") {
    app.set("trust proxy", 1);
  }

  // Structured request logging + request IDs — first, so every request
  // (including CORS rejections and body-parse failures) is observable.
  app.use(httpLogger);

  // Security headers on every response (including probes).
  app.use(securityHeaders);

  // Gzip/Brotli responses — skip SSE and WebSocket upgrades (INF-M1).
  app.use(
    compression({
      filter(req, res) {
        const accept = String(req.headers.accept || "");
        if (accept.includes("text/event-stream") || accept.includes("event-stream")) {
          return false;
        }
        if (String(req.headers.upgrade || "").toLowerCase() === "websocket") {
          return false;
        }
        const contentType = res.getHeader("Content-Type");
        if (
          typeof contentType === "string" &&
          contentType.includes("text/event-stream")
        ) {
          return false;
        }
        return compression.filter(req, res);
      },
    })
  );

  // Metrics / performance timing hooks (complements pino-http).
  app.use(requestTiming);

  // Durable analytics logging (DailyUsage + AnalyticsEvent) — non-blocking.
  app.use(analyticsLoggingMiddleware);

  // Liveness/readiness/version probes — unauthenticated, no CORS/body-parsing
  // overhead, always reachable regardless of app-level config issues.
  // MUST stay above requireMongoReady so orchestrators can probe while DB is down.
  app.use(healthRoutes);

  // CORS — environment whitelist only (never origin: "*"). Credentials enabled.
  app.use(
    cors({
      origin: corsOriginDelegate,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "Cache-Control",
        "Pragma",
        "X-Request-Id",
      ],
      exposedHeaders: ["X-Request-Id"],
    })
  );

  // Stripe / Razorpay webhooks need the raw body for signature verification —
  // mount BEFORE express.json() so the payload is not parsed away.
  app.use(
    "/api/billing/webhooks",
    express.raw({ type: "application/json" }),
    billingWebhookRoutes
  );

  // Raised for multimodal chat payloads (base64 attachments).
  app.use(express.json({ limit: "30mb" }));
  app.use(express.urlencoded({ extended: true, limit: "30mb" }));

  // Soft usage metering — records after successful responses when req.user is set.
  // Hard enforcement lives in middleware/usageGuard.js (usageGuard / usageGuardFeature).
  app.use(usageTrackingMiddleware);

  // Routes
  app.get("/", (req, res) => res.send("Backend is running"));

  // All /api/* DB routes: fail with 503 within ~1s if Mongo is not ready.
  // Never allow mongoose buffering (10s) to hang auth/sync or other handlers.
  app.use("/api", requireMongoReady);

  app.use("/api/auth", authRoutes);
  app.use("/api/models", modelRoutes);
  app.use("/api/chat", chatRoutes);
  app.use("/api", legacyChatRoutes);
  app.use("/api", projectRoutes);
  app.use("/api/files", fileRoutes);
  app.use("/api/voice", voiceRoutes);
  app.use("/api/tts", ttsRoutes);
  app.use("/api/memory", memoryRoutes);
  app.use("/api/canvas", canvasRoutes);
  app.use("/api/agents", agentRoutes);
  app.use("/api/research", researchRoutes);
  app.use("/api/mcp", mcpRoutes);
  app.use("/api/browser", browserRoutes);
  app.use("/api/code", codeInterpreterRoutes);
  app.use("/api/billing", billingRoutes);
  app.use("/api/analytics", analyticsRoutes);
  app.use("/api/teams", teamsRoutes);
  app.use("/api/admin", adminRoutes);

  app.use(corsErrorHandler);
  app.use(globalErrorHandler);

  return app;
}

export { listTools, listAgentTools };

export default createApp;
