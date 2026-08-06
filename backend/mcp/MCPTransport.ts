/**
 * MCP transport factory — stdio, HTTP (streamable), SSE, WebSocket (future-ready).
 */

import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { McpTransportConfig } from "./types.ts";
import { mcpLog } from "./logger.ts";
import { assertMcpStdioAllowed, buildScrubbedStdioEnv } from "./stdioGuard.ts";
import { validatePublicUrl } from "../services/research/urlSafety.js";

function assertUrl(raw: string, label: string, opts: { allowWebSocket?: boolean } = {}): URL {
  const trimmed = String(raw || "").trim();
  if (!trimmed) throw new Error(`${label} is required`);
  const result = validatePublicUrl(trimmed, {
    allowWebSocket: opts.allowWebSocket === true,
  });
  if (!result.ok) {
    throw new Error(`Blocked non-public MCP ${label}: ${result.error}`);
  }
  return result.url;
}

/**
 * Build a transport instance for the given config.
 * Each call returns a fresh transport — do not reuse across sessions.
 */
export function createMcpTransport(config: McpTransportConfig): Transport {
  switch (config.type) {
    case "stdio": {
      // Defense in depth: refuse even if a pre-fix stdio config was persisted.
      assertMcpStdioAllowed();
      const command = String(config.command || "").trim();
      if (!command) throw new Error("stdio transport requires a command");
      const args = Array.isArray(config.args)
        ? config.args.map((a) => String(a))
        : [];
      // Always pass scrubbed env — never inherit full process.env (secrets).
      const env = buildScrubbedStdioEnv(config.env);
      mcpLog.debug("transport", "Creating stdio transport", { command, args });
      return new StdioClientTransport({
        command,
        args,
        env,
        cwd: config.cwd ? String(config.cwd) : undefined,
        stderr: "pipe",
      });
    }

    case "http": {
      const url = assertUrl(config.url, "HTTP URL");
      const headers = config.headers && typeof config.headers === "object"
        ? Object.fromEntries(
            Object.entries(config.headers).filter(
              ([, v]) => typeof v === "string"
            )
          )
        : undefined;
      mcpLog.debug("transport", "Creating HTTP transport", { url: url.toString() });
      return new StreamableHTTPClientTransport(url, {
        requestInit: headers ? { headers } : undefined,
      });
    }

    case "sse": {
      const url = assertUrl(config.url, "SSE URL");
      const headers = config.headers && typeof config.headers === "object"
        ? Object.fromEntries(
            Object.entries(config.headers).filter(
              ([, v]) => typeof v === "string"
            )
          )
        : undefined;
      mcpLog.debug("transport", "Creating SSE transport", { url: url.toString() });
      return new SSEClientTransport(url, {
        requestInit: headers ? { headers } : undefined,
      });
    }

    case "websocket": {
      const url = assertUrl(config.url, "WebSocket URL", { allowWebSocket: true });
      if (url.protocol !== "ws:" && url.protocol !== "wss:") {
        throw new Error("WebSocket URL must use ws:// or wss://");
      }
      mcpLog.debug("transport", "Creating WebSocket transport", {
        url: url.toString(),
      });
      return new WebSocketClientTransport(url);
    }

    default: {
      const exhaustive: never = config;
      throw new Error(`Unsupported MCP transport: ${(exhaustive as McpTransportConfig).type}`);
    }
  }
}

/**
 * Try Streamable HTTP first, then fall back to legacy SSE (common remote servers).
 */
export async function createHttpOrSseTransport(
  url: string,
  headers?: Record<string, string>
): Promise<{ transport: Transport; type: "http" | "sse" }> {
  try {
    const transport = createMcpTransport({ type: "http", url, headers });
    return { transport, type: "http" };
  } catch (err) {
    mcpLog.warn("transport", "HTTP transport create failed; using SSE", {
      error: err instanceof Error ? err.message : String(err),
    });
    const transport = createMcpTransport({ type: "sse", url, headers });
    return { transport, type: "sse" };
  }
}

export const MCPTransport = {
  create: createMcpTransport,
  createHttpOrSse: createHttpOrSseTransport,
};

export default MCPTransport;
