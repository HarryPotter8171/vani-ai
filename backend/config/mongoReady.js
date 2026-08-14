/**
 * Central MongoDB readiness — disable buffering, fail fast, never hang 10s.
 *
 * Import this module as early as possible (before models are used) so
 * `bufferCommands: false` is active process-wide.
 */

import mongoose from "mongoose";
import { AppError } from "../utils/errors.js";
import {
  CANONICAL_MONGO_URI_ENV,
  formatMongoAuthFailureMessage,
  isMongoAuthError,
  parseMongoUriSafe,
  validateMongoUriConfig,
} from "./mongoUri.js";

export {
  CANONICAL_MONGO_URI_ENV,
  formatMongoAuthFailureMessage,
  isMongoAuthError,
  validateMongoUriConfig,
} from "./mongoUri.js";

/** Max time ensureMongoReady waits for an in-progress connection. */
export const MONGO_READY_TIMEOUT_MS = 1_000;

/** Connect attempt server selection budget (driver-level). */
export const MONGO_SERVER_SELECTION_MS = 5_000;

let configured = false;
let connectPromise = null;

/** Last validated URI meta (host/db only) for auth-failure messages. */
let lastUriMeta = null;

/**
 * Disable mongoose command buffering globally.
 * Must run before any model operation — call at process boot.
 */
export function configureMongoose() {
  if (configured) return;
  mongoose.set("bufferCommands", false);
  // If anything still buffers, fail immediately instead of waiting 10s.
  try {
    mongoose.set("bufferTimeoutMS", 0);
  } catch {
    /* older mongoose — bufferCommands:false is enough */
  }
  configured = true;
}

// Side-effect on import so any consumer that loads this module first is safe.
configureMongoose();

export function getMongoReadyState() {
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  return mongoose.connection.readyState;
}

export function isMongoReady() {
  return getMongoReadyState() === 1 && Boolean(mongoose.connection.db);
}

export function databaseUnavailableError(detail) {
  return new AppError("Database temporarily unavailable", {
    status: 503,
    code: "DATABASE_UNAVAILABLE",
    expose: true,
    cause: detail,
  });
}

/**
 * Resolve when Mongo is connected, or reject within ~1s.
 * Never waits for the default 10s mongoose buffer timeout.
 *
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<void>}
 */
export async function ensureMongoReady(opts = {}) {
  const timeoutMs = opts.timeoutMs ?? MONGO_READY_TIMEOUT_MS;

  if (isMongoReady()) return;

  // Already connected according to readyState but db handle missing — treat as down.
  if (getMongoReadyState() === 1 && !mongoose.connection.db) {
    throw databaseUnavailableError("connected without db handle");
  }

  // Not connecting and not connected — fail immediately (no 10s buffer wait).
  if (getMongoReadyState() === 0 || getMongoReadyState() === 3) {
    throw databaseUnavailableError(`readyState=${getMongoReadyState()}`);
  }

  // readyState === 2 (connecting) — wait briefly for the open event.
  await new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(databaseUnavailableError("connection timeout"));
    }, timeoutMs);

    const onConnected = () => {
      if (settled) return;
      if (!isMongoReady()) return; // wait for full readiness
      settled = true;
      cleanup();
      resolve();
    };

    const onError = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(databaseUnavailableError(err?.message || "connection error"));
    };

    function cleanup() {
      clearTimeout(timer);
      mongoose.connection.off("connected", onConnected);
      mongoose.connection.off("open", onConnected);
      mongoose.connection.off("error", onError);
    }

    mongoose.connection.on("connected", onConnected);
    mongoose.connection.on("open", onConnected);
    mongoose.connection.on("error", onError);

    // Race: may have flipped to ready between check and listener attach.
    if (isMongoReady()) {
      settled = true;
      cleanup();
      resolve();
    }
  });
}

/**
 * Express middleware — returns HTTP 503 within ~1s when Mongo is not ready.
 * Health/ready/version probes should be mounted BEFORE this middleware.
 */
