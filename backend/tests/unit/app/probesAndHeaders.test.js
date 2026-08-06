import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../../../app.js";

describe("createApp probes & security headers", () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  it("GET /version returns release identity", async () => {
    const res = await request(app).get("/version");
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("vani-backend");
    expect(res.body.version).toBeTruthy();
  });

  it("applies security headers on probe responses", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["content-security-policy"]).toMatch(/default-src 'none'/);
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["permissions-policy"]).toMatch(/camera=\(\)/);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-request-id"]).toBeTruthy();
  });
});
