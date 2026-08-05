// Side-effect import — must be the very first import so `.env` values are
// populated before any other module's top-level code (loggers, config
// constants, etc.) reads `process.env`. A plain `import dotenv from "dotenv"`
// followed by a later `dotenv.config()` call does NOT guarantee this in ESM,
// since all static imports are evaluated before the importing module's own
// statements run.
import "dotenv/config";

import mongoose from "mongoose";
import { validateEnvironment } from "./config/validateEnv.js";
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

// Fail fast on a misconfigured production deployment rather than serving
// traffic with broken auth / persistence / AI credentials.
try {
  validateEnvironment();
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

mongoose.connection.on("error", (err) => {
  logger.error({ err: err.message }, "[mongo] connection error");
});
mongoose.connection.on("disconnected", () => {
  logger.warn("[mongo] disconnected");
});

// Database / cache connect concurrently with the HTTP listener coming up —
// matches prior boot behavior (no artificial delay before accepting
// traffic); /health and /ready reflect live connection state at request time.
mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    logger.info("[mongo] connected");
    await initBilling();
  })
  .catch((err) => {
    logger.error({ err: err.message }, "[mongo] initial connection failed");
  });

if (isRedisConfigured()) {
  connectRedis();
} else {
  logger.info("[redis] not configured — rate limiting will use the in-process fallback");
}

const PORT = process.env.PORT || 5001;
const httpServer = app.listen(PORT, () => {
  logger.info(`Backend running on port ${PORT}`);
  startMemoryCleanupScheduler();
});

// Duplex voice gateway — streaming mic + TTS over a single WebSocket.
// HTTP /api/voice/* remains for session CRUD and fallback STT/TTS.
const voiceWs = attachVoiceWebSocket(httpServer);

// --- Graceful shutdown -------------------------------------------------
// Stop accepting new connections, then tear down every background
// resource (DB, cache, browser sessions, MCP sessions, OCR worker,
// schedulers) before exiting, so in-flight work isn't corrupted and no
// process/handle is left dangling.
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
