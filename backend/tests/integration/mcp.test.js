import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { createAuthedUser } from "../helpers/auth.js";
import { subscriptionService } from "../../billing/SubscriptionService.ts";

const { getTestApp } = await import("../helpers/testApp.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const echoServerPath = path.resolve(__dirname, "../../mcp/servers/echoServer.js");

// Real end-to-end MCP integration: spawns the repo's built-in stdio Echo MCP
// server (same one used by `scripts/verifyMcp.js`) as a child process rather
// than mocking the MCP client, so connect/list/call/permission plumbing is
// exercised exactly as in production.
const echoTransport = {
  type: "stdio",
  command: process.execPath,
  args: [echoServerPath],
};

let app;

beforeAll(() => {
  app = getTestApp();
});

/** MCP is Pro+ gated on all /api/mcp routes. */
async function proUser(overrides = {}) {
  const authed = await createAuthedUser(overrides);
  await subscriptionService.changePlan(String(authed.user._id), "pro");
  return authed;
}

/**
 * Wrap supertest with this authed user's Authorization + a unique synthetic
 * IP, so per-IP write rate limits (mcpWriteLimit etc.) don't leak between
 * unrelated virtual users sharing one test process/file.
 */
function client({ authHeader, ip }) {
  const withHeaders = (req) => req.set("Authorization", authHeader).set("X-Forwarded-For", ip);
  return {
    get: (url) => withHeaders(request(app).get(url)),
    post: (url) => withHeaders(request(app).post(url)),
    patch: (url) => withHeaders(request(app).patch(url)),
    delete: (url) => withHeaders(request(app).delete(url)),
  };
}

async function addEchoServer(authed, overrides = {}) {
  return client(authed)
    .post("/api/mcp/servers")
    .send({
      name: "Echo",
      transport: echoTransport,
      connectNow: false,
      autoReconnect: false,
      maxReconnectAttempts: 0,
      ...overrides,
    });
}

describe("MCP: auth gate", () => {
  it("requires auth", async () => {
    const res = await request(app).get("/api/mcp/servers");
    expect(res.status).toBe(401);
  });

  it("rejects Free-plan users (Pro+ required)", async () => {
    const { authHeader } = await createAuthedUser();
    const res = await request(app)
      .get("/api/mcp/servers")
      .set("Authorization", authHeader);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PLAN_REQUIRED");
  });
});

describe("MCP: server CRUD", () => {
  it("rejects a server with no name/transport", async () => {
    const authed = await proUser();
    const res = await client(authed).post("/api/mcp/servers").send({});
    expect(res.status).toBe(400);
  });

  it("adds a server without auto-connecting", async () => {
    const authed = await proUser();
    const res = await addEchoServer(authed);
    expect(res.status).toBe(201);
    expect(res.body.server.name).toBe("Echo");
    expect(res.body.server.status).toBe("disconnected");
  });

  it("lists only the caller's own servers", async () => {
    const alice = await proUser();
    const bob = await proUser();
    await addEchoServer(alice, { name: "Alice's Echo" });
    await addEchoServer(bob, { name: "Bob's Echo" });

    const res = await client(alice).get("/api/mcp/servers");
    expect(res.status).toBe(200);
    expect(res.body.servers).toHaveLength(1);
    expect(res.body.servers[0].name).toBe("Alice's Echo");
  });

  it("supports multiple servers for one user", async () => {
    const authed = await proUser();
    await addEchoServer(authed, { name: "Echo A" });
    await addEchoServer(authed, { name: "Echo B" });

    const res = await client(authed).get("/api/mcp/servers");
    expect(res.status).toBe(200);
    expect(res.body.servers).toHaveLength(2);
    expect(res.body.servers.map((s) => s.name).sort()).toEqual(["Echo A", "Echo B"]);
  });

  it("404s getting/updating/removing another user's server (IDOR)", async () => {
    const owner = await proUser();
    const attacker = await proUser();
    const created = await addEchoServer(owner);
    const serverId = created.body.server.id;

    const get = await client(attacker).get(`/api/mcp/servers/${serverId}`);
    expect(get.status).toBe(404);

    const patch = await client(attacker).patch(`/api/mcp/servers/${serverId}`).send({ name: "Hacked" });
    expect(patch.status).toBe(404);

    const del = await client(attacker).delete(`/api/mcp/servers/${serverId}`);
    expect(del.status).toBe(404);
  });

  it("updates a server's name", async () => {
    const authed = await proUser();
    const created = await addEchoServer(authed);
    const res = await client(authed)
      .patch(`/api/mcp/servers/${created.body.server.id}`)
      .send({ name: "Renamed Echo" });
    expect(res.status).toBe(200);
    expect(res.body.server.name).toBe("Renamed Echo");
  });

  it("removes a server", async () => {
    const authed = await proUser();
    const created = await addEchoServer(authed);
    const res = await client(authed).delete(`/api/mcp/servers/${created.body.server.id}`);
    expect(res.status).toBe(200);

    const listed = await client(authed).get("/api/mcp/servers");
    expect(listed.body.servers).toHaveLength(0);
  });
});

describe("MCP: live connection to the Echo server", () => {
  it("connects and reports connected status", async () => {
    const authed = await proUser();
    const created = await addEchoServer(authed);

    const res = await client(authed).post(`/api/mcp/servers/${created.body.server.id}/connect`);

    expect(res.status).toBe(200);
    expect(res.body.status.status).toBe("connected");

    await client(authed).post(`/api/mcp/servers/${created.body.server.id}/disconnect`);
  });

  it("lists the echo/ping tools and echo://last resource", async () => {
    const authed = await proUser();
    const created = await addEchoServer(authed);
    await client(authed).post(`/api/mcp/servers/${created.body.server.id}/connect`);

    const tools = await client(authed).get(`/api/mcp/servers/${created.body.server.id}/tools`);
    expect(tools.status).toBe(200);
    expect(tools.body.tools.map((t) => t.name)).toEqual(expect.arrayContaining(["echo", "ping"]));
    expect(tools.body.tools.every((t) => typeof t.agentToolName === "string")).toBe(true);
    // Agent names include a server-id suffix to avoid multi-tenant collisions.
    expect(tools.body.tools[0].agentToolName).toMatch(/^mcp_/);
    expect(tools.body.tools[0].agentToolName).toContain(
      String(created.body.server.id).replace(/[^a-zA-Z0-9]/g, "").slice(-8).toLowerCase()
    );

    const resources = await client(authed).get(`/api/mcp/servers/${created.body.server.id}/resources`);
    expect(resources.body.resources.some((r) => r.uri === "echo://last")).toBe(true);

    await client(authed).post(`/api/mcp/servers/${created.body.server.id}/disconnect`);
  });

  it("reports healthy status once connected", async () => {
    const authed = await proUser();
    const created = await addEchoServer(authed);
    await client(authed).post(`/api/mcp/servers/${created.body.server.id}/connect`);

    const res = await client(authed).get(`/api/mcp/servers/${created.body.server.id}/health`);
    expect(res.status).toBe(200);
    expect(res.body.health.healthy).toBe(true);

    await client(authed).post(`/api/mcp/servers/${created.body.server.id}/disconnect`);
  }, 15_000);

  it("tests an ad-hoc transport without persisting a server", async () => {
    const authed = await proUser();
    const res = await client(authed).post("/api/mcp/test-transport").send({ transport: echoTransport });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.capabilities.tools.map((t) => t.name)).toEqual(expect.arrayContaining(["echo", "ping"]));
  }, 15_000);

  it("persists server config across list after disconnect (session reconnect on demand)", async () => {
    const authed = await proUser();
    const created = await addEchoServer(authed);
    const serverId = created.body.server.id;

    await client(authed).post(`/api/mcp/servers/${serverId}/connect`);
    await client(authed).post(`/api/mcp/servers/${serverId}/disconnect`);

    const listed = await client(authed).get("/api/mcp/servers");
    expect(listed.body.servers.some((s) => s.id === serverId)).toBe(true);

    // Call without an explicit reconnect — ensureConnected should reattach.
    await client(authed)
      .post(`/api/mcp/servers/${serverId}/permissions/grant`)
      .send({ trustServer: true });
    const call = await client(authed)
      .post(`/api/mcp/servers/${serverId}/tools/call`)
      .send({ toolName: "ping" });
    expect(call.body.ok).toBe(true);

    await client(authed).post(`/api/mcp/servers/${serverId}/disconnect`);
  }, 20_000);
});

