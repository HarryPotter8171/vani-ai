/**
 * Shared MCP types for VANI AI's production MCP client.
 */

export type McpTransportType = "stdio" | "http" | "sse" | "websocket";

export type McpConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error"
  | "disabled";

export interface McpStdioConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface McpHttpConfig {
  url: string;
  headers?: Record<string, string>;
}

export interface McpSseConfig {
  url: string;
  headers?: Record<string, string>;
}

export interface McpWebSocketConfig {
  url: string;
}

export type McpTransportConfig =
  | ({ type: "stdio" } & McpStdioConfig)
  | ({ type: "http" } & McpHttpConfig)
  | ({ type: "sse" } & McpSseConfig)
  | ({ type: "websocket" } & McpWebSocketConfig);

export interface McpServerConfig {
  id: string;
  userId: string;
  name: string;
  description?: string;
  enabled: boolean;
  transport: McpTransportConfig;
  /** Soft timeout for individual MCP requests (ms). */
  timeoutMs?: number;
  /** Auto-reconnect when the transport drops. */
  autoReconnect?: boolean;
  /** Max reconnect attempts before giving up (0 = unlimited while enabled). */
  maxReconnectAttempts?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  /** Agent-facing sanitized name (mcp_<server>_<tool>). */
  agentToolName?: string;
}

export interface McpResourceInfo {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export interface McpPromptInfo {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface McpServerCapabilities {
  tools: McpToolInfo[];
  resources: McpResourceInfo[];
  prompts: McpPromptInfo[];
  serverName?: string;
  serverVersion?: string;
  instructions?: string;
  fetchedAt?: number;
}

export interface McpHealthStatus {
  serverId: string;
  status: McpConnectionStatus;
  healthy: boolean;
  latencyMs?: number;
  lastError?: string | null;
  lastConnectedAt?: string | null;
  reconnectAttempts?: number;
  toolCount?: number;
  resourceCount?: number;
  promptCount?: number;
}

export interface McpPermissionRecord {
  userId: string;
  serverId: string;
  /** Trust entire server — skip per-tool prompts. */
  trusted: boolean;
  /** Explicitly allowed tool names (MCP native names). */
  allowedTools: string[];
  /** Explicitly denied tool names. */
  deniedTools: string[];
  updatedAt?: string;
}

export interface McpCallToolResult {
  ok: boolean;
  content?: unknown;
  structuredContent?: unknown;
  isError?: boolean;
  error?: string;
  serverId: string;
  toolName: string;
}

export interface McpReadResourceResult {
  ok: boolean;
  contents?: unknown;
  error?: string;
  serverId: string;
  uri: string;
}

export interface McpLogEvent {
  level: "debug" | "info" | "warn" | "error";
  scope: string;
  message: string;
  meta?: Record<string, unknown>;
  timestamp: string;
}

export const MCP_DEFAULTS = {
  timeoutMs: 30_000,
  connectTimeoutMs: 20_000,
  healthTimeoutMs: 8_000,
  autoReconnect: true,
  maxReconnectAttempts: 5,
  reconnectBaseDelayMs: 1_000,
  reconnectMaxDelayMs: 30_000,
  capabilityCacheTtlMs: 60_000,
  maxServersPerUser: 25,
  clientName: "vani-ai",
  clientVersion: "1.0.0",
} as const;
