import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * Runs once before the whole Vitest run. Boots a single in-memory MongoDB
 * instance (reusing the locally installed `mongod` binary — no network
 * download — via MONGOMS_SYSTEM_BINARY) and publishes its connection string
 * through `process.env.MONGODB_URI` so every test file / worker can connect.
 *
 * Vitest propagates `process.env` mutations made inside `globalSetup` to
 * the test environment, so no extra plumbing is needed.
 */
export default async function globalSetup() {
  if (!process.env.MONGOMS_SYSTEM_BINARY) {
    // Prefer the system mongod (already installed) over downloading one —
    // keeps the suite runnable with no network access.
    const candidates = [
      "/opt/homebrew/bin/mongod",
      "/usr/local/bin/mongod",
      "/usr/bin/mongod",
    ];
    const fs = await import("fs");
    const found = candidates.find((p) => fs.existsSync(p));
    if (found) {
      process.env.MONGOMS_SYSTEM_BINARY = found;
      try {
        const { execFileSync } = await import("child_process");
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
      dbName: "vani_test",
      // The sandbox forbids binding the mongod unix-domain socket under
      // /tmp ("Operation not permitted"); TCP (--port) still works fine.
      args: ["--nounixsocket"],
    },
  });

  process.env.MONGODB_URI = mongod.getUri("vani_test");
  process.env.__MONGOD_INSTANCE__ = "1";

  return async function teardown() {
    await mongod.stop();
  };
}
