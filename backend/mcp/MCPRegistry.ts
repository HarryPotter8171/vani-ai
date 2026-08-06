/**
 * MCPRegistry — server config catalog + cached capability snapshots.
 * Isolates per-user server definitions; does not own live connections.
 */

import { MCP_DEFAULTS, type McpServerCapabilities, type McpServerConfig, type McpTransportConfig } from "./types.ts";
import { mcpLog } from "./logger.ts";
import { assertMcpStdioAllowed } from "./stdioGuard.ts";
import { validatePublicUrl } from "../services/research/urlSafety.js";

/**
 * Reject private / loopback / metadata remote MCP endpoints (SSRF).
 * @param {string} url
 * @param {"http" | "sse" | "websocket"} type
 */
function assertPublicRemoteMcpUrl(url: string, type: "http" | "sse" | "websocket"): string {
  const allowWebSocket = type === "websocket";
  const result = validatePublicUrl(url, { allowWebSocket });
  if (!result.ok) {
    throw new Error(`Blocked non-public MCP URL: ${result.error}`);
  }
  if (type === "http" || type === "sse") {
    if (result.url.protocol !== "http:" && result.url.protocol !== "https:") {
      throw new Error(`${type} transport requires an http(s) URL`);
    }
  }
  return result.url.href.slice(0, 2000);
}

function slugify(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "server";
}

/**
 * Stable agent-facing tool name. Includes a short server-id suffix so two users
 * (or two servers) with the same display name do not collide in the global
 * agent ToolRegistry.
 */
export function sanitizeAgentToolName(
  serverName: string,
  toolName: string,
  serverId?: string
): string {
  const server = slugify(serverName).slice(0, 16);
  const tool = slugify(toolName).slice(0, 28);
  const idSuffix = serverId
    ? `_${String(serverId)
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(-8)
        .toLowerCase()}`
    : "";
  let name = `mcp_${server}_${tool}${idSuffix}`;
  // Agent registry requires /^[a-z][a-z0-9_]*$/
  name = name.replace(/[^a-z0-9_]/g, "_");
  if (!/^[a-z]/.test(name)) name = `m_${name}`;
  return name.slice(0, 64);
}

function validateTransport(transport: McpTransportConfig): McpTransportConfig {
  if (!transport || typeof transport !== "object") {
    throw new Error("Transport configuration is required");
  }
  const type = transport.type;
  if (!["stdio", "http", "sse", "websocket"].includes(type)) {
    throw new Error(`Unsupported transport type: ${type}`);
  }

  if (type === "stdio") {
    // Multi-tenant RCE guard — stdio spawns on the API host.
    assertMcpStdioAllowed();
    const command = String(transport.command || "").trim();
    if (!command) throw new Error("stdio transport requires a command");
    if (command.length > 500) throw new Error("Command is too long");
    const args = Array.isArray(transport.args)
      ? transport.args.map((a) => String(a).slice(0, 500)).slice(0, 50)
      : [];
    return {
      type: "stdio",
      command,
      args,
      env: transport.env,
      cwd: transport.cwd ? String(transport.cwd).slice(0, 1000) : undefined,
    };
  }

  if (type === "http" || type === "sse") {
    const url = String(transport.url || "").trim();
    if (!url) throw new Error(`${type} transport requires a URL`);
    const safeUrl = assertPublicRemoteMcpUrl(url, type);
    return {
      type,
      url: safeUrl,
      headers: transport.headers,
    };
  }

  const url = String(transport.url || "").trim();
  if (!url) throw new Error("websocket transport requires a URL");
  const safeUrl = assertPublicRemoteMcpUrl(url, "websocket");
  return { type: "websocket", url: safeUrl };
}

