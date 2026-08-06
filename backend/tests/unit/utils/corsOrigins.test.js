import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getAllowedOrigins,
  corsOriginDelegate,
  isDevLanOrigin,
} from "../../../utils/corsOrigins.js";

const ENV_KEYS = ["NEXT_PUBLIC_APP_URL", "APP_URL", "CORS_ORIGINS", "NODE_ENV"];
let saved;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("utils/corsOrigins", () => {
  it("adds localhost origins outside production", () => {
    process.env.NODE_ENV = "development";
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.CORS_ORIGINS;
    const origins = getAllowedOrigins();
    expect(origins).toContain("http://localhost:3000");
    expect(origins).toContain("http://localhost:3001");
    expect(origins).toContain("http://127.0.0.1:3000");
  });

  it("excludes localhost defaults in production", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.vani.ai";
    delete process.env.CORS_ORIGINS;
    const origins = getAllowedOrigins();
    expect(origins).not.toContain("http://localhost:3000");
    expect(origins).toContain("https://app.vani.ai");
  });

  it("normalizes NEXT_PUBLIC_APP_URL to its origin (drops path/trailing slash)", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.vani.ai/some/path?x=1";
    const origins = getAllowedOrigins();
    expect(origins).toContain("https://app.vani.ai");
  });

  it("merges comma-separated CORS_ORIGINS", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.vani.ai";
    process.env.CORS_ORIGINS = "https://staging.vani.ai, https://admin.vani.ai";
    const origins = getAllowedOrigins();
    expect(origins).toEqual(
      expect.arrayContaining([
        "https://app.vani.ai",
        "https://staging.vani.ai",
        "https://admin.vani.ai",
      ])
    );
  });

  it("de-duplicates origins", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.vani.ai";
    process.env.CORS_ORIGINS = "https://app.vani.ai";
    const origins = getAllowedOrigins();
    expect(origins.filter((o) => o === "https://app.vani.ai")).toHaveLength(1);
  });

  it("detects private LAN frontend origins in development", () => {
    expect(isDevLanOrigin("http://192.168.0.117:3000")).toBe(true);
    expect(isDevLanOrigin("http://10.0.0.5:3001")).toBe(true);
    expect(isDevLanOrigin("http://172.16.1.2:3000")).toBe(true);
    expect(isDevLanOrigin("https://192.168.0.117:3000")).toBe(false);
    expect(isDevLanOrigin("http://192.168.0.117:5001")).toBe(false);
    expect(isDevLanOrigin("http://8.8.8.8:3000")).toBe(false);
  });

  describe("corsOriginDelegate", () => {
    it("allows requests with no Origin header (curl / server-to-server)", () => {
      corsOriginDelegate(undefined, (err, allowed) => {
        expect(err).toBeNull();
        expect(allowed).toBe(true);
      });
    });

    it("allows a whitelisted origin", () => {
      process.env.NODE_ENV = "production";
      process.env.NEXT_PUBLIC_APP_URL = "https://app.vani.ai";
      corsOriginDelegate("https://app.vani.ai", (err, allowed) => {
        expect(err).toBeNull();
        expect(allowed).toBe(true);
      });
    });

    it("allows a LAN phone origin in development even if not listed", () => {
      process.env.NODE_ENV = "development";
      delete process.env.NEXT_PUBLIC_APP_URL;
      delete process.env.CORS_ORIGINS;
      corsOriginDelegate("http://192.168.0.117:3000", (err, allowed) => {
        expect(err).toBeNull();
        expect(allowed).toBe(true);
      });
    });

    it("rejects LAN origins in production unless explicitly listed", () => {
      process.env.NODE_ENV = "production";
      process.env.NEXT_PUBLIC_APP_URL = "https://app.vani.ai";
      delete process.env.CORS_ORIGINS;
      corsOriginDelegate("http://192.168.0.117:3000", (err) => {
        expect(err).toBeInstanceOf(Error);
      });
    });

    it("rejects a non-whitelisted origin in production", () => {
      process.env.NODE_ENV = "production";
      process.env.NEXT_PUBLIC_APP_URL = "https://app.vani.ai";
      delete process.env.CORS_ORIGINS;
      corsOriginDelegate("https://evil.example.com", (err, allowed) => {
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toMatch(/CORS origin not allowed/);
        expect(allowed).toBeUndefined();
      });
    });

    it("rejects an origin that only differs by scheme (http vs https)", () => {
      process.env.NODE_ENV = "production";
      process.env.NEXT_PUBLIC_APP_URL = "https://app.vani.ai";
      corsOriginDelegate("http://app.vani.ai", (err) => {
        expect(err).toBeInstanceOf(Error);
      });
    });
  });
});
