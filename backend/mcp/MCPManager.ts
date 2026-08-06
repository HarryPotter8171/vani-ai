/**
 * MCPManager — production orchestrator for MCP servers.
 * Connect/disconnect, lazy sessions, pooling, health, tool/resource APIs.
 */

import { randomUUID } from "node:crypto";
import { MCPSession } from "./MCPSession.ts";
import { mcpRegistry, sanitizeAgentToolName, validateServerInput } from "./MCPRegistry.ts";
import { mcpPermissionManager } from "./MCPPermissionManager.ts";
import {
  type McpCallToolResult,
  type McpHealthStatus,
  type McpReadResourceResult,
  type McpServerCapabilities,
  type McpServerConfig,
  type McpTransportConfig,
} from "./types.ts";
import { mcpLog } from "./logger.ts";

function tempId(): string {
  return `tmp_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export type PersistHooks = {
  saveServer: (config: McpServerConfig) => Promise<McpServerConfig>;
  deleteServer: (userId: string, serverId: string) => Promise<boolean>;
  listServers: (userId: string) => Promise<McpServerConfig[]>;
};

type AgentBridge = {
  registerServerTools: (
    server: McpServerConfig,
    capabilities: McpServerCapabilities
  ) => void;
  unregisterServerTools: (serverId: string) => void;
};

export class MCPManager {
  private sessions = new Map<string, MCPSession>();
  private persist: PersistHooks | null = null;
  private bridge: AgentBridge | null = null;
  private bootstrappedUsers = new Set<string>();
  private healthTimer: ReturnType<typeof setInterval> | null = null;

  setPersistHooks(hooks: PersistHooks): void {
    this.persist = hooks;
  }

  setAgentBridge(bridge: AgentBridge): void {
    this.bridge = bridge;
  }

  startHealthMonitor(intervalMs = 60_000): void {
    if (this.healthTimer) return;
    this.healthTimer = setInterval(() => {
      void this.healthCheckAll().catch((err) => {
        mcpLog.warn("manager", "Health sweep failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, intervalMs);
    if (typeof this.healthTimer.unref === "function") this.healthTimer.unref();
  }

  stopHealthMonitor(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }

  /** Graceful shutdown — stop health monitoring and disconnect every session. */
  async shutdown(): Promise<void> {
    this.stopHealthMonitor();
    const sessions = [...this.sessions.values()];
    this.sessions.clear();
    await Promise.all(
      sessions.map((session) => session.dispose().catch(() => undefined))
    );
  }

  /**
   * Lazy-load persisted servers for a user (once per process).
   */
  async ensureUserLoaded(userId: string): Promise<void> {
    if (!userId || this.bootstrappedUsers.has(userId)) return;
    if (!this.persist) {
      this.bootstrappedUsers.add(userId);
      return;
    }

    try {
      const servers = await this.persist.listServers(userId);
      for (const server of servers) {
        mcpRegistry.upsert(server);
        // Lazy: do not auto-connect at bootstrap — connect on demand or via
        // explicit connect. Live sessions are process-local.
      }
      // Only mark bootstrapped after a successful load so a transient Mongo
      // failure can be retried on the next request.
      this.bootstrappedUsers.add(userId);
      mcpLog.info("manager", "Loaded MCP servers for user", {
        userId,
        count: servers.length,
      });
    } catch (err) {
      mcpLog.error("manager", "Failed to load MCP servers", {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async listServers(userId: string) {
    await this.ensureUserLoaded(userId);
    return mcpRegistry.list(userId).map((server) => {
      const session = this.sessions.get(server.id);
      return {
        ...server,
        status: session?.connectionStatus || (server.enabled ? "disconnected" : "disabled"),
        lastError: session?.toPublicStatus().lastError ?? null,
        lastConnectedAt: session?.toPublicStatus().lastConnectedAt ?? null,
        capabilities:
          session?.toPublicStatus().capabilities ||
          mcpRegistry.getCachedCapabilities(server.id) ||
          null,
      };
    });
  }

  async addServer(
    userId: string,
    input: {
      name?: string;
      description?: string;
      enabled?: boolean;
      transport?: McpTransportConfig;
      timeoutMs?: number;
      autoReconnect?: boolean;
      maxReconnectAttempts?: number;
      connectNow?: boolean;
    }
  ) {
    await this.ensureUserLoaded(userId);
    mcpRegistry.assertUnderLimit(userId);

    const validated = validateServerInput(input);
    let config: McpServerConfig = {
      id: tempId(),
      userId,
      ...validated,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (this.persist) {
      config = await this.persist.saveServer(config);
    }
    mcpRegistry.upsert(config);

    if (input.connectNow !== false && config.enabled) {
      try {
        await this.connect(userId, config.id);
      } catch (err) {
        mcpLog.warn("manager", "Initial connect failed (server saved)", {
          serverId: config.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return this.getServer(userId, config.id);
  }

  async updateServer(
    userId: string,
    serverId: string,
    patch: Partial<{
      name: string;
      description: string;
      enabled: boolean;
      transport: McpTransportConfig;
      timeoutMs: number;
      autoReconnect: boolean;
      maxReconnectAttempts: number;
    }>
  ) {
    await this.ensureUserLoaded(userId);
    const existing = mcpRegistry.get(serverId);
    if (!existing || existing.userId !== userId) {
      throw new Error("MCP server not found");
    }

    const nextInput = {
      name: patch.name ?? existing.name,
      description:
        patch.description !== undefined ? patch.description : existing.description,
      enabled: patch.enabled ?? existing.enabled,
      transport: patch.transport ?? existing.transport,
      timeoutMs: patch.timeoutMs ?? existing.timeoutMs,
      autoReconnect: patch.autoReconnect ?? existing.autoReconnect,
      maxReconnectAttempts:
        patch.maxReconnectAttempts ?? existing.maxReconnectAttempts,
    };

    const validated = validateServerInput(nextInput);
    const config: McpServerConfig = {
      ...existing,
      ...validated,
      updatedAt: new Date().toISOString(),
    };

    const transportChanged =
      JSON.stringify(existing.transport) !== JSON.stringify(config.transport);
    const wasConnected = this.sessions.get(serverId)?.connectionStatus === "connected";

    if (transportChanged || patch.enabled === false) {
      await this.disconnect(userId, serverId);
    }

    if (this.persist) await this.persist.saveServer(config);
    mcpRegistry.upsert(config);

    // Replace live session config
    const oldSession = this.sessions.get(serverId);
    if (oldSession) {
      await oldSession.dispose();
      this.sessions.delete(serverId);
      this.bridge?.unregisterServerTools(serverId);
    }

    if (config.enabled && (wasConnected || patch.enabled === true)) {
      try {
        await this.connect(userId, serverId);
      } catch {
        // status recorded on session
      }
    }

    return this.getServer(userId, serverId);
  }

  async removeServer(userId: string, serverId: string) {
    await this.ensureUserLoaded(userId);
    const existing = mcpRegistry.get(serverId);
    if (!existing || existing.userId !== userId) {
      throw new Error("MCP server not found");
    }

    await this.disconnect(userId, serverId);
    const session = this.sessions.get(serverId);
    if (session) {
      await session.dispose();
      this.sessions.delete(serverId);
    }
    this.bridge?.unregisterServerTools(serverId);
    mcpRegistry.remove(serverId);
    await mcpPermissionManager.revokeAll(userId, serverId);
    if (this.persist) await this.persist.deleteServer(userId, serverId);
    return true;
  }

  async getServer(userId: string, serverId: string) {
    await this.ensureUserLoaded(userId);
    const servers = await this.listServers(userId);
    const server = servers.find((s) => s.id === serverId);
    if (!server) throw new Error("MCP server not found");
    return server;
  }

  private getOrCreateSession(config: McpServerConfig): MCPSession {
    let session = this.sessions.get(config.id);
    if (session) return session;

    session = new MCPSession(config);
    session.on((event) => {
      if (event.type === "capabilities") {
        const annotated = mcpRegistry.annotateTools(config, event.capabilities);
        mcpRegistry.cacheCapabilities(config.id, annotated);
        this.bridge?.registerServerTools(config, annotated);
      }
      if (event.type === "status" && (event.status === "disconnected" || event.status === "error" || event.status === "disabled")) {
        this.bridge?.unregisterServerTools(config.id);
      }
    });
    this.sessions.set(config.id, session);
    return session;
  }

  async connect(userId: string, serverId: string) {
    await this.ensureUserLoaded(userId);
    const config = mcpRegistry.get(serverId);
    if (!config || config.userId !== userId) {
      throw new Error("MCP server not found");
    }
    if (!config.enabled) {
      throw new Error("MCP server is disabled — enable it first");
    }

    const session = this.getOrCreateSession(config);
    await session.connect();
    const caps = await session.client.refreshCapabilities({ force: true });
    const annotated = mcpRegistry.annotateTools(config, caps);
    mcpRegistry.cacheCapabilities(serverId, annotated);
    this.bridge?.registerServerTools(config, annotated);
    return session.toPublicStatus();
  }

  async disconnect(userId: string, serverId: string) {
    await this.ensureUserLoaded(userId);
    const config = mcpRegistry.get(serverId);
    if (!config || config.userId !== userId) {
      throw new Error("MCP server not found");
    }
    const session = this.sessions.get(serverId);
    if (session) {
      await session.disconnect();
    }
    this.bridge?.unregisterServerTools(serverId);
    return true;
  }

  async testConnection(userId: string, serverId: string) {
    const status = await this.connect(userId, serverId);
    const session = this.sessions.get(serverId);
    const health = session ? await session.healthCheck() : null;
    return { status, health };
  }

  /**
   * Test a transport config without persisting (Settings "Test" before save).
   */
  async testTransport(transport: McpTransportConfig, timeoutMs?: number) {
    // Same validation as register — blocks stdio RCE via test-transport.
    const validated = validateServerInput({
      name: "temp-test",
      transport,
      timeoutMs,
      autoReconnect: false,
      maxReconnectAttempts: 0,
    });
    const tempId = `temp_${randomUUID()}`;
    const session = new MCPSession({
      id: tempId,
      userId: "system",
      name: "temp-test",
      enabled: true,
      transport: validated.transport,
      timeoutMs: validated.timeoutMs,
      autoReconnect: false,
      maxReconnectAttempts: 0,
    });
    try {
      await session.connect();
      const health = await session.healthCheck();
      const caps = session.client.getCachedCapabilities();
      return {
        ok: health.healthy,
        health,
        capabilities: caps,
      };
    } finally {
      await session.dispose();
    }
  }

  async listTools(userId: string, serverId: string) {
    const session = await this.ensureConnected(userId, serverId);
    const config = mcpRegistry.get(serverId)!;
    const caps = await session.client.listTools({ force: true });
    return caps.map((t) => ({
      ...t,
      agentToolName: sanitizeAgentToolName(config.name, t.name, config.id),
    }));
  }

  async listResources(userId: string, serverId: string) {
    const session = await this.ensureConnected(userId, serverId);
    return session.client.listResources({ force: true });
  }

  async listPrompts(userId: string, serverId: string) {
    const session = await this.ensureConnected(userId, serverId);
    return session.client.listPrompts({ force: true });
  }

  async callTool(
    userId: string,
    serverId: string,
    toolName: string,
    args: Record<string, unknown> = {},
    options: { skipPermission?: boolean; timeoutMs?: number } = {}
  ): Promise<McpCallToolResult> {
    if (!options.skipPermission) {
      const decision = await mcpPermissionManager.checkToolPermission(
        userId,
        serverId,
        toolName
      );
      if (!decision.allowed) {
        return {
          ok: false,
          error: decision.message,
          serverId,
          toolName,
        };
      }
    }

    const session = await this.ensureConnected(userId, serverId);
    return session.client.callTool(toolName, args, {
      timeoutMs: options.timeoutMs,
    });
  }

  async readResource(
    userId: string,
    serverId: string,
    uri: string
  ): Promise<McpReadResourceResult> {
    const session = await this.ensureConnected(userId, serverId);
    return session.client.readResource(uri);
  }

  async healthCheck(userId: string, serverId: string): Promise<McpHealthStatus> {
    await this.ensureUserLoaded(userId);
    const config = mcpRegistry.get(serverId);
    if (!config || config.userId !== userId) {
      throw new Error("MCP server not found");
    }
    const session = this.sessions.get(serverId);
    if (!session) {
      return {
        serverId,
        status: config.enabled ? "disconnected" : "disabled",
        healthy: false,
        lastError: null,
      };
    }
    return session.healthCheck();
  }

  async healthCheckAll(): Promise<McpHealthStatus[]> {
    const results: McpHealthStatus[] = [];
    for (const session of this.sessions.values()) {
      results.push(await session.healthCheck());
    }
    return results;
  }

  /**
   * Resolve all MCP tools currently registered for a user (connected sessions).
   */
  async discoverTools(userId: string) {
    await this.ensureUserLoaded(userId);
    const out: Array<{
      serverId: string;
      serverName: string;
      toolName: string;
      agentToolName: string;
      description?: string;
      inputSchema?: Record<string, unknown>;
    }> = [];

    for (const server of mcpRegistry.listEnabled(userId)) {
      const caps =
        this.sessions.get(server.id)?.client.getCachedCapabilities() ||
        mcpRegistry.getCachedCapabilities(server.id);
      if (!caps) continue;
      for (const tool of caps.tools) {
        out.push({
          serverId: server.id,
          serverName: server.name,
          toolName: tool.name,
          agentToolName:
            tool.agentToolName ||
            sanitizeAgentToolName(server.name, tool.name, server.id),
          description: tool.description,
          inputSchema: tool.inputSchema,
        });
      }
    }
    return out;
  }

  listMcpAgentToolNames(userId?: string): string[] {
    const names: string[] = [];
    const servers = userId ? mcpRegistry.listEnabled(userId) : mcpRegistry.list();
    for (const server of servers) {
      const caps =
        this.sessions.get(server.id)?.client.getCachedCapabilities() ||
        mcpRegistry.getCachedCapabilities(server.id);
      if (!caps) continue;
      for (const tool of caps.tools) {
        names.push(
          tool.agentToolName ||
            sanitizeAgentToolName(server.name, tool.name, server.id)
        );
      }
    }
    return names;
  }

  private async ensureConnected(userId: string, serverId: string): Promise<MCPSession> {
    await this.ensureUserLoaded(userId);
    const config = mcpRegistry.get(serverId);
    if (!config || config.userId !== userId) {
      throw new Error("MCP server not found");
    }
    if (!config.enabled) {
      throw new Error("MCP server is disabled");
    }
    const session = this.getOrCreateSession(config);
    if (!session.client.isConnected) {
      await session.connect();
    }
    return session;
  }

  /** Connection pool size (live sessions). */
  poolSize(): number {
    return this.sessions.size;
  }
}

export const mcpManager = new MCPManager();

export default MCPManager;
