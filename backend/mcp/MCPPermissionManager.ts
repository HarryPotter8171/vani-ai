/**
 * MCPPermissionManager — trust servers, allow/deny tools, revoke.
 * Enforces permission checks before any MCP tool execution.
 */

import type { McpPermissionRecord } from "./types.ts";
import { mcpLog } from "./logger.ts";

export type PermissionDecision =
  | { allowed: true; reason: "trusted" | "allowed_tool" | "explicit_grant" }
  | { allowed: false; reason: "denied_tool" | "not_permitted" | "unknown_server"; message: string };

type Store = {
  get(userId: string, serverId: string): Promise<McpPermissionRecord | null>;
  set(record: McpPermissionRecord): Promise<McpPermissionRecord>;
  list(userId: string): Promise<McpPermissionRecord[]>;
  remove(userId: string, serverId: string): Promise<boolean>;
};

/** In-memory fallback when Mongo is unavailable (tests / early boot). */
class MemoryPermissionStore implements Store {
  private map = new Map<string, McpPermissionRecord>();

  private key(userId: string, serverId: string) {
    return `${userId}::${serverId}`;
  }

  async get(userId: string, serverId: string) {
    return this.map.get(this.key(userId, serverId)) || null;
  }

  async set(record: McpPermissionRecord) {
    const next = {
      ...record,
      allowedTools: [...new Set(record.allowedTools || [])],
      deniedTools: [...new Set(record.deniedTools || [])],
      updatedAt: new Date().toISOString(),
    };
    this.map.set(this.key(record.userId, record.serverId), next);
    return next;
  }

  async list(userId: string) {
    return [...this.map.values()].filter((r) => r.userId === userId);
  }

  async remove(userId: string, serverId: string) {
    return this.map.delete(this.key(userId, serverId));
  }
}

export class MCPPermissionManager {
  private store: Store;
  private memory = new MemoryPermissionStore();

  constructor(store?: Store) {
    this.store = store || this.memory;
  }

  setStore(store: Store): void {
    this.store = store;
  }

  async getPermission(
    userId: string,
    serverId: string
  ): Promise<McpPermissionRecord> {
    const existing = await this.store.get(userId, serverId);
    if (existing) return existing;
    return {
      userId,
      serverId,
      trusted: false,
      allowedTools: [],
      deniedTools: [],
    };
  }

  async listPermissions(userId: string): Promise<McpPermissionRecord[]> {
    return this.store.list(userId);
  }

  async trustServer(userId: string, serverId: string, trusted = true) {
    const current = await this.getPermission(userId, serverId);
    const next = await this.store.set({
      ...current,
      trusted,
    });
    mcpLog.info("permission", trusted ? "Server trusted" : "Server untrusted", {
      userId,
      serverId,
    });
    return next;
  }

  async allowTool(userId: string, serverId: string, toolName: string) {
    const name = String(toolName || "").trim();
    if (!name) throw new Error("Tool name is required");
    const current = await this.getPermission(userId, serverId);
    const allowedTools = [...new Set([...current.allowedTools, name])];
    const deniedTools = current.deniedTools.filter((t) => t !== name);
    return this.store.set({ ...current, allowedTools, deniedTools });
  }

  async denyTool(userId: string, serverId: string, toolName: string) {
    const name = String(toolName || "").trim();
    if (!name) throw new Error("Tool name is required");
    const current = await this.getPermission(userId, serverId);
    const deniedTools = [...new Set([...current.deniedTools, name])];
    const allowedTools = current.allowedTools.filter((t) => t !== name);
    return this.store.set({ ...current, allowedTools, deniedTools });
  }

  async revokeAll(userId: string, serverId: string) {
    await this.store.remove(userId, serverId);
    mcpLog.info("permission", "Permissions revoked", { userId, serverId });
    return true;
  }

  /**
   * Decide whether a tool call may proceed.
   * Trusted servers always pass (unless tool is explicitly denied).
   */
  async checkToolPermission(
    userId: string,
    serverId: string,
    toolName: string
  ): Promise<PermissionDecision> {
    if (!userId || !serverId) {
      return {
        allowed: false,
        reason: "unknown_server",
        message: "Missing user or server for permission check",
      };
    }

    const name = String(toolName || "").trim();
    const perm = await this.getPermission(userId, serverId);

    if (perm.deniedTools.includes(name)) {
      return {
        allowed: false,
        reason: "denied_tool",
        message: `Tool "${name}" is denied for this MCP server`,
      };
    }

    if (perm.trusted) {
      return { allowed: true, reason: "trusted" };
    }

    if (perm.allowedTools.includes(name)) {
      return { allowed: true, reason: "allowed_tool" };
    }

    return {
      allowed: false,
      reason: "not_permitted",
      message: `Permission required to run MCP tool "${name}". Approve it in Settings → MCP.`,
    };
  }

  /**
   * Interactive grant used by Settings "Allow once / Always allow".
   */
  async grant(
    userId: string,
    serverId: string,
    options: { trustServer?: boolean; toolName?: string } = {}
  ) {
    if (options.trustServer) {
      return this.trustServer(userId, serverId, true);
    }
    if (options.toolName) {
      return this.allowTool(userId, serverId, options.toolName);
    }
    throw new Error("Specify trustServer or toolName to grant permission");
  }
}

export const mcpPermissionManager = new MCPPermissionManager();

export default MCPPermissionManager;
