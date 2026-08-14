import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateEnvironment } from "../../../config/validateEnv.js";

const ENV_KEYS = [
  "NODE_ENV",
  "AUTH_JWT_SECRET",
  "NEXTAUTH_SECRET",
  "MONGODB_URI",
  "MONGO_URI",
  "DATABASE_URL",
  "GOOGLE_CLOUD_PROJECT",
  "GOOGLE_CLOUD_LOCATION",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "TAVILY_ENABLED",
  "TAVILY_API_KEY",
  "VANI_MEMORY_ENCRYPTION_KEY",
  "FEATURE_GATING_DISABLED",
  "REQUIRE_REDIS",
  "VANI_REPLICAS",
  "WEB_CONCURRENCY",
  "INSTANCE_COUNT",
  "REDIS_URL",
  "REDIS_HOST",
  "MCP_DEBUG",
  "BROWSER_DEBUG",
  "VANI_DEBUG",
];

describe("config/validateEnv", () => {
  let snapshot;

  beforeEach(() => {
    snapshot = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const key of ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (snapshot[key] === undefined) delete process.env[key];
      else process.env[key] = snapshot[key];
    }
  });

  function setAllRequired() {
    process.env.AUTH_JWT_SECRET = "secret";
    process.env.NEXTAUTH_SECRET = "secret";
    process.env.MONGODB_URI = "mongodb://localhost/test";
    process.env.GOOGLE_CLOUD_PROJECT = "proj";
    process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
    process.env.VANI_MEMORY_ENCRYPTION_KEY = "key";
  }

  /** Strong distinct secrets satisfying production strength rules. */
  function setProductionSecrets() {
    process.env.AUTH_JWT_SECRET = "a".repeat(32);
    process.env.NEXTAUTH_SECRET = "b".repeat(32);
  }

  it("passes when every required variable is set (non-strict)", () => {
    setAllRequired();
    const result = validateEnvironment({ throwOnError: false });
    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("reports failures without throwing when not strict", () => {
    const result = validateEnvironment({ throwOnError: false });
    expect(result.ok).toBe(false);
    expect(result.failures.length).toBeGreaterThan(0);
    expect(result.failures.map((f) => f.name)).toEqual(
      expect.arrayContaining(["MONGODB_URI", "VANI_MEMORY_ENCRYPTION_KEY"])
    );
  });

  it("throws in strict mode when required variables are missing", () => {
    expect(() => validateEnvironment({ throwOnError: true })).toThrow(/Refusing to start/);
  });

  it("does not throw in strict mode once all required variables are set", () => {
    setAllRequired();
    expect(() => validateEnvironment({ throwOnError: true })).not.toThrow();
  });

  it("requires TAVILY_API_KEY only when TAVILY_ENABLED=true", () => {
    setAllRequired();
    process.env.TAVILY_ENABLED = "true";
    const result = validateEnvironment({ throwOnError: false });
    expect(result.failures.map((f) => f.name)).toContain("TAVILY_API_KEY");

    process.env.TAVILY_API_KEY = "tvly-123";
    const result2 = validateEnvironment({ throwOnError: false });
    expect(result2.failures.map((f) => f.name)).not.toContain("TAVILY_API_KEY");
  });

  it("defaults to strict when NODE_ENV=production and throwOnError is not passed", () => {
    process.env.NODE_ENV = "production";
    expect(() => validateEnvironment()).toThrow(/Refusing to start/);
  });

  it("refuses FEATURE_GATING_DISABLED=true in production", () => {
    setAllRequired();
    setProductionSecrets();
    process.env.NODE_ENV = "production";
    process.env.FEATURE_GATING_DISABLED = "true";
    expect(() => validateEnvironment()).toThrow(/FEATURE_GATING_DISABLED/);
  });

  it("flags FEATURE_GATING_DISABLED in non-strict mode without throwing", () => {
    setAllRequired();
    process.env.FEATURE_GATING_DISABLED = "true";
    const result = validateEnvironment({ throwOnError: false });
    expect(result.ok).toBe(false);
    expect(result.failures.map((f) => f.name)).toContain(
      "FEATURE_GATING_DISABLED must not be true"
    );
  });

  it("refuses weak or shared JWT secrets in production", () => {
    setAllRequired();
    process.env.NODE_ENV = "production";
    process.env.AUTH_JWT_SECRET = "short";
    process.env.NEXTAUTH_SECRET = "also-short-but-still-under-32";
    expect(() => validateEnvironment()).toThrow(/AUTH_JWT_SECRET strength/);

    process.env.AUTH_JWT_SECRET = "a".repeat(32);
    process.env.NEXTAUTH_SECRET = "a".repeat(32);
    expect(() => validateEnvironment()).toThrow(/AUTH_JWT_SECRET strength/);

    process.env.AUTH_JWT_SECRET = "a".repeat(32);
    process.env.NEXTAUTH_SECRET = "b".repeat(32);
    expect(() => validateEnvironment()).not.toThrow();
  });

  it("refuses debug flags in production", () => {
    setAllRequired();
    process.env.NODE_ENV = "production";
    process.env.AUTH_JWT_SECRET = "a".repeat(32);
    process.env.NEXTAUTH_SECRET = "b".repeat(32);
    process.env.MCP_DEBUG = "true";
    expect(() => validateEnvironment()).toThrow(/Debug flags/);

    process.env.MCP_DEBUG = "false";
    expect(() => validateEnvironment()).not.toThrow();
  });

  it("requires Redis when REQUIRE_REDIS=true", () => {
    setAllRequired();
    process.env.REQUIRE_REDIS = "true";
    const result = validateEnvironment({ throwOnError: false });
    expect(result.failures.map((f) => f.name)).toContain("REDIS_URL / REDIS_HOST");

    process.env.REDIS_URL = "redis://localhost:6379";
    const result2 = validateEnvironment({ throwOnError: false });
    expect(result2.failures.map((f) => f.name)).not.toContain("REDIS_URL / REDIS_HOST");
  });

  it("requires Redis in production when replica count > 1", () => {
    setAllRequired();
    process.env.NODE_ENV = "production";
    process.env.AUTH_JWT_SECRET = "a".repeat(32);
    process.env.NEXTAUTH_SECRET = "b".repeat(32);
    process.env.VANI_REPLICAS = "2";
    expect(() => validateEnvironment()).toThrow(/REDIS_URL \/ REDIS_HOST/);

    process.env.REDIS_HOST = "127.0.0.1";
    expect(() => validateEnvironment()).not.toThrow();
  });

  it("does not require Redis for single-replica production", () => {
    setAllRequired();
    process.env.NODE_ENV = "production";
    process.env.AUTH_JWT_SECRET = "a".repeat(32);
    process.env.NEXTAUTH_SECRET = "b".repeat(32);
    process.env.VANI_REPLICAS = "1";
    expect(() => validateEnvironment()).not.toThrow();
  });

  it("rejects MONGO_URI / DATABASE_URL aliases", () => {
    setAllRequired();
    process.env.MONGO_URI = "mongodb://127.0.0.1/other";
    const result = validateEnvironment({ throwOnError: false });
    expect(result.ok).toBe(false);
    expect(result.failures.map((f) => f.name)).toEqual(
      expect.arrayContaining([
        "Mongo URI env aliases (MONGO_URI / DATABASE_URL must be unset)",
      ])
    );
  });

  it("rejects malformed MONGODB_URI", () => {
    setAllRequired();
    process.env.MONGODB_URI = "not-a-mongo-uri";
    const result = validateEnvironment({ throwOnError: false });
    expect(result.failures.map((f) => f.name)).toContain("MONGODB_URI format");
  });
});
