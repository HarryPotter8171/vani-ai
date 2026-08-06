/**
 * MCPSession — per-server connection lifecycle with health + auto-reconnect.
 */

import { MCPClient } from "./MCPClient.ts";
import { MCP_DEFAULTS, type McpConnectionStatus, type McpHealthStatus, type McpServerCapabilities, type McpServerConfig } from "./types.ts";
import { mcpLog } from "./logger.ts";

export type SessionEvent =
  | { type: "status"; status: McpConnectionStatus; error?: string }
  | { type: "capabilities"; capabilities: McpServerCapabilities }
  | { type: "health"; health: McpHealthStatus };

type SessionListener = (event: SessionEvent) => void;

export class MCPSession {
  readonly config: McpServerConfig;
  readonly client: MCPClient;
  private status: McpConnectionStatus = "disconnected";
  private lastError: string | null = null;
  private lastConnectedAt: string | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private listeners = new Set<SessionListener>();
  private connectPromise: Promise<void> | null = null;

  constructor(config: McpServerConfig) {
    this.config = config;
    this.client = new MCPClient(config.id, config.transport, {
      timeoutMs: config.timeoutMs ?? MCP_DEFAULTS.timeoutMs,
    });
    if (!config.enabled) {
      this.status = "disabled";
    }
  }

  get id(): string {
    return this.config.id;
  }

  get connectionStatus(): McpConnectionStatus {
    return this.status;
  }

  on(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: SessionEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // ignore listener errors
      }
    }
  }

  private setStatus(status: McpConnectionStatus, error?: string): void {
    this.status = status;
    if (error !== undefined) this.lastError = error;
    if (status === "connected") {
      this.lastError = null;
      this.lastConnectedAt = new Date().toISOString();
      this.reconnectAttempts = 0;
    }
    this.emit({ type: "status", status, error });
  }

  async connect(): Promise<void> {
    if (this.disposed) throw new Error("Session disposed");
    if (!this.config.enabled) {
      this.setStatus("disabled");
      throw new Error(`MCP server "${this.config.name}" is disabled`);
    }
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = (async () => {
      this.clearReconnectTimer();
      this.setStatus(
        this.reconnectAttempts > 0 ? "reconnecting" : "connecting"
      );
      try {
        await this.client.connect();
        this.setStatus("connected");
        const caps = await this.client.refreshCapabilities({ force: true });
        this.emit({ type: "capabilities", capabilities: caps });
        mcpLog.info("session", "Session connected", {
          serverId: this.id,
          tools: caps.tools.length,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.setStatus("error", message);
        this.scheduleReconnect();
        throw err;
      } finally {
        this.connectPromise = null;
      }
    })();

    return this.connectPromise;
  }

  async disconnect(options: { permanent?: boolean } = {}): Promise<void> {
    this.clearReconnectTimer();
    if (options.permanent) this.disposed = true;
    await this.client.disconnect();
    this.setStatus(this.config.enabled ? "disconnected" : "disabled");
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.clearReconnectTimer();
    this.listeners.clear();
    await this.client.disconnect();
    this.status = "disconnected";
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed || !this.config.enabled) return;
    if (this.config.autoReconnect === false) return;

    const max =
      this.config.maxReconnectAttempts ?? MCP_DEFAULTS.maxReconnectAttempts;
    if (max > 0 && this.reconnectAttempts >= max) {
      mcpLog.warn("session", "Max reconnect attempts reached", {
        serverId: this.id,
        attempts: this.reconnectAttempts,
      });
      return;
    }

    this.reconnectAttempts += 1;
    const delay = Math.min(
      MCP_DEFAULTS.reconnectBaseDelayMs * 2 ** (this.reconnectAttempts - 1),
      MCP_DEFAULTS.reconnectMaxDelayMs
    );

    mcpLog.info("session", "Scheduling reconnect", {
      serverId: this.id,
      attempt: this.reconnectAttempts,
      delayMs: delay,
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect().catch(() => {
        // errors already recorded on session
      });
    }, delay);
    if (typeof this.reconnectTimer.unref === "function") {
      this.reconnectTimer.unref();
    }
  }

  /**
   * Called when the underlying transport drops unexpectedly.
   */
  notifyTransportLost(error?: string): void {
    if (this.disposed || this.status === "disabled") return;
    this.setStatus("error", error || "Transport closed");
    void this.client.disconnect().catch(() => {});
    this.scheduleReconnect();
  }

  async healthCheck(): Promise<McpHealthStatus> {
    const caps = this.client.getCachedCapabilities();
    if (!this.client.isConnected || this.status !== "connected") {
      const health: McpHealthStatus = {
        serverId: this.id,
        status: this.status,
        healthy: false,
        lastError: this.lastError,
        lastConnectedAt: this.lastConnectedAt,
        reconnectAttempts: this.reconnectAttempts,
        toolCount: caps?.tools.length ?? 0,
        resourceCount: caps?.resources.length ?? 0,
        promptCount: caps?.prompts.length ?? 0,
      };
      this.emit({ type: "health", health });
      return health;
    }

    const ping = await this.client.ping();
    if (!ping.ok) {
      this.setStatus("error", ping.error || "Health check failed");
      this.scheduleReconnect();
    }

    const health: McpHealthStatus = {
      serverId: this.id,
      status: this.status,
      healthy: ping.ok,
      latencyMs: ping.latencyMs,
      lastError: ping.ok ? null : ping.error || this.lastError,
      lastConnectedAt: this.lastConnectedAt,
      reconnectAttempts: this.reconnectAttempts,
      toolCount: caps?.tools.length ?? 0,
      resourceCount: caps?.resources.length ?? 0,
      promptCount: caps?.prompts.length ?? 0,
    };
    this.emit({ type: "health", health });
    return health;
  }

  toPublicStatus() {
    const caps = this.client.getCachedCapabilities();
    return {
      id: this.id,
      name: this.config.name,
      enabled: this.config.enabled,
      status: this.status,
      transportType: this.config.transport.type,
      lastError: this.lastError,
      lastConnectedAt: this.lastConnectedAt,
      reconnectAttempts: this.reconnectAttempts,
      capabilities: caps
        ? {
            tools: caps.tools,
            resources: caps.resources,
            prompts: caps.prompts,
            serverName: caps.serverName,
            serverVersion: caps.serverVersion,
            instructions: caps.instructions,
          }
        : null,
    };
  }
}

export default MCPSession;
