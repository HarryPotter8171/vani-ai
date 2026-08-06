import { describe, it, expect } from "vitest";
import { sanitizeAgentToolName, validateServerInput } from "../../../mcp/MCPRegistry.ts";

describe("mcp/MCPRegistry", () => {
  it("sanitizeAgentToolName produces stable agent-safe names", () => {
    const name = sanitizeAgentToolName("Echo Server", "echo-message", "abc123def456");
    expect(name).toMatch(/^mcp_/);
    expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
    expect(name).toContain("def456");
    expect(name.length).toBeLessThanOrEqual(64);
  });

  it("includes distinct server-id suffixes so same display names do not collide", () => {
    const a = sanitizeAgentToolName("Echo", "echo", "aaaaaaaaaaaaaaaaaaaaaaaa");
    const b = sanitizeAgentToolName("Echo", "echo", "bbbbbbbbbbbbbbbbbbbbbbbb");
    expect(a).not.toBe(b);
  });

  it("validateServerInput rejects missing transport and clamps timeout", () => {
    expect(() => validateServerInput({ name: "X" })).toThrow(/transport/i);

    const ok = validateServerInput({
      name: "Echo",
      transport: { type: "stdio", command: "node", args: ["echo.js"] },
      timeoutMs: 999_999,
    });
    expect(ok.timeoutMs).toBe(120_000);
    expect(ok.autoReconnect).toBe(true);
  });

  it("validateServerInput rejects unsupported transport types", () => {
    expect(() =>
      validateServerInput({
        name: "Bad",
        transport: { type: "ftp", url: "ftp://x" },
      })
    ).toThrow(/unsupported transport/i);
  });

  it("validateServerInput rejects private / metadata remote MCP URLs (SSRF)", () => {
    expect(() =>
      validateServerInput({
        name: "Internal",
        transport: { type: "http", url: "http://127.0.0.1:8080/mcp" },
      })
    ).toThrow(/non-public|blocked|private|local/i);

    expect(() =>
      validateServerInput({
        name: "Meta",
        transport: {
          type: "sse",
          url: "http://169.254.169.254/latest/meta-data/",
        },
      })
    ).toThrow(/non-public|blocked|private|local/i);

    expect(() =>
      validateServerInput({
        name: "WsLocal",
        transport: { type: "websocket", url: "ws://localhost:9000" },
      })
    ).toThrow(/non-public|blocked|private|local/i);
  });

  it("validateServerInput accepts public remote MCP URLs", () => {
    const httpOk = validateServerInput({
      name: "Remote",
      transport: { type: "http", url: "https://mcp.example.com/v1" },
    });
    expect(httpOk.transport.url).toMatch(/^https:\/\/mcp\.example\.com/);

    const wsOk = validateServerInput({
      name: "RemoteWs",
      transport: { type: "websocket", url: "wss://mcp.example.com/ws" },
    });
    expect(wsOk.transport.url).toMatch(/^wss:\/\//);
  });
});