export function requireMongoReady(req, res, next) {
  void (async () => {
    try {
      await ensureMongoReady();
      return next();
    } catch (err) {
      if (res.headersSent) return;
      return res.status(503).json({
        success: false,
        code: "DATABASE_UNAVAILABLE",
        error: "Database temporarily unavailable",
      });
    }
  })();
}

/**
 * Validate Mongo env + URI shape before connecting.
 * When `logger` is provided, logs which env var is used, host, and database —
 * never credentials.
 *
 * @param {{
 *   uri?: string,
 *   logger?: { info?: Function, warn?: Function, error?: Function },
 * }} [opts]
 * @returns {{ uri: string, envVar: string, host?: string, database?: string }}
 */
export function assertMongoUriReady(opts = {}) {
  const log = opts.logger;

  let validated;
  if (opts.uri) {
    const parsed = parseMongoUriSafe(opts.uri);
    validated = {
      ok: parsed.ok,
      uri: String(opts.uri).trim(),
      envVar: CANONICAL_MONGO_URI_ENV,
      host: parsed.host,
      database: parsed.database,
      errors: parsed.errors,
      warnings: parsed.warnings,
    };
  } else {
    validated = validateMongoUriConfig();
  }

  if (!validated.ok) {
    const message = [
      "MongoDB configuration invalid — refusing to connect:",
      ...validated.errors.map((e) => `  - ${e}`),
    ].join("\n");
    const err = new Error(message);
    err.code = "MONGO_URI_INVALID";
    throw err;
  }

  if (log) {
    for (const w of validated.warnings || []) {
      if (typeof log.warn === "function") log.warn(`[mongo] ${w}`);
    }
    if (typeof log.info === "function") {
      log.info(
        `[mongo] using env ${validated.envVar} → host=${validated.host} database=${validated.database}`
      );
    }
  }

  lastUriMeta = {
    envVar: validated.envVar,
    host: validated.host,
    database: validated.database,
  };

  return {
    uri: validated.uri,
    envVar: validated.envVar,
    host: validated.host,
    database: validated.database,
  };
}

/**
 * Connect mongoose with buffering disabled. Idempotent.
 * Resolves MONGODB_URI via {@link assertMongoUriReady} when `uri` is omitted.
 *
 * Auth failures throw with code `MONGO_AUTH_FAILED` (caller should exit).
 *
 * @param {string} [uri]
 * @param {{ logger?: { info?: Function, warn?: Function, error?: Function } }} [opts]
 */
export async function connectMongo(uri, opts = {}) {
  configureMongoose();

  const meta = assertMongoUriReady({
    uri: uri || undefined,
    logger: opts.logger,
  });

  if (isMongoReady()) return mongoose.connection;

  if (connectPromise) return connectPromise;

  connectPromise = mongoose
    .connect(meta.uri, {
      bufferCommands: false,
      serverSelectionTimeoutMS: MONGO_SERVER_SELECTION_MS,
    })
    .then(() => mongoose.connection)
    .catch((err) => {
      connectPromise = null;
      if (isMongoAuthError(err)) {
        const authErr = new Error(
          formatMongoAuthFailureMessage(lastUriMeta || meta, err)
        );
        authErr.code = "MONGO_AUTH_FAILED";
        authErr.cause = err;
        throw authErr;
      }
      throw err;
    });

  return connectPromise;
}

/** True when an error looks like mongoose buffering / DB-down. */
export function isMongoUnavailableError(err) {
  if (!err) return false;
  if (err.code === "DATABASE_UNAVAILABLE") return true;
  if (err.code === "MONGO_AUTH_FAILED" || err.code === "MONGO_URI_INVALID") return true;
  const msg = String(err.message || err);
  return (
    /buffering timed out/i.test(msg) ||
    /Cannot call .+ before initial connection/i.test(msg) ||
    /MongoNotConnectedError/i.test(msg) ||
    /failed to connect/i.test(msg) ||
    /Server selection timed out/i.test(msg) ||
    isMongoAuthError(err)
  );
}

/**
 * JSON 503 body helper for controllers that catch DB-down errors directly.
 */
export function sendDatabaseUnavailable(res) {
  return res.status(503).json({
    success: false,
    code: "DATABASE_UNAVAILABLE",
    error: "Database temporarily unavailable",
  });
}
