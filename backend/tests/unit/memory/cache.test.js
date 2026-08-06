import { describe, it, expect, vi, afterEach } from "vitest";
import { cacheGet, cacheSet, cacheInvalidateUser } from "../../../services/memory/cache.js";

describe("services/memory/cache", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for a cache miss", () => {
    expect(cacheGet("user-1", "settings")).toBeNull();
  });

  it("stores and retrieves a value scoped by user + suffix", () => {
    cacheSet("user-2", "settings", { enabled: true });
    expect(cacheGet("user-2", "settings")).toEqual({ enabled: true });
    // A different suffix for the same user is a separate entry.
    expect(cacheGet("user-2", "memories")).toBeNull();
  });

  it("does not leak values across users", () => {
    cacheSet("user-3", "settings", "A");
    cacheSet("user-4", "settings", "B");
    expect(cacheGet("user-3", "settings")).toBe("A");
    expect(cacheGet("user-4", "settings")).toBe("B");
  });

  it("expires entries after the TTL", () => {
    vi.useFakeTimers();
    cacheSet("user-5", "settings", "value", 1000);
    expect(cacheGet("user-5", "settings")).toBe("value");
    vi.advanceTimersByTime(1001);
    expect(cacheGet("user-5", "settings")).toBeNull();
  });

  it("cacheInvalidateUser clears all entries for that user only", () => {
    cacheSet("user-6", "settings", "s");
    cacheSet("user-6", "memories", "m");
    cacheSet("user-7", "settings", "other");

    cacheInvalidateUser("user-6");

    expect(cacheGet("user-6", "settings")).toBeNull();
    expect(cacheGet("user-6", "memories")).toBeNull();
    expect(cacheGet("user-7", "settings")).toBe("other");
  });
});
