/**
 * Boots a real backend server (real Express app, real in-memory MongoDB,
 * real business logic) for the Playwright end-to-end suite.
 *
 * The ONLY thing swapped out is the Gemini/Vertex client (via
 * `VANI_E2E_MODE=true`, see services/geminiClient.js +
 * services/testDoubles/mockGeminiClient.js) — everything else (auth, chat
 * persistence, memory, file parsing, MCP, browser automation permission
 * gating, deep research state machine) runs exactly as it does in production.
 *
 * Invoked directly as the Playwright `webServer` command for the backend —
 * see playwright.config.ts.
 */
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.VANI_E2E_MODE = "true";

if (!process.env.MONGOMS_SYSTEM_BINARY) {
  // Prefer the system mongod (no network download needed) — same detection
  // used by tests/globalSetup.js.
  const candidates = ["/opt/homebrew/bin/mongod", "/usr/local/bin/mongod", "/usr/bin/mongod"];
  const found = candidates.find((p) => fs.existsSync(p));
  if (found) {
    process.env.MONGOMS_SYSTEM_BINARY = found;
    try {
      const out = execFileSync(found, ["--version"]).toString();
      const match = out.match(/db version v([\d.]+)/);
      if (match) process.env.MONGOMS_VERSION = match[1];
    } catch {
      /* fall back to mongodb-memory-server's default version detection */
    }
  }
}

const mongod = await MongoMemoryServer.create({
  instance: {
    dbName: "vani_e2e",
    args: ["--nounixsocket"],
  },
});

process.env.MONGODB_URI = mongod.getUri("vani_e2e");

async function shutdown() {
  try {
    await mongod.stop();
  } finally {
    process.exit(0);
  }
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// server.js is a top-level bootstrap (connects Mongo + app.listen) — importing
// it starts the real server with the env vars configured above.
await import("../../server.js");
