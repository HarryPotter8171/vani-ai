/**
 * Low-level MCP client wrapper around the official SDK Client.
 * Handles connect, capability listing, tool calls, resource reads, prompts.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  MCP_DEFAULTS,
  type McpCallToolResult,
  type McpPromptInfo,
  type McpReadResourceResult,
  type McpResourceInfo,
  type McpServerCapabilities,
  type McpToolInfo,
  type McpTransportConfig,
} from "./types.ts";
import { createMcpTransport } from "./MCPTransport.ts";
import { mcpLog } from "./logger.ts";

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    if (typeof timer.unref === "function") timer.unref();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function retry<T>(
  fn: () => Promise<T>,
  {
    retries = 2,
    delayMs = 400,
    label = "operation",
  }: { retries?: number; delayMs?: number; label?: string } = {}
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt >= retries) break;
      mcpLog.warn("client", `${label} failed; retrying`, {
        attempt: attempt + 1,
        error: err instanceof Error ? err.message : String(err),
      });
      await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`${label} failed`);
}

export class MCPClient {
  readonly serverId: string;
  private client: Client | null = null;
  private transport: Transport | null = null;
  private transportConfig: McpTransportConfig;
  private timeoutMs: number;
  private connected = false;
  private capabilitiesCache: McpServerCapabilities | null = null;
  private capabilitiesFetchedAt = 0;

  constructor(
    serverId: string,
    transportConfig: McpTransportConfig,
    options: { timeoutMs?: number } = {}
  ) {
    this.serverId = serverId;
    this.transportConfig = transportConfig;
    this.timeoutMs = options.timeoutMs ?? MCP_DEFAULTS.timeoutMs;
  }

  get isConnected(): boolean {
    return this.connected && this.client !== null;
  }

  getCachedCapabilities(): McpServerCapabilities | null {
    return this.capabilitiesCache;
  }

  async connect(signal?: AbortSignal): Promise<void> {
    if (this.connected && this.client) return;
    if (signal?.aborted) throw new Error("Connect aborted");

    await this.disconnect();

    const transport = createMcpTransport(this.transportConfig);
    const client = new Client(
      {
        name: MCP_DEFAULTS.clientName,
        version: MCP_DEFAULTS.clientVersion,
      },
      {
        capabilities: {},
      }
    );

    this.transport = transport;
    this.client = client;

    try {
      await withTimeout(
        client.connect(transport),
        MCP_DEFAULTS.connectTimeoutMs,
        `MCP connect (${this.serverId})`
      );
      this.connected = true;
      mcpLog.info("client", "Connected", { serverId: this.serverId });
    } catch (err) {
      this.connected = false;
      this.client = null;
      try {
        await transport.close?.();
      } catch {
        // ignore close errors during failed connect
      }
      this.transport = null;
      const message = err instanceof Error ? err.message : String(err);
      mcpLog.error("client", "Connect failed", {
        serverId: this.serverId,
        error: message,
      });
      throw new Error(`Failed to connect MCP server: ${message}`);
    }
  }

  async disconnect(): Promise<void> {
    const client = this.client;
    const transport = this.transport;
    this.client = null;
    this.transport = null;
    this.connected = false;

    if (client) {
      try {
        await client.close();
      } catch (err) {
        mcpLog.debug("client", "Client close error", {
          serverId: this.serverId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else if (transport) {
      try {
        await transport.close?.();
      } catch {
        // ignore
      }
    }
  }

  private requireClient(): Client {
    if (!this.client || !this.connected) {
      throw new Error(`MCP server "${this.serverId}" is not connected`);
    }
    return this.client;
  }

  async listTools(options: { force?: boolean } = {}): Promise<McpToolInfo[]> {
    const caps = await this.refreshCapabilities(options);
    return caps.tools;
  }

  async listResources(options: { force?: boolean } = {}): Promise<McpResourceInfo[]> {
    const caps = await this.refreshCapabilities(options);
    return caps.resources;
  }

  async listPrompts(options: { force?: boolean } = {}): Promise<McpPromptInfo[]> {
    const caps = await this.refreshCapabilities(options);
    return caps.prompts;
  }

  async refreshCapabilities(
    options: { force?: boolean } = {}
  ): Promise<McpServerCapabilities> {
    const now = Date.now();
    if (
      !options.force &&
      this.capabilitiesCache &&
      now - this.capabilitiesFetchedAt < MCP_DEFAULTS.capabilityCacheTtlMs
    ) {
      return this.capabilitiesCache;
    }

    const client = this.requireClient();
    const serverVersion = client.getServerVersion?.();
    const instructions = client.getInstructions?.();

    const [toolsRes, resourcesRes, promptsRes] = await Promise.all([
      withTimeout(
        retry(() => client.listTools(), { label: "listTools", retries: 1 }),
        this.timeoutMs,
        "listTools"
      ).catch((err) => {
        mcpLog.debug("client", "listTools unavailable", {
          error: err instanceof Error ? err.message : String(err),
        });
        return { tools: [] as Array<{ name: string; description?: string; inputSchema?: unknown }> };
      }),
      withTimeout(
        retry(() => client.listResources(), { label: "listResources", retries: 1 }),
        this.timeoutMs,
        "listResources"
      ).catch((err) => {
        mcpLog.debug("client", "listResources unavailable", {
          error: err instanceof Error ? err.message : String(err),
        });
        return { resources: [] as Array<{ uri: string; name?: string; description?: string; mimeType?: string }> };
      }),
      withTimeout(
        client.listPrompts().catch((err) => {
          // Many servers omit prompts — treat as empty, don't retry-spam.
          const msg = err instanceof Error ? err.message : String(err);
          if (!/Method not found|-32601/i.test(msg)) {
            mcpLog.debug("client", "listPrompts unavailable", { error: msg });
          }
          return { prompts: [] as Array<{ name: string; description?: string; arguments?: McpPromptInfo["arguments"] }> };
        }),
        this.timeoutMs,
        "listPrompts"
      ).catch(() => ({
        prompts: [] as Array<{ name: string; description?: string; arguments?: McpPromptInfo["arguments"] }>,
      })),
    ]);

    const caps: McpServerCapabilities = {
      tools: (toolsRes.tools || []).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema:
          t.inputSchema && typeof t.inputSchema === "object"
            ? (t.inputSchema as Record<string, unknown>)
            : undefined,
      })),
      resources: (resourcesRes.resources || []).map((r) => ({
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType,
      })),
      prompts: (promptsRes.prompts || []).map((p) => ({
        name: p.name,
        description: p.description,
        arguments: p.arguments,
      })),
      serverName: serverVersion?.name,
      serverVersion: serverVersion?.version,
      instructions: instructions || undefined,
      fetchedAt: now,
    };

    this.capabilitiesCache = caps;
    this.capabilitiesFetchedAt = now;
    return caps;
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown> = {},
    options: { timeoutMs?: number } = {}
  ): Promise<McpCallToolResult> {
    const name = String(toolName || "").trim();
    if (!name) {
      return {
        ok: false,
        error: "Tool name is required",
        serverId: this.serverId,
        toolName: "",
      };
    }

    // Basic input isolation — reject prototype pollution keys.
    const safeArgs: Record<string, unknown> = {};
    if (args && typeof args === "object" && !Array.isArray(args)) {
      for (const [key, value] of Object.entries(args)) {
        if (key === "__proto__" || key === "constructor" || key === "prototype") {
          continue;
        }
        safeArgs[key] = value;
      }
    }

    try {
      const client = this.requireClient();
      const timeout = options.timeoutMs ?? this.timeoutMs;
      const result = await withTimeout(
        client.callTool({ name, arguments: safeArgs }),
        timeout,
        `callTool(${name})`
      );

      const isError = Boolean((result as { isError?: boolean }).isError);
      let errorText: string | undefined;
      if (isError) {
        const content = (result as { content?: unknown }).content;
        if (Array.isArray(content)) {
          const texts = content
            .map((item) =>
              item && typeof item === "object" && typeof (item as { text?: unknown }).text === "string"
                ? String((item as { text: string }).text).trim()
                : ""
            )
            .filter(Boolean);
          if (texts.length) errorText = texts.join("\n");
        }
        if (!errorText) errorText = "Tool reported an error";
      }
      return {
        ok: !isError,
        content: (result as { content?: unknown }).content,
        structuredContent: (result as { structuredContent?: unknown }).structuredContent,
        isError,
        error: errorText,
        serverId: this.serverId,
        toolName: name,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      mcpLog.error("client", "Tool call failed", {
        serverId: this.serverId,
        toolName: name,
        error: message,
      });
      return {
        ok: false,
        error: message,
        serverId: this.serverId,
        toolName: name,
      };
    }
  }

  async readResource(
    uri: string,
    options: { timeoutMs?: number } = {}
  ): Promise<McpReadResourceResult> {
    const resourceUri = String(uri || "").trim();
    if (!resourceUri) {
      return {
        ok: false,
        error: "Resource URI is required",
        serverId: this.serverId,
        uri: "",
      };
    }

    try {
      const client = this.requireClient();
      const timeout = options.timeoutMs ?? this.timeoutMs;
      const result = await withTimeout(
        client.readResource({ uri: resourceUri }),
        timeout,
        `readResource(${resourceUri})`
      );
      return {
        ok: true,
        contents: result.contents,
        serverId: this.serverId,
        uri: resourceUri,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: message,
        serverId: this.serverId,
        uri: resourceUri,
      };
    }
  }

  async getPrompt(
    name: string,
    args: Record<string, string> = {}
  ): Promise<{ ok: boolean; result?: unknown; error?: string }> {
    const promptName = String(name || "").trim();
    if (!promptName) return { ok: false, error: "Prompt name is required" };
    try {
      const client = this.requireClient();
      const result = await withTimeout(
        client.getPrompt({ name: promptName, arguments: args }),
        this.timeoutMs,
        `getPrompt(${promptName})`
      );
      return { ok: true, result };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async ping(timeoutMs = MCP_DEFAULTS.healthTimeoutMs): Promise<{
    ok: boolean;
    latencyMs: number;
    error?: string;
  }> {
    const started = Date.now();
    try {
      const client = this.requireClient();
      // Prefer SDK ping when available; fall back to a lightweight listTools.
      if (typeof (client as { ping?: () => Promise<unknown> }).ping === "function") {
        await withTimeout(
          (client as { ping: () => Promise<unknown> }).ping(),
          timeoutMs,
          "ping"
        );
      } else {
        await withTimeout(client.listTools(), timeoutMs, "ping/listTools");
      }
      return { ok: true, latencyMs: Date.now() - started };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  invalidateCapabilityCache(): void {
    this.capabilitiesCache = null;
    this.capabilitiesFetchedAt = 0;
  }
}

export default MCPClient;
