import { describe, it, expect, beforeEach } from "vitest";
import { MCPPermissionManager } from "../../../mcp/MCPPermissionManager.ts";

describe("mcp/MCPPermissionManager", () => {
  let manager;

  beforeEach(() => {
    manager = new MCPPermissionManager();
  });

  it("returns an untrusted default permission for a server never seen before", async () => {
    const perm = await manager.getPermission("user-1", "server-1");
    expect(perm).toMatchObject({
      userId: "user-1",
      serverId: "server-1",
      trusted: false,
      allowedTools: [],
      deniedTools: [],
    });
  });

  it("denies a tool call by default (not_permitted)", async () => {
    const decision = await manager.checkToolPermission("user-1", "server-1", "delete_file");
    expect(decision).toEqual({
      allowed: false,
      reason: "not_permitted",
      message: expect.stringContaining("delete_file"),
    });
  });

  it("trustServer allows every tool call on that server", async () => {
    await manager.trustServer("user-1", "server-1", true);
    const decision = await manager.checkToolPermission("user-1", "server-1", "anything");
    expect(decision).toEqual({ allowed: true, reason: "trusted" });
  });

  it("allowTool grants only that specific tool without trusting the whole server", async () => {
    await manager.allowTool("user-1", "server-1", "echo");
    const allowed = await manager.checkToolPermission("user-1", "server-1", "echo");
    const denied = await manager.checkToolPermission("user-1", "server-1", "delete_file");
    expect(allowed).toEqual({ allowed: true, reason: "allowed_tool" });
    expect(denied.allowed).toBe(false);
  });

  it("denyTool blocks a specific tool even on a trusted server", async () => {
    await manager.trustServer("user-1", "server-1", true);
    await manager.denyTool("user-1", "server-1", "dangerous_tool");
    const decision = await manager.checkToolPermission("user-1", "server-1", "dangerous_tool");
    expect(decision).toEqual({
      allowed: false,
      reason: "denied_tool",
      message: expect.stringContaining("dangerous_tool"),
    });
  });

  it("allowTool clears a prior deny for the same tool, and vice versa", async () => {
    await manager.denyTool("user-1", "server-1", "echo");
    let perm = await manager.getPermission("user-1", "server-1");
    expect(perm.deniedTools).toContain("echo");

    await manager.allowTool("user-1", "server-1", "echo");
    perm = await manager.getPermission("user-1", "server-1");
    expect(perm.deniedTools).not.toContain("echo");
    expect(perm.allowedTools).toContain("echo");
  });

  it("revokeAll removes all stored permissions for a user+server", async () => {
    await manager.trustServer("user-1", "server-1", true);
    await manager.revokeAll("user-1", "server-1");
    const perm = await manager.getPermission("user-1", "server-1");
    expect(perm.trusted).toBe(false);
  });

  it("isolates permissions per user for the same server", async () => {
    await manager.trustServer("user-1", "server-1", true);
    const otherUser = await manager.checkToolPermission("user-2", "server-1", "echo");
    expect(otherUser.allowed).toBe(false);
  });

  it("rejects checks with missing user or server", async () => {
    const decision = await manager.checkToolPermission("", "server-1", "echo");
    expect(decision).toEqual({
      allowed: false,
      reason: "unknown_server",
      message: expect.any(String),
    });
  });

  it("listPermissions only returns records for the requested user", async () => {
    await manager.trustServer("user-1", "server-a", true);
    await manager.trustServer("user-1", "server-b", true);
    await manager.trustServer("user-2", "server-a", true);

    const list = await manager.listPermissions("user-1");
    expect(list).toHaveLength(2);
    expect(list.every((p) => p.userId === "user-1")).toBe(true);
  });

  it("grant() dispatches to trustServer or allowTool based on options", async () => {
    await manager.grant("user-1", "server-1", { trustServer: true });
    expect((await manager.getPermission("user-1", "server-1")).trusted).toBe(true);

    await manager.grant("user-1", "server-2", { toolName: "echo" });
    expect((await manager.getPermission("user-1", "server-2")).allowedTools).toContain("echo");
  });

  it("grant() throws when neither trustServer nor toolName is given", async () => {
    await expect(manager.grant("user-1", "server-1", {})).rejects.toThrow();
  });

  it("allowTool / denyTool require a non-empty tool name", async () => {
    await expect(manager.allowTool("user-1", "server-1", "")).rejects.toThrow();
    await expect(manager.denyTool("user-1", "server-1", "  ")).rejects.toThrow();
  });

  it("can be backed by a custom store (e.g. Mongo-backed persistence)", async () => {
    const saved = [];
    const store = {
      async get(userId, serverId) {
        return saved.find((r) => r.userId === userId && r.serverId === serverId) || null;
      },
      async set(record) {
        const idx = saved.findIndex((r) => r.userId === record.userId && r.serverId === record.serverId);
        if (idx >= 0) saved[idx] = record;
        else saved.push(record);
        return record;
      },
      async list(userId) {
        return saved.filter((r) => r.userId === userId);
      },
      async remove(userId, serverId) {
        const idx = saved.findIndex((r) => r.userId === userId && r.serverId === serverId);
        if (idx < 0) return false;
        saved.splice(idx, 1);
        return true;
      },
    };
    manager.setStore(store);

    await manager.trustServer("user-1", "server-1", true);
    expect(saved).toHaveLength(1);
    expect(saved[0].trusted).toBe(true);
  });
});
