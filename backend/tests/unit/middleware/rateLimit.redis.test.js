import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  isRedisConfigured: vi.fn(),
  getRedisClient: vi.fn(),
}));

vi.mock("../../../config/redis.js", () => ({
  isRedisConfigured: mocks.isRedisConfigured,
  getRedisClient: mocks.getRedisClient,
}));

const { createRateLimiter } = await import("../../../middleware/rateLimit.js");

function mockReqRes({ ip = "1.2.3.4" } = {}) {
  const headers = {};
  const req = { headers, ip, socket: { remoteAddress: ip } };
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  return { req, res };
}

/** Fake Redis client backing `rateLimitIncr` with an in-memory map (mirrors the Lua script). */
function createFakeRedis() {
  const store = new Map();
  return {
    async rateLimitIncr(key, windowMs) {
      const now = Date.now();
      let entry = store.get(key);
      if (!entry || entry.resetAt <= now) {
        entry = { count: 0, resetAt: now + windowMs };
        store.set(key, entry);
      }
      entry.count += 1;
      return [entry.count, entry.resetAt - now];
    },
  };
}

describe("middleware/rateLimit (Redis-backed)", () => {
  beforeEach(() => {
    mocks.isRedisConfigured.mockReset();
    mocks.getRedisClient.mockReset();
  });

  it("uses the Redis counter (async) when Redis is configured", async () => {
    mocks.isRedisConfigured.mockReturnValue(true);
    mocks.getRedisClient.mockReturnValue(createFakeRedis());

    const limiter = createRateLimiter({ windowMs: 60_000, max: 2, prefix: "rl:test" });
    const { req, res } = mockReqRes();
    const next = vi.fn();

    limiter(req, res, next);
    // Redis path is async — next() hasn't been called synchronously.
    expect(next).not.toHaveBeenCalled();
    await new Promise((resolve) => setImmediate(resolve));
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.headers["X-RateLimit-Remaining"]).toBe("1");
  });

  it("blocks with 429 once the Redis-backed limit is exceeded", async () => {
    mocks.isRedisConfigured.mockReturnValue(true);
    mocks.getRedisClient.mockReturnValue(createFakeRedis());

    const limiter = createRateLimiter({ windowMs: 60_000, max: 1, prefix: "rl:test", message: "Slow down" });
    const { req, res: res1 } = mockReqRes({ ip: "9.9.9.9" });
    const res2 = mockReqRes({ ip: "9.9.9.9" }).res;
    const next = vi.fn();

    limiter(req, res1, next);
    await new Promise((resolve) => setImmediate(resolve));
    limiter(req, res2, next);
    await new Promise((resolve) => setImmediate(resolve));

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(429);
    expect(res2.body).toEqual({ error: "Slow down" });
  });

  it("falls back to the in-memory limiter when Redis throws", async () => {
    mocks.isRedisConfigured.mockReturnValue(true);
    mocks.getRedisClient.mockReturnValue({
      async rateLimitIncr() {
        throw new Error("connection refused");
      },
    });

    const limiter = createRateLimiter({ windowMs: 60_000, max: 5 });
    const { req, res } = mockReqRes();
    const next = vi.fn();

    limiter(req, res, next);
    await new Promise((resolve) => setImmediate(resolve));

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });

  it("falls back to the in-memory limiter when Redis is configured but the client is unavailable", () => {
    mocks.isRedisConfigured.mockReturnValue(true);
    mocks.getRedisClient.mockReturnValue(null);

    const limiter = createRateLimiter({ windowMs: 60_000, max: 5 });
    const { req, res } = mockReqRes();
    const next = vi.fn();

    limiter(req, res, next);

    // No Redis client → synchronous in-memory path, same as unconfigured.
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });
});
