import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  securityHeaders,
  buildContentSecurityPolicy,
} from "../../../middleware/securityHeaders.js";

function mockRes() {
  const headers = {};
  return {
    headers,
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
  };
}

describe("middleware/securityHeaders", () => {
  let prevEnv;

  beforeEach(() => {
    prevEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env.NODE_ENV = prevEnv;
    delete process.env.HSTS_PRELOAD;
  });

  it("sets CSP, frame, referrer, and permissions policies", () => {
    process.env.NODE_ENV = "development";
    const res = mockRes();
    let nextCalled = false;
    securityHeaders({}, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(res.headers["content-security-policy"]).toBe(buildContentSecurityPolicy());
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["permissions-policy"]).toContain("camera=()");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toBeUndefined();
  });

  it("sets HSTS in production", () => {
    process.env.NODE_ENV = "production";
    const res = mockRes();
    securityHeaders({}, res, () => {});
    expect(res.headers["strict-transport-security"]).toMatch(/max-age=63072000/);
    expect(res.headers["strict-transport-security"]).not.toMatch(/preload/);
  });

  it("appends preload when HSTS_PRELOAD=true", () => {
    process.env.NODE_ENV = "production";
    process.env.HSTS_PRELOAD = "true";
    const res = mockRes();
    securityHeaders({}, res, () => {});
    expect(res.headers["strict-transport-security"]).toMatch(/preload/);
  });
});
