import { apiFetch } from '@/lib/apiClient';
import type {
  McpHealthStatus,
  McpPermission,
  McpResourceInfo,
  McpServer,
  McpServerInput,
  McpToolInfo,
  McpTransportConfig,
} from '@/lib/mcp/types';

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

function qs(extra: Record<string, string> = {}) {
  const params = new URLSearchParams(extra);
  const s = params.toString();
  return s ? `?${s}` : '';
}

export async function fetchMcpServers(): Promise<McpServer[]> {
  const res = await apiFetch('/mcp/servers');
  const data = await parseJson<{ servers: McpServer[] }>(res);
  return data.servers || [];
}

export async function fetchMcpServer(id: string): Promise<McpServer> {
  const res = await apiFetch(`/mcp/servers/${id}`);
  const data = await parseJson<{ server: McpServer }>(res);
  return data.server;
}

export async function createMcpServer(input: McpServerInput): Promise<McpServer> {
  const res = await apiFetch('/mcp/servers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const data = await parseJson<{ server: McpServer }>(res);
  return data.server;
}

export async function updateMcpServer(
  id: string,
  patch: Partial<McpServerInput>
): Promise<McpServer> {
  const res = await apiFetch(`/mcp/servers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  const data = await parseJson<{ server: McpServer }>(res);
  return data.server;
}

export async function deleteMcpServer(id: string): Promise<void> {
  const res = await apiFetch(`/mcp/servers/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  });
  await parseJson(res);
}

export async function connectMcpServer(id: string) {
  const res = await apiFetch(`/mcp/servers/${id}/connect`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return parseJson<{ status: McpServer }>(res);
}

export async function disconnectMcpServer(id: string) {
  const res = await apiFetch(`/mcp/servers/${id}/disconnect`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return parseJson<{ ok: boolean }>(res);
}

export async function testMcpServer(id: string) {
  const res = await apiFetch(`/mcp/servers/${id}/test`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return parseJson<{ status: McpServer; health: McpHealthStatus }>(res);
}

export async function testMcpTransport(transport: McpTransportConfig) {
  const res = await apiFetch('/mcp/test-transport', {
    method: 'POST',
    body: JSON.stringify({ transport }),
  });
  return parseJson<{
    ok: boolean;
    health: McpHealthStatus;
    capabilities?: { tools: McpToolInfo[]; resources: McpResourceInfo[] };
  }>(res);
}

export async function fetchMcpTools(serverId: string): Promise<McpToolInfo[]> {
  const res = await apiFetch(`/mcp/servers/${serverId}/tools${qs()}`);
  const data = await parseJson<{ tools: McpToolInfo[] }>(res);
  return data.tools || [];
}

export async function fetchMcpResources(serverId: string): Promise<McpResourceInfo[]> {
  const res = await apiFetch(`/mcp/servers/${serverId}/resources${qs()}`);
  const data = await parseJson<{ resources: McpResourceInfo[] }>(res);
  return data.resources || [];
}

export async function fetchMcpHealth(serverId: string): Promise<McpHealthStatus> {
  const res = await apiFetch(`/mcp/servers/${serverId}/health${qs()}`);
  const data = await parseJson<{ health: McpHealthStatus }>(res);
  return data.health;
}

export async function callMcpTool(
  serverId: string,
  toolName: string,
  args: Record<string, unknown> = {}
) {
  const res = await apiFetch(`/mcp/servers/${serverId}/tools/call`, {
    method: 'POST',
    body: JSON.stringify({
      toolName,
      arguments: args,
    }),
  });
  return parseJson<{
    ok: boolean;
    content?: unknown;
    error?: string;
    toolName: string;
    serverId: string;
  }>(res);
}

export async function fetchMcpPermission(serverId: string): Promise<McpPermission> {
  const res = await apiFetch(`/mcp/servers/${serverId}/permissions${qs()}`);
  const data = await parseJson<{ permission: McpPermission }>(res);
  return data.permission;
}

export async function grantMcpPermission(
  serverId: string,
  options: { trustServer?: boolean; toolName?: string }
): Promise<McpPermission> {
  const res = await apiFetch(`/mcp/servers/${serverId}/permissions/grant`, {
    method: 'POST',
    body: JSON.stringify(options),
  });
  const data = await parseJson<{ permission: McpPermission }>(res);
  return data.permission;
}

export async function revokeMcpPermission(
  serverId: string,
  options: { toolName?: string; untrust?: boolean; all?: boolean } = {}
) {
  const res = await apiFetch(`/mcp/servers/${serverId}/permissions/revoke`, {
    method: 'POST',
    body: JSON.stringify(options),
  });
  return parseJson<{ ok?: boolean; permission?: McpPermission }>(res);
}

export async function discoverMcpTools() {
  const res = await apiFetch(`/mcp/tools${qs()}`);
  return parseJson<{
    tools: Array<{
      serverId: string;
      serverName: string;
      toolName: string;
      agentToolName: string;
      description?: string;
    }>;
  }>(res);
}
