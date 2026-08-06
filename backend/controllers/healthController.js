import fs from "fs/promises";
import { readFileSync } from "fs";
import os from "os";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { pingRedis } from "../config/redis.js";

const DISK_WARN_USED_PCT = Number(process.env.VANI_DISK_WARN_PCT) || 90;
const MEMORY_WARN_USED_PCT = Number(process.env.VANI_MEMORY_WARN_PCT) || 95;

let cachedPackageVersion = null;
function getPackageVersion() {
  if (cachedPackageVersion) return cachedPackageVersion;
  try {
    const pkgPath = fileURLToPath(new URL("../package.json", import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    cachedPackageVersion = pkg.version || "0.0.0";
  } catch {
    cachedPackageVersion = process.env.npm_package_version || "0.0.0";
  }
  return cachedPackageVersion;
}

async function checkMongo() {
  const state = mongoose.connection.readyState; // 0=disconnected,1=connected,2=connecting,3=disconnecting
  if (state !== 1) {
    return { healthy: false, state, detail: "not connected" };
  }
  try {
    await mongoose.connection.db.admin().ping();
    return { healthy: true, state };
  } catch (err) {
    return { healthy: false, state, error: err.message };
  }
}

async function checkRedis() {
  const result = await pingRedis();
  // Redis is optional infra — an unconfigured Redis is healthy by definition.
  return { configured: result.configured, healthy: result.healthy, error: result.error };
}

async function checkDisk() {
  try {
    const stats = await fs.statfs(process.cwd());
    const totalBytes = stats.bsize * stats.blocks;
    const freeBytes = stats.bsize * stats.bfree;
    const usedPct = totalBytes ? ((totalBytes - freeBytes) / totalBytes) * 100 : 0;
    return {
      healthy: usedPct < DISK_WARN_USED_PCT,
      totalGB: +(totalBytes / 1e9).toFixed(2),
      freeGB: +(freeBytes / 1e9).toFixed(2),
      usedPct: +usedPct.toFixed(1),
    };
  } catch (err) {
    // statfs isn't available on every platform/container runtime — never
    // fail the whole health check just because disk stats are unavailable.
    return { healthy: true, skipped: true, error: err.message };
  }
}

function checkMemory() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const systemUsedPct = totalMem ? ((totalMem - freeMem) / totalMem) * 100 : 0;
  const proc = process.memoryUsage();
  return {
    healthy: systemUsedPct < MEMORY_WARN_USED_PCT,
    systemUsedPct: +systemUsedPct.toFixed(1),
    rssMB: +(proc.rss / 1e6).toFixed(1),
    heapUsedMB: +(proc.heapUsed / 1e6).toFixed(1),
    heapTotalMB: +(proc.heapTotal / 1e6).toFixed(1),
  };
}

/** Run every dependency/resource check in parallel. */
export async function runHealthChecks() {
  const [mongo, redis, disk] = await Promise.all([checkMongo(), checkRedis(), checkDisk()]);
  const memory = checkMemory();

  // Only hard dependencies (DB, cache) gate overall status/HTTP code. Disk
  // and memory are reported for observability but don't flip the process to
  // "unhealthy" — `os.totalmem()`/`os.freemem()` reflect the *host*, not a
  // container's cgroup limit, so they're too noisy/unreliable to page on.
  const healthy = mongo.healthy && redis.healthy;

  return {
    status: healthy ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    checks: { mongo, redis, disk, memory },
  };
}

/**
 * Whether `/health` may include disk/memory capacity diagnostics.
 * Production defaults to a minimal payload (mongo/redis only) to limit
 * recon fingerprinting — set `VANI_HEALTH_DETAILED=true` for internal probes.
 */
function allowDetailedHealth() {
  if (process.env.VANI_HEALTH_DETAILED === "true" || process.env.VANI_HEALTH_DETAILED === "1") {
    return true;
  }
  return process.env.NODE_ENV !== "production";
}

/** GET /health — liveness + dependency status (capacity detail gated in prod). */
export async function getHealth(req, res) {
  const result = await runHealthChecks();
  const status = result.status === "ok" ? 200 : 503;
  if (allowDetailedHealth()) {
    res.status(status).json(result);
    return;
  }
  res.status(status).json({
    status: result.status,
    timestamp: result.timestamp,
    uptimeSeconds: result.uptimeSeconds,
    checks: {
      mongo: { healthy: !!result.checks.mongo?.healthy },
      redis: {
        configured: !!result.checks.redis?.configured,
        healthy: !!result.checks.redis?.healthy,
      },
    },
  });
}

/** GET /ready — minimal readiness gate for load balancers/orchestrators. */
export async function getReady(req, res) {
  const result = await runHealthChecks();
  const ready = result.checks.mongo.healthy && result.checks.redis.healthy;
  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    timestamp: result.timestamp,
    checks: {
      mongo: result.checks.mongo.healthy,
      redis: result.checks.redis.configured ? result.checks.redis.healthy : "not_configured",
    },
  });
}

/** GET /version — build/release identity for deploy verification & rollback. */
export function getVersion(_req, res) {
  res.status(200).json({
    name: "vani-backend",
    version: getPackageVersion(),
    release: process.env.SENTRY_RELEASE || null,
    node: process.version,
    env: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  });
}
