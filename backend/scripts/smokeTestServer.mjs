/**
 * One-off smoke test for Sprint 2 hardening — boots the real server against
 * an in-memory Mongo, hits /health and /ready, then sends SIGTERM and
 * verifies a clean graceful shutdown. Not part of the CI test suite.
 *
 * Run: node scripts/smokeTestServer.mjs
 */
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { spawn } from "node:child_process";
import { MongoMemoryServer } from "mongodb-memory-server";

if (!process.env.MONGOMS_SYSTEM_BINARY) {
  const candidates = ["/opt/homebrew/bin/mongod", "/usr/local/bin/mongod", "/usr/bin/mongod"];
  const found = candidates.find((p) => fs.existsSync(p));
  if (found) {
    process.env.MONGOMS_SYSTEM_BINARY = found;
    try {
      const out = execFileSync(found, ["--version"]).toString();
      const match = out.match(/db version v([\d.]+)/);
      if (match) process.env.MONGOMS_VERSION = match[1];
    } catch {
      /* ignore */
    }
  }
}

const mongod = await MongoMemoryServer.create({ instance: { dbName: "vani_smoke", args: ["--nounixsocket"] } });
const PORT = 5099;

const child = spawn(process.execPath, ["server.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: "test",
    LOG_LEVEL: "info",
    VANI_E2E_MODE: "true",
    MONGODB_URI: mongod.getUri("vani_smoke"),
    AUTH_JWT_SECRET: "smoke-test-secret",
    NEXTAUTH_SECRET: "smoke-test-secret",
    GOOGLE_CLOUD_PROJECT: "smoke-project",
    GOOGLE_CLOUD_LOCATION: "us-central1",
    VANI_MEMORY_ENCRYPTION_KEY: "smoke-test-key",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let out = "";
child.stdout.on("data", (d) => (out += d.toString()));
child.stderr.on("data", (d) => (out += d.toString()));

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 503) return res;
    } catch {
      /* not up yet */
    }
    await wait(250);
  }
  throw new Error(`Server did not become reachable at ${url}`);
}

try {
  await waitForServer(`http://localhost:${PORT}/health`);

  const health = await fetch(`http://localhost:${PORT}/health`);
  const healthBody = await health.json();
  console.log("GET /health ->", health.status, JSON.stringify(healthBody));
  if (!healthBody.checks?.mongo || !healthBody.checks?.disk || !healthBody.checks?.memory) {
    throw new Error("Missing expected /health checks");
  }

  const ready = await fetch(`http://localhost:${PORT}/ready`);
  const readyBody = await ready.json();
  console.log("GET /ready ->", ready.status, JSON.stringify(readyBody));

  const requestId = health.headers.get("x-request-id");
  console.log("X-Request-Id header present:", !!requestId);

  console.log("Sending SIGTERM...");
  child.kill("SIGTERM");

  const exitCode = await new Promise((resolve) => child.on("close", resolve));
  console.log("Process exited with code:", exitCode);

  if (!out.includes("[shutdown] complete")) {
    throw new Error("Graceful shutdown did not complete cleanly");
  }
  if (exitCode !== 0) {
    throw new Error(`Expected clean exit(0), got ${exitCode}`);
  }

  console.log("\n✅ Smoke test passed.");
} catch (err) {
  console.error("\n❌ Smoke test failed:", err.message);
  console.error("\n--- server output ---\n" + out);
  child.kill("SIGKILL");
  process.exitCode = 1;
} finally {
  await mongod.stop();
}
