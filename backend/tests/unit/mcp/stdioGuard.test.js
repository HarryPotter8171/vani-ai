import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  assertMcpStdioAllowed,
  buildScrubbedStdioEnv,
  isMcpStdioAllowed,
} from "../../../mcp/stdioGuard.ts";
import { validateServerInput } from "../../../mcp/MCPRegistry.ts";

describe("mcp/stdioGuard", () => {
  let snapshot;

  beforeEach(() => {
    snapshot = {
      NODE_ENV: process.env.NODE_ENV,
      MCP_ALLOW_STDIO: process.env.MCP_ALLOW_STDIO,
      AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET,
      PATH: process.env.PATH,
    };
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(snapshot)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("refuses stdio in production even when MCP_ALLOW_STDIO=true", () => {
    process.env.NODE_ENV = "production";
    process.env.MCP_ALLOW_STDIO = "true";
    expect(isMcpStdioAllowed()).toBe(false);
    expect(() => assertMcpStdioAllowed()).toThrow(/stdio MCP transport is disabled/i);
  });

  it("refuses stdio when MCP_ALLOW_STDIO is unset", () => {
    process.env.NODE_ENV = "test";
    delete process.env.MCP_ALLOW_STDIO;
    expect(isMcpStdioAllowed()).toBe(false);
    expect(() => assertMcpStdioAllowed()).toThrow(/stdio MCP transport is disabled/i);
  });

  it("allows stdio only when opted in outside production", () => {
    process.env.NODE_ENV = "test";
    process.env.MCP_ALLOW_STDIO = "true";
    expect(isMcpStdioAllowed()).toBe(true);
    expect(() => assertMcpStdioAllowed()).not.toThrow();
  });

  it("validateServerInput rejects stdio when not allowed", () => {
    process.env.NODE_ENV = "test";
    delete process.env.MCP_ALLOW_STDIO;
    expect(() =>
      validateServerInput({
        name: "Evil",
        transport: { type: "stdio", command: "bash", args: ["-c", "id"] },
      })
    ).toThrow(/stdio MCP transport is disabled/i);
  });

  it("scrubbed env never includes secrets from process.env", () => {
    process.env.AUTH_JWT_SECRET = "super-secret-should-not-leak";
    process.env.PATH = "/usr/bin";
    const env = buildScrubbedStdioEnv({
      AUTH_JWT_SECRET: "attacker",
      MONGODB_URI: "mongodb://evil",
      MY_SAFE_FLAG: "1",
    });
    expect(env.AUTH_JWT_SECRET).toBeUndefined();
    expect(env.MONGODB_URI).toBeUndefined();
    expect(env.PATH).toBe("/usr/bin");
    expect(env.MY_SAFE_FLAG).toBe("1");
  });
});
