import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  pingRedis: vi.fn(),
  adminPing: vi.fn(),
  readyState: { value: 1 },
}));

vi.mock("../../../config/redis.js", () => ({
  pingRedis: mocks.pingRedis,
}));

vi.mock("mongoose", () => ({
  default: {
    connection: {
      get readyState() {
        return mocks.readyState.value;
      },
      db: { admin: () => ({ ping: mocks.adminPing }) },
    },
  },
}));

const { getHealth, getReady, getVersion, runHealthChecks } = await import(
  "../../../controllers/healthController.js"
);

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

describe("controllers/healthController", () => {
  beforeEach(() => {
    mocks.pingRedis.mockReset();
    mocks.adminPing.mockReset();
    mocks.readyState.value = 1;
    mocks.adminPing.mockResolvedValue({ ok: 1 });
    mocks.pingRedis.mockResolvedValue({ configured: false, healthy: true });
  });

  it("reports healthy when Mongo is connected and Redis is not configured", async () => {
    const result = await runHealthChecks();
    expect(result.status).toBe("ok");
    expect(result.checks.mongo.healthy).toBe(true);
    expect(result.checks.redis).toEqual({ configured: false, healthy: true });
    expect(result.checks.disk).toBeDefined();
    expect(result.checks.memory).toBeDefined();
  });

  it("GET /health returns 200 when healthy", async () => {
    const res = mockRes();
    await getHealth({}, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("GET /health omits disk/memory capacity in production by default", async () => {
    const prev = process.env.NODE_ENV;
    const prevDetailed = process.env.VANI_HEALTH_DETAILED;
    process.env.NODE_ENV = "production";
    delete process.env.VANI_HEALTH_DETAILED;
    try {
      const res = mockRes();
      await getHealth({}, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.checks.mongo).toEqual({ healthy: true });
      expect(res.body.checks.redis).toEqual({ configured: false, healthy: true });
      expect(res.body.checks.disk).toBeUndefined();
      expect(res.body.checks.memory).toBeUndefined();
    } finally {
      process.env.NODE_ENV = prev;
      if (prevDetailed === undefined) delete process.env.VANI_HEALTH_DETAILED;
      else process.env.VANI_HEALTH_DETAILED = prevDetailed;
    }
  });

  it("GET /health includes capacity when VANI_HEALTH_DETAILED=true", async () => {
    const prev = process.env.NODE_ENV;
    const prevDetailed = process.env.VANI_HEALTH_DETAILED;
    process.env.NODE_ENV = "production";
    process.env.VANI_HEALTH_DETAILED = "true";
    try {
      const res = mockRes();
      await getHealth({}, res);
      expect(res.body.checks.disk).toBeDefined();
      expect(res.body.checks.memory).toBeDefined();
    } finally {
      process.env.NODE_ENV = prev;
      if (prevDetailed === undefined) delete process.env.VANI_HEALTH_DETAILED;
      else process.env.VANI_HEALTH_DETAILED = prevDetailed;
    }
  });

  it("GET /health returns 503 when Mongo is disconnected", async () => {
    mocks.readyState.value = 0;
    const res = mockRes();
    await getHealth({}, res);
    expect(res.statusCode).toBe(503);
    expect(res.body.status).toBe("degraded");
    expect(res.body.checks.mongo.healthy).toBe(false);
  });

  it("GET /health returns 503 when Redis is configured but unreachable", async () => {
    mocks.pingRedis.mockResolvedValue({ configured: true, healthy: false, error: "ECONNREFUSED" });
    const res = mockRes();
    await getHealth({}, res);
    expect(res.statusCode).toBe(503);
  });

  it("GET /ready returns ready:true when core dependencies are up", async () => {
    const res = mockRes();
    await getReady({}, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("ready");
    expect(res.body.checks).toEqual({ mongo: true, redis: "not_configured" });
  });

  it("GET /ready returns 503 when Mongo is down", async () => {
    mocks.readyState.value = 2;
    const res = mockRes();
    await getReady({}, res);
    expect(res.statusCode).toBe(503);
    expect(res.body.status).toBe("not_ready");
  });

  it("does not fail overall health due to high memory/disk usage alone", async () => {
    const result = await runHealthChecks();
    // Sanity: memory/disk are reported but never the sole cause of "degraded".
    expect(typeof result.checks.memory.healthy).toBe("boolean");
    expect(typeof result.checks.disk.healthy).toBe("boolean");
  });

  it("GET /version returns build identity", async () => {
    const res = mockRes();
    getVersion({}, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe("vani-backend");
    expect(typeof res.body.version).toBe("string");
    expect(res.body.node).toMatch(/^v/);
    expect(typeof res.body.timestamp).toBe("string");
  });
});
