/**
 * Bridge MCP tools into the VANI agent ToolRegistry.
 * Agents automatically discover MCP tools when servers are connected.
 */

import {
  createAgentTool,
  registerAgentTool,
  getAgentTool,
} from "../agents/ToolRegistry.js";
import { mcpManager } from "./MCPManager.ts";
import { sanitizeAgentToolName } from "./MCPRegistry.ts";
import type { McpServerCapabilities, McpServerConfig } from "./types.ts";
import { mcpLog } from "./logger.ts";

/** serverId → agent tool names registered for that server */
const registeredByServer = new Map<string, string[]>();

/** agentToolName → { serverId, toolName, userId } */
const toolIndex = new Map<
  string,
  { serverId: string; toolName: string; userId: string; serverName: string }
>();

function extractContentText(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  const parts = content
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const text = (item as { text?: unknown }).text;
      return typeof text === "string" && text.trim() ? text.trim() : null;
    })
    .filter(Boolean);
  return parts.length ? parts.join("\n") : null;
}

function unregisterNames(names: string[]) {
  for (const name of names) {
    toolIndex.delete(name);
    // ToolRegistry has no unregister — mark disabled if present
    const existing = getAgentTool(name);
    if (existing) {
      existing.enabled = false;
    }
  }
}

export function registerServerTools(
  server: McpServerConfig,
  capabilities: McpServerCapabilities
): void {
  const prev = registeredByServer.get(server.id) || [];
  unregisterNames(prev);

  const names: string[] = [];
  for (const tool of capabilities.tools || []) {
    const agentName =
      tool.agentToolName ||
      sanitizeAgentToolName(server.name, tool.name, server.id);

    const agentTool = createAgentTool({
      name: agentName,
      displayName: `${server.name}: ${tool.name}`,
      description:
        tool.description ||
        `MCP tool "${tool.name}" from server "${server.name}"`,
      schema: tool.inputSchema || { type: "object", properties: {} },
      cacheable: false,
      enabled: true,
      validate(args = {}) {
        if (args && typeof args === "object" && !Array.isArray(args)) {
          return { ok: true, args };
        }
        return { ok: false, error: "Arguments must be an object" };
      },
      async execute(args = {}, ctx = {}) {
        const userId =
          ctx.userId ||
          ctx.userKey ||
          server.userId;
        if (!userId) {
          return { ok: false, error: "Missing user context for MCP tool" };
        }

        // Reject cross-user execution even if the planner somehow saw another
        // user's MCP tool name in a shared process.
        if (String(userId) !== String(server.userId)) {
          return {
            ok: false,
            error: "MCP tool is not available for this user",
            mcp: { serverId: server.id, tool: tool.name },
          };
        }

        const result = await mcpManager.callTool(
          String(userId),
          server.id,
          tool.name,
          (args || {}) as Record<string, unknown>
        );

        if (!result.ok) {
          const detail =
            result.error ||
            extractContentText(result.content) ||
            "MCP tool failed";
          return {
            ok: false,
            error: detail,
            data: {
              content: result.content,
              structuredContent: result.structuredContent,
            },
            mcp: { serverId: server.id, tool: tool.name },
          };
        }

        return {
          ok: true,
          data: {
            content: result.content,
            structuredContent: result.structuredContent,
          },
          mcp: { serverId: server.id, tool: tool.name, serverName: server.name },
        };
      },
    });

    registerAgentTool(agentTool);
    toolIndex.set(agentName, {
      serverId: server.id,
      toolName: tool.name,
      userId: server.userId,
      serverName: server.name,
    });
    names.push(agentName);
  }

  registeredByServer.set(server.id, names);
  mcpLog.info("bridge", "Registered MCP tools with agents", {
    serverId: server.id,
    count: names.length,
  });
}

export function unregisterServerTools(serverId: string): void {
  const names = registeredByServer.get(serverId) || [];
  unregisterNames(names);
  registeredByServer.delete(serverId);
  mcpLog.info("bridge", "Unregistered MCP tools", {
    serverId,
    count: names.length,
  });
}

/**
 * List MCP agent tool names currently registered.
 * When `userId` is provided, only that user's tools are returned (multi-tenant).
 */
export function listRegisteredMcpAgentTools(userId?: string | null): string[] {
  const want = userId ? String(userId) : null;
  return [...toolIndex.entries()]
    .filter(([name, meta]) => {
      const tool = getAgentTool(name);
      if (!tool || tool.enabled === false) return false;
      if (want && String(meta.userId) !== want) return false;
      return true;
    })
    .map(([name]) => name);
}

export function resolveMcpAgentTool(agentToolName: string) {
  return toolIndex.get(agentToolName) || null;
}

export function installMcpAgentBridge(): void {
  mcpManager.setAgentBridge({
    registerServerTools,
    unregisterServerTools,
  });
}