describe("MCP: tool permission gating", () => {
  it("denies a tool call before any permission is granted", async () => {
    const authed = await proUser();
    const created = await addEchoServer(authed);
    await client(authed).post(`/api/mcp/servers/${created.body.server.id}/connect`);

    const res = await client(authed)
      .post(`/api/mcp/servers/${created.body.server.id}/tools/call`)
      .send({ toolName: "echo", arguments: { message: "should be blocked" } });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/permission required/i);

    await client(authed).post(`/api/mcp/servers/${created.body.server.id}/disconnect`);
  });

  it("allows a tool call after granting trust", async () => {
    const authed = await proUser();
    const created = await addEchoServer(authed);
    await client(authed).post(`/api/mcp/servers/${created.body.server.id}/connect`);

    await client(authed)
      .post(`/api/mcp/servers/${created.body.server.id}/permissions/grant`)
      .send({ trustServer: true });

    const res = await client(authed)
      .post(`/api/mcp/servers/${created.body.server.id}/tools/call`)
      .send({ toolName: "echo", arguments: { message: "hello from test" } });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.content?.[0]?.text).toBe("hello from test");

    const resource = await client(authed)
      .post(`/api/mcp/servers/${created.body.server.id}/resources/read`)
      .send({ uri: "echo://last" });
    expect(resource.body.ok).toBe(true);
    expect(resource.body.contents?.[0]?.text).toBe("hello from test");

    await client(authed).post(`/api/mcp/servers/${created.body.server.id}/disconnect`);
  });

  it("allows a single tool via per-tool grant without trusting the whole server", async () => {
    const authed = await proUser();
    const created = await addEchoServer(authed);
    await client(authed).post(`/api/mcp/servers/${created.body.server.id}/connect`);

    await client(authed)
      .post(`/api/mcp/servers/${created.body.server.id}/permissions/grant`)
      .send({ toolName: "ping" });

    const allowed = await client(authed)
      .post(`/api/mcp/servers/${created.body.server.id}/tools/call`)
      .send({ toolName: "ping" });
    expect(allowed.body.ok).toBe(true);

    const stillBlocked = await client(authed)
      .post(`/api/mcp/servers/${created.body.server.id}/tools/call`)
      .send({ toolName: "echo", arguments: { message: "nope" } });
    expect(stillBlocked.body.ok).toBe(false);

    await client(authed).post(`/api/mcp/servers/${created.body.server.id}/disconnect`);
  });

  it("re-blocks a tool after it is explicitly denied", async () => {
    const authed = await proUser();
    const created = await addEchoServer(authed);
    await client(authed).post(`/api/mcp/servers/${created.body.server.id}/connect`);
    await client(authed)
      .post(`/api/mcp/servers/${created.body.server.id}/permissions/grant`)
      .send({ trustServer: true });

    await client(authed)
      .post(`/api/mcp/servers/${created.body.server.id}/permissions/revoke`)
      .send({ toolName: "echo" });

    const denied = await client(authed)
      .post(`/api/mcp/servers/${created.body.server.id}/tools/call`)
      .send({ toolName: "echo", arguments: { message: "denied now" } });
    expect(denied.body.ok).toBe(false);

    // ping is still trusted — only "echo" was explicitly denied.
    const stillAllowed = await client(authed)
      .post(`/api/mcp/servers/${created.body.server.id}/tools/call`)
      .send({ toolName: "ping" });
    expect(stillAllowed.body.ok).toBe(true);

    await client(authed).post(`/api/mcp/servers/${created.body.server.id}/disconnect`);
  });

  it("client cannot bypass permission checks via a hidden skipPermission flag", async () => {
    const authed = await proUser();
    const created = await addEchoServer(authed);
    await client(authed).post(`/api/mcp/servers/${created.body.server.id}/connect`);

    const res = await client(authed)
      .post(`/api/mcp/servers/${created.body.server.id}/tools/call`)
      .send({ toolName: "echo", arguments: { message: "x" }, skipPermission: true });

    // Controller hard-codes { skipPermission: false } — client input is ignored.
    expect(res.body.ok).toBe(false);

    await client(authed).post(`/api/mcp/servers/${created.body.server.id}/disconnect`);
  });

  it("lists only the caller's own MCP permissions", async () => {
    const owner = await proUser();
    const attacker = await proUser();
    const created = await addEchoServer(owner);
    await client(owner)
      .post(`/api/mcp/servers/${created.body.server.id}/permissions/grant`)
      .send({ trustServer: true });

    const attackerPerms = await client(attacker).get("/api/mcp/permissions");
    expect(attackerPerms.body.permissions).toHaveLength(0);

    const ownerPerms = await client(owner).get("/api/mcp/permissions");
    expect(ownerPerms.body.permissions.length).toBeGreaterThan(0);
  });

  it("404s permission grant on another user's server", async () => {
    const owner = await proUser();
    const attacker = await proUser();
    const created = await addEchoServer(owner);

    const res = await client(attacker)
      .post(`/api/mcp/servers/${created.body.server.id}/permissions/grant`)
      .send({ trustServer: true });
    expect(res.status).toBe(404);
  });
});