export function validateServerInput(input: {
  name?: string;
  description?: string;
  enabled?: boolean;
  transport?: McpTransportConfig;
  timeoutMs?: number;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
}): Omit<McpServerConfig, "id" | "userId" | "createdAt" | "updatedAt"> {
  const name = String(input.name || "").trim();
  if (name.length < 1 || name.length > 80) {
    throw new Error("Server name must be 1–80 characters");
  }

  const description =
    typeof input.description === "string"
      ? input.description.trim().slice(0, 500)
      : undefined;

  if (!input.transport) throw new Error("Transport is required");
  const transport = validateTransport(input.transport);

  const timeoutMs =
    typeof input.timeoutMs === "number" && Number.isFinite(input.timeoutMs)
      ? Math.min(Math.max(1_000, Math.floor(input.timeoutMs)), 120_000)
      : MCP_DEFAULTS.timeoutMs;

  return {
    name,
    description,
    enabled: input.enabled !== false,
    transport,
    timeoutMs,
    autoReconnect: input.autoReconnect !== false,
    maxReconnectAttempts:
      typeof input.maxReconnectAttempts === "number"
        ? Math.min(Math.max(0, Math.floor(input.maxReconnectAttempts)), 20)
        : MCP_DEFAULTS.maxReconnectAttempts,
  };
}

type CapabilityCacheEntry = {
  capabilities: McpServerCapabilities;
  expiresAt: number;
};

/**
 * In-process registry of known server configs + capability cache.
 * Persistence is handled by MCPManager via Mongo models.
 */
export class MCPRegistry {
  private servers = new Map<string, McpServerConfig>();
  private capabilityCache = new Map<string, CapabilityCacheEntry>();

  upsert(config: McpServerConfig): McpServerConfig {
    this.servers.set(config.id, config);
    return config;
  }

  get(serverId: string): McpServerConfig | null {
    return this.servers.get(serverId) || null;
  }

  remove(serverId: string): boolean {
    this.capabilityCache.delete(serverId);
    return this.servers.delete(serverId);
  }

  list(userId?: string): McpServerConfig[] {
    const all = [...this.servers.values()];
    if (!userId) return all;
    return all.filter((s) => s.userId === userId);
  }

  listEnabled(userId?: string): McpServerConfig[] {
    return this.list(userId).filter((s) => s.enabled);
  }

  clearUser(userId: string): void {
    for (const [id, server] of this.servers) {
      if (server.userId === userId) {
        this.servers.delete(id);
        this.capabilityCache.delete(id);
      }
    }
  }

  cacheCapabilities(serverId: string, capabilities: McpServerCapabilities): void {
    this.capabilityCache.set(serverId, {
      capabilities,
      expiresAt: Date.now() + MCP_DEFAULTS.capabilityCacheTtlMs,
    });
  }

  getCachedCapabilities(serverId: string): McpServerCapabilities | null {
    const entry = this.capabilityCache.get(serverId);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.capabilityCache.delete(serverId);
      return null;
    }
    return entry.capabilities;
  }

  invalidateCapabilities(serverId: string): void {
    this.capabilityCache.delete(serverId);
  }

  /** Connection pooling helper — count active configs (sessions owned by Manager). */
  size(userId?: string): number {
    return this.list(userId).length;
  }

  assertUnderLimit(userId: string): void {
    if (this.size(userId) >= MCP_DEFAULTS.maxServersPerUser) {
      throw new Error(
        `Maximum of ${MCP_DEFAULTS.maxServersPerUser} MCP servers reached`
      );
    }
  }

  annotateTools(
    server: McpServerConfig,
    capabilities: McpServerCapabilities
  ): McpServerCapabilities {
    return {
      ...capabilities,
      tools: capabilities.tools.map((t) => ({
        ...t,
        agentToolName: sanitizeAgentToolName(server.name, t.name, server.id),
      })),
    };
  }

  logSummary(userId?: string): void {
    const servers = this.list(userId);
    mcpLog.debug("registry", "Registry snapshot", {
      count: servers.length,
      enabled: servers.filter((s) => s.enabled).length,
    });
  }
}

export const mcpRegistry = new MCPRegistry();

export default MCPRegistry;
