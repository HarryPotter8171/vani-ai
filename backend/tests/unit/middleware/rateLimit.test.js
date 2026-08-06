import { describe, it, expect, vi } from "vitest";
import { createRateLimiter } from "../../../middleware/rateLimit.js";

function mockReqRes({ ip = "1.2.3.4", forwardedFor } = {}) {
  const headers = {};
  if (forwardedFor) headers["x-forwarded-for"] = forwardedFor;
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

describe("middleware/rateLimit", () => {
  it("allows requests under the limit and sets rate-limit headers", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
    const { req, res } = mockReqRes();
    const next = vi.fn();

    limiter(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
    expect(res.headers["X-RateLimit-Limit"]).toBe("3");
    expect(res.headers["X-RateLimit-Remaining"]).toBe("2");
  });

  it("blocks with 429 once the limit is exceeded", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2, message: "Slow down" });
    const { req, res } = mockReqRes({ ip: "9.9.9.9" });
    const next = vi.fn();

    limiter(req, res, next); // 1
    limiter(req, res, next); // 2
    limiter(req, res, next); // 3 -> blocked

    expect(next).toHaveBeenCalledTimes(2);
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: "Slow down" });
    expect(res.headers["Retry-After"]).toBeDefined();
  });

  it("tracks separate buckets per client key (IP)", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
    const a = mockReqRes({ ip: "1.1.1.1" });
    const b = mockReqRes({ ip: "2.2.2.2" });
    const next = vi.fn();

    limiter(a.req, a.res, next);
    limiter(a.req, a.res, next); // blocked for A
    limiter(b.req, b.res, next); // fresh bucket for B, allowed

    expect(a.res.statusCode).toBe(429);
    expect(b.res.statusCode).toBe(200);
  });

  it("resets the window after it elapses", async () => {
    const limiter = createRateLimiter({ windowMs: 50, max: 1 });
    const { req } = mockReqRes({ ip: "5.5.5.5" });
    const next = vi.fn();

    // Each real request gets its own `res` — reuse only `req`'s identity/key.
    const res1 = mockReqRes({ ip: "5.5.5.5" }).res;
    const res2 = mockReqRes({ ip: "5.5.5.5" }).res;
    const res3 = mockReqRes({ ip: "5.5.5.5" }).res;

    limiter(req, res1, next);
    limiter(req, res2, next);
    expect(res2.statusCode).toBe(429);

    await new Promise((resolve) => setTimeout(resolve, 60));
    limiter(req, res3, next);
    expect(res3.statusCode).toBe(200);
  });

  it("prefers the first X-Forwarded-For hop over req.ip by default", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
    const first = mockReqRes({ ip: "10.0.0.1", forwardedFor: "203.0.113.5, 10.0.0.1" });
    const second = mockReqRes({ ip: "10.0.0.2", forwardedFor: "203.0.113.5, 10.0.0.2" });
    const next = vi.fn();

    limiter(first.req, first.res, next);
    limiter(second.req, second.res, next); // same forwarded client -> shares bucket

    expect(first.res.statusCode).toBe(200);
    expect(second.res.statusCode).toBe(429);
  });

  it("supports a custom keyFn", () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 1,
      keyFn: (req) => req.headers["x-user-id"],
    });
    const next = vi.fn();
    const reqA = { headers: { "x-user-id": "u1" } };
    const resA = mockReqRes().res;
    const reqB = { headers: { "x-user-id": "u2" } };
    const resB = mockReqRes().res;

    limiter(reqA, resA, next);
    limiter(reqB, resB, next);

    expect(resA.statusCode).toBe(200);
    expect(resB.statusCode).toBe(200);
  });
});
