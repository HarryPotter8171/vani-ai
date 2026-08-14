import { describe, expect, it } from "vitest";
import {
  CANONICAL_MONGO_URI_ENV,
  detectPasswordEncodingIssues,
  formatMongoAuthFailureMessage,
  isMongoAuthError,
  listSetMongoUriEnvVars,
  parseMongoUriSafe,
  resolveMongoUri,
  validateMongoUriConfig,
} from "../../../config/mongoUri.js";

describe("mongoUri", () => {
  it("uses only MONGODB_URI as the canonical env var", () => {
    expect(CANONICAL_MONGO_URI_ENV).toBe("MONGODB_URI");
    const resolved = resolveMongoUri({
      MONGODB_URI: "mongodb://127.0.0.1:27017/vani-ai",
    });
    expect(resolved.ok).toBe(true);
    expect(resolved.envVar).toBe("MONGODB_URI");
    expect(resolved.setVars).toEqual(["MONGODB_URI"]);
  });

  it("rejects MONGO_URI / DATABASE_URL without MONGODB_URI", () => {
    const a = resolveMongoUri({ MONGO_URI: "mongodb://127.0.0.1/db" });
    expect(a.ok).toBe(false);
    expect(a.errors[0]).toMatch(/only reads MONGODB_URI/);

    const b = resolveMongoUri({ DATABASE_URL: "mongodb://127.0.0.1/db" });
    expect(b.ok).toBe(false);
  });

  it("rejects multiple Mongo URL env vars", () => {
    const resolved = resolveMongoUri({
      MONGODB_URI: "mongodb://127.0.0.1/a",
      MONGO_URI: "mongodb://127.0.0.1/b",
    });
    expect(resolved.ok).toBe(false);
    expect(resolved.errors[0]).toMatch(/Multiple Mongo URL env vars/);
    expect(listSetMongoUriEnvVars({
      MONGODB_URI: "x",
      MONGO_URI: "y",
      DATABASE_URL: "z",
    })).toEqual(["MONGODB_URI", "MONGO_URI", "DATABASE_URL"]);
  });

  it("parses host and database without exposing credentials", () => {
    const parsed = parseMongoUriSafe(
      "mongodb+srv://user:s3cret@cluster0.example.mongodb.net/vani-ai?retryWrites=true"
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.host).toBe("cluster0.example.mongodb.net");
    expect(parsed.database).toBe("vani-ai");
    expect(JSON.stringify(parsed)).not.toMatch(/s3cret/);
    expect(JSON.stringify(parsed)).not.toMatch(/user/);
  });

  it("detects malformed connection strings", () => {
    expect(parseMongoUriSafe("postgres://localhost/db").ok).toBe(false);
    expect(parseMongoUriSafe("not-a-uri").ok).toBe(false);
    expect(parseMongoUriSafe("mongodb://user:pass:word@host/db").ok).toBe(false);
  });

  it("detects unencoded reserved characters in passwords", () => {
    const colon = detectPasswordEncodingIssues(
      "mongodb://user:pass:word@host/db"
    );
    expect(colon.errors.some((e) => /unencoded reserved/i.test(e))).toBe(true);

    const atSign = detectPasswordEncodingIssues(
      "mongodb+srv://user:p@ss@cluster.mongodb.net/db"
    );
    expect(atSign.errors.some((e) => /more than one '@'/i.test(e))).toBe(true);

    const encoded = detectPasswordEncodingIssues(
      "mongodb://user:p%40ss%3Aword@host/db"
    );
    expect(encoded.errors).toEqual([]);
    expect(encoded.hasAuth).toBe(true);
  });

  it("flags invalid percent-encoding in passwords", () => {
    const issues = detectPasswordEncodingIssues(
      "mongodb://user:foo%ZZbar@host/db"
    );
    expect(issues.errors.some((e) => /invalid percent-encoding/i.test(e))).toBe(
      true
    );
  });

  it("validateMongoUriConfig returns host/database for a good URI", () => {
    const cfg = validateMongoUriConfig({
      MONGODB_URI:
        "mongodb+srv://u:p@cluster0.q1ojfuj.mongodb.net/vani-ai?retryWrites=true",
    });
    expect(cfg.ok).toBe(true);
    expect(cfg.envVar).toBe("MONGODB_URI");
    expect(cfg.host).toBe("cluster0.q1ojfuj.mongodb.net");
    expect(cfg.database).toBe("vani-ai");
  });

  it("detects authentication errors", () => {
    expect(isMongoAuthError({ code: 18, message: "Authentication failed" })).toBe(
      true
    );
    expect(isMongoAuthError(new Error("bad auth : authentication failed"))).toBe(
      true
    );
    expect(isMongoAuthError(new Error("Server selection timed out"))).toBe(false);
  });

  it("formats auth failure without credentials", () => {
    const msg = formatMongoAuthFailureMessage(
      { host: "cluster.example.net", database: "vani-ai", envVar: "MONGODB_URI" },
      new Error("bad auth : authentication failed")
    );
    expect(msg).toMatch(/authentication failed/i);
    expect(msg).toMatch(/cluster\.example\.net/);
    expect(msg).toMatch(/vani-ai/);
    expect(msg).not.toMatch(/password\s*=/i);
  });
});
