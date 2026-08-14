// Side-effect import — must be the very first import so `.env` values are
// populated before any other module's top-level code (loggers, config
// constants, etc.) reads `process.env`. A plain `import dotenv from "dotenv"`
// followed by a later `dotenv.config()` call does NOT guarantee this in ESM,
// since all static imports are evaluated before the importing module's own
// statements run.
import "dotenv/config";

// Disable mongoose buffering BEFORE models/routes load (createApp → models).
import {
  configureMongoose,
  connectMongo,
  isMongoAuthError,
  isMongoReady,
} from "./config/mongoReady.js";
configureMongoose();

import mongoose from "mongoose";
import { materializeGcpCredentialsFromEnv } from "./config/gcpCredentials.js";
import { validateEnvironment } from "./config/validateEnv.js";
import { validateMongoUriConfig } from "./config/mongoUri.js";
import { logger } from "./utils/logger.js";
import { initErrorTracking, captureException, flushErrorTracking } from "./utils/errorTracking.js";
import { connectRedis, closeRedis, isRedisConfigured } from "./config/redis.js";
import { createApp, listTools, listAgentTools } from "./app.js";
import {
  startMemoryCleanupScheduler,
  stopMemoryCleanupScheduler,
} from "./services/memory/index.js";
import { shutdownOcrWorker } from "./services/image/ocr.js";
import { browserManager } from "./browser/index.ts";
import { mcpManager } from "./mcp/index.ts";
import { initBilling } from "./billing/init.js";
import { attachVoiceWebSocket } from "./services/voice/index.js";

// Railway / PaaS: inline service-account JSON → temp file + GOOGLE_APPLICATION_CREDENTIALS
// Vercel: GOOGLE_CREDENTIALS_JSON → inline googleAuthOptions.credentials (no temp file)
// before validateEnvironment checks that the credentials path is readable.
// Local: leave both JSON env vars unset; file-path credentials stay as-is.
try {
  materializeGcpCredentialsFromEnv();
} catch (err) {
  logger.error(err.message);
  process.exit(1);
}

// Fail fast on a misconfigured production deployment rather than serving
// traffic with broken auth / persistence / AI credentials.
try {
  validateEnvironment();
} catch (err) {
  logger.error(err.message);
  process.exit(1);
}

// Mongo URI shape / env-var audit before any connect attempt.
// Logs which env is used + host/database; never username/password.
try {
  const mongoCfg = validateMongoUriConfig();
  if (!mongoCfg.ok) {
    throw Object.assign(
      new Error(
        [
          "MongoDB configuration invalid — refusing to start:",
          ...mongoCfg.errors.map((e) => `  - ${e}`),
        ].join("\n")
      ),
      { code: "MONGO_URI_INVALID" }
    );
  }
  for (const w of mongoCfg.warnings) {
    logger.warn(`[mongo] ${w}`);
  }
  logger.info(
    `[mongo] startup validation ok — env=${mongoCfg.envVar} host=${mongoCfg.host} database=${mongoCfg.database}`
  );
} catch (err) {
  logger.error(err.message);
  process.exit(1);
}

initErrorTracking();

process.on("unhandledRejection", (reason) => {
  captureException(reason, { source: "unhandledRejection" });
});
process.on("uncaughtException", (err) => {
  captureException(err, { source: "uncaughtException" });
  // Process state is no longer reliable after a truly uncaught exception —
  // exit and let the process manager (Docker/PM2/k8s) restart cleanly.
  process.exit(1);
});

mongoose.connection.on("error", (err) => {
  logger.error({ err: err.message }, "[mongo] connection error");
});
mongoose.connection.on("disconnected", () => {
  logger.warn("[mongo] disconnected");
});
mongoose.connection.on("reconnected", () => {
  logger.info("[mongo] reconnected");
});

const app = createApp();

logger.info(
  `Tools ready: ${listTools({ includeDisabled: true })
    .map((t) => t.name)
    .join(", ")}`
);
logger.info(
  `Agents ready: ${listAgentTools({ includeDisabled: true })
    .map((t) => t.name())
    .join(", ")}`
);

if (isRedisConfigured()) {
  connectRedis();
} else {
  logger.info("[redis] not configured — rate limiting will use the in-process fallback");
}

const PORT = process.env.PORT || 5001;
const HOST = process.env.HOST || "0.0.0.0";

/**
 * Boot: connect Mongo BEFORE accepting traffic so auth/sync never hits
 * buffering timeouts. Auth / invalid-URI failures exit immediately — we do
 * not retry forever with bad credentials.
 */
async function start() {
  try {
    await connectMongo(undefined, { logger });
    logger.info("[mongo] connected");
    try {
      await initBilling();
    } catch (err) {
      logger.warn({ err: err?.message }, "[billing] init deferred/failed");
    }
  } catch (err) {
    const authFailed =
      err?.code === "MONGO_AUTH_FAILED" ||
      err?.code === "MONGO_URI_INVALID" ||
      isMongoAuthError(err);
    if (authFailed) {
      logger.error(err?.message || String(err));
      process.exit(1);
    }
    // Non-auth connect failure: exit rather than infinite background retry.
    // Process managers (Docker/PM2/k8s) restart with backoff.
    logger.error(
      { err: err?.message },
      "[mongo] initial connection failed — exiting (no infinite retry)"
    );
    process.exit(1);
  }

  const httpServer = app.listen(PORT, HOST, () => {
    logger.info(
      `Backend running on http://${HOST}:${PORT} (mongo ${isMongoReady() ? "ready" : "not ready"})`
    );
    startMemoryCleanupScheduler();
  });

  // Duplex voice gateway — streaming mic + TTS over a single WebSocket.
  // HTTP /api/voice/* remains for session CRUD and fallback STT/TTS.
  const voiceWs = attachVoiceWebSocket(httpServer);

  // --- Graceful shutdown -------------------------------------------------
  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`[shutdown] received ${signal} — shutting down gracefully`);

    const forceExitTimer = setTimeout(() => {
      logger.error("[shutdown] graceful shutdown timed out — forcing exit");
      process.exit(1);
    }, 15_000);
    if (typeof forceExitTimer.unref === "function") forceExitTimer.unref();

    try {
      if (httpServer) {
        await new Promise((resolve) => httpServer.close(() => resolve()));
        logger.info("[shutdown] HTTP server closed");
      }

      stopMemoryCleanupScheduler();

      await Promise.allSettled([
        voiceWs.close().then(() => logger.info("[shutdown] Voice WebSocket closed")),
        mongoose.connection.close().then(() => logger.info("[shutdown] MongoDB connection closed")),
        closeRedis().then(() => logger.info("[shutdown] Redis connection closed")),
        browserManager.shutdown().then(() => logger.info("[shutdown] Browser sessions closed")),
        mcpManager.shutdown().then(() => logger.info("[shutdown] MCP sessions closed")),
        shutdownOcrWorker().then(() => logger.info("[shutdown] OCR worker stopped")),
      ]);

      await flushErrorTracking();

      logger.info("[shutdown] complete");
      clearTimeout(forceExitTimer);
      process.exit(0);
    } catch (err) {
      logger.error({ err: err.message }, "[shutdown] error during shutdown");
      clearTimeout(forceExitTimer);
      process.exit(1);
    }
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

void start();
