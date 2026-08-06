export type McpTransportType = 'stdio' | 'http' | 'sse' | 'websocket';

export type McpConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'
  | 'disabled';

export interface McpStdioTransport {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface McpHttpTransport {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
}

export interface McpSseTransport {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
}

export interface McpWebSocketTransport {
  type: 'websocket';
  url: string;
}

export type McpTransportConfig =
  | McpStdioTransport
  | McpHttpTransport
  | McpSseTransport
  | McpWebSocketTransport;

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
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

export interface McpCapabilities {
  tools: McpToolInfo[];
  resources: McpResourceInfo[];
  prompts: McpPromptInfo[];
  serverName?: string;
  serverVersion?: string;
  instructions?: string;
}

export interface McpServer {
  id: string;
  userId: string;
  name: string;
  description?: string;
  enabled: boolean;
  transport: McpTransportConfig;
  timeoutMs?: number;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  status?: McpConnectionStatus;
  lastError?: string | null;
  lastConnectedAt?: string | null;
  capabilities?: McpCapabilities | null;
  createdAt?: string;
  updatedAt?: string;
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

export interface McpPermission {
  userId: string;
  serverId: string;
  trusted: boolean;
  allowedTools: string[];
  deniedTools: string[];
  updatedAt?: string;
}

export interface McpServerInput {
  name: string;
  description?: string;
  enabled?: boolean;
  transport: McpTransportConfig;
  timeoutMs?: number;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  connectNow?: boolean;
}

export const MCP_TRANSPORT_LABELS: Record<McpTransportType, string> = {
  stdio: 'stdio',
  http: 'HTTP',
  sse: 'SSE',
  websocket: 'WebSocket',
};

export const MCP_STATUS_LABELS: Record<McpConnectionStatus, string> = {
  disconnected: 'Disconnected',
  connecting: 'Connecting',
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  error: 'Error',
  disabled: 'Disabled',
};
