import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import mongoose from "mongoose";
import {
  configureMongoose,
  ensureMongoReady,
  isMongoReady,
  isMongoUnavailableError,
  MONGO_READY_TIMEOUT_MS,
} from "../../../config/mongoReady.js";

describe("mongoReady", () => {
  beforeEach(() => {
    configureMongoose();
  });

  it("disables mongoose command buffering", () => {
    expect(mongoose.get("bufferCommands")).toBe(false);
  });

  it("ensureMongoReady resolves when already connected", async () => {
    if (!isMongoReady()) {
      // Integration env without mongo — skip soft.
      expect(true).toBe(true);
      return;
    }
    await expect(ensureMongoReady({ timeoutMs: 200 })).resolves.toBeUndefined();
  });

  it("ensureMongoReady rejects within ~1s when disconnected", async () => {
    const readyState = mongoose.connection.readyState;
    if (readyState === 1) {
      // Don't tear down the shared test connection — simulate via spy.
      vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(0);
      const start = Date.now();
      await expect(ensureMongoReady({ timeoutMs: 200 })).rejects.toMatchObject({
        code: "DATABASE_UNAVAILABLE",
        status: 503,
      });
      expect(Date.now() - start).toBeLessThan(MONGO_READY_TIMEOUT_MS + 500);
      vi.restoreAllMocks();
      return;
    }

    const start = Date.now();
    await expect(ensureMongoReady({ timeoutMs: 200 })).rejects.toMatchObject({
      code: "DATABASE_UNAVAILABLE",
      status: 503,
    });
    expect(Date.now() - start).toBeLessThan(800);
  });

  it("detects buffering timeout errors", () => {
    expect(
      isMongoUnavailableError(
        new Error("Operation `users.findOne()` buffering timed out after 10000ms")
      )
    ).toBe(true);
    expect(isMongoUnavailableError(new Error("random"))).toBe(false);
  });
});
