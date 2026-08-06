/**
 * Verify VANI MCP client against the built-in Echo MCP server.
 * Also documents how to connect Filesystem / Git / Memory MCP servers.
 *
 * Usage: node scripts/verifyMcp.js
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { MCPClient } from "../mcp/MCPClient.ts";
import { mcpPermissionManager } from "../mcp/MCPPermissionManager.ts";
import { sanitizeAgentToolName, validateServerInput } from "../mcp/MCPRegistry.ts";
import {
  installMcpAgentBridge,
  listRegisteredMcpAgentTools,
} from "../mcp/bridge.ts";
import { mcpManager } from "../mcp/MCPManager.ts";
import { initAgentTools, listAgentTools, executeAgentTool } from "../agents/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const echoServerPath = path.resolve(__dirname, "../mcp/servers/echoServer.js");

// Verification script is local-only; production refuses stdio entirely.
if (process.env.NODE_ENV !== "production") {
  process.env.MCP_ALLOW_STDIO = process.env.MCP_ALLOW_STDIO || "true";
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log("→ Initializing agent tools + MCP bridge…");
  initAgentTools();
  installMcpAgentBridge();

  const transport = {
    type: "stdio",
    command: process.execPath,
    args: [echoServerPath],
  };

  console.log("→ Validating transport config…");
  validateServerInput({
    name: "Echo",
    transport,
  });

  console.log("→ Connecting Echo MCP via MCPClient…");
  const client = new MCPClient("echo-verify", transport, { timeoutMs: 15_000 });
  await client.connect();

  const tools = await client.listTools({ force: true });
  console.log(
    `  tools: ${tools.map((t) => t.name).join(", ") || "(none)"}`
  );
  assert(tools.some((t) => t.name === "echo"), "Expected echo tool");
  assert(tools.some((t) => t.name === "ping"), "Expected ping tool");

  const resources = await client.listResources({ force: true });
  assert(
    resources.some((r) => r.uri === "echo://last"),
    "Expected echo://last resource"
  );

  const ping = await client.callTool("ping", {});
  assert(ping.ok, `ping failed: ${ping.error}`);
  console.log("  ping ok");

  const echoed = await client.callTool("echo", { message: "hello-vani-mcp" });
  assert(echoed.ok, `echo failed: ${echoed.error}`);
  console.log("  echo ok");

  const resource = await client.readResource("echo://last");
  assert(resource.ok, `readResource failed: ${resource.error}`);
  console.log("  resource ok");

  const health = await client.ping();
  assert(health.ok, `health ping failed: ${health.error}`);
  console.log(`  health ${health.latencyMs}ms`);

  await client.disconnect();

  console.log("→ Session + permission + agent bridge…");
  // Seed manager with an in-memory server so agent execute uses the real path.
  const userId = "000000000000000000000001";
  let persistSeq = 0;
  mcpManager.setPersistHooks({
    async listServers() {
      return [];
    },
    async saveServer(config) {
      if (config.id.startsWith("tmp_")) {
        persistSeq += 1;
        return { ...config, id: `echo-session-${persistSeq}` };
      }
      return config;
    },
    async deleteServer() {
      return true;
    },
  });

  const added = await mcpManager.addServer(userId, {
    name: "Echo",
    transport,
    connectNow: true,
    autoReconnect: false,
    maxReconnectAttempts: 0,
  });

  const agentNames = listRegisteredMcpAgentTools(userId);
  console.log(`  agent tools: ${agentNames.join(", ") || "(none)"}`);
  assert(agentNames.length >= 2, "Expected MCP tools in agent registry");

  const agentToolName = sanitizeAgentToolName("Echo", "echo", added.id);
  assert(
    listAgentTools().some((t) => t.name() === agentToolName),
    `Agent registry missing ${agentToolName}`
  );
  assert(
    agentNames.includes(agentToolName),
    `listRegisteredMcpAgentTools missing ${agentToolName}`
  );

  // Permission gate should block until granted
  const denied = await mcpPermissionManager.checkToolPermission(
    userId,
    added.id,
    "echo"
  );
  assert(!denied.allowed, "Expected permission denial before grant");

  await mcpPermissionManager.trustServer(userId, added.id, true);
  const allowed = await mcpPermissionManager.checkToolPermission(
    userId,
    added.id,
    "echo"
  );
  assert(allowed.allowed, "Expected permission allow after trust");

  const exec = await executeAgentTool(
    agentToolName,
    { message: "agent-path" },
    { userId }
  );
  assert(exec.ok, `agent execute failed: ${exec.error}`);
  console.log("  agent execute: ok");

  // Error recovery — disconnect then callTool should reconnect on demand.
  console.log("→ Error recovery (reconnect on demand)…");
  await mcpManager.disconnect(userId, added.id);
  const recovered = await mcpManager.callTool(userId, added.id, "ping", {});
  assert(recovered.ok, `reconnect-on-demand failed: ${recovered.error}`);
  console.log("  reconnect-on-demand ok");

  // Multi-server: second Echo under a different name should get a distinct agent tool.
  console.log("→ Multiple servers…");
  const second = await mcpManager.addServer(userId, {
    name: "Echo Two",
    transport,
    connectNow: true,
    autoReconnect: false,
    maxReconnectAttempts: 0,
  });
  const namesAfter = listRegisteredMcpAgentTools(userId);
  assert(namesAfter.length >= 4, "Expected tools from two MCP servers");
  const nameA = sanitizeAgentToolName("Echo", "echo", added.id);
  const nameB = sanitizeAgentToolName("Echo Two", "echo", second.id);
  assert(nameA !== nameB, "Agent tool names must be unique across servers");
  assert(namesAfter.includes(nameA) && namesAfter.includes(nameB), "Both servers registered");
  console.log("  multi-server ok");

  await mcpManager.removeServer(userId, second.id);
  await mcpPermissionManager.revokeAll(userId, second.id);
  await mcpManager.removeServer(userId, added.id);
  await mcpPermissionManager.revokeAll(userId, added.id);

  console.log("\n✅ MCP verification passed (Echo server)");
  console.log(`
Suggested production servers (Settings → MCP → Add):

  Filesystem:
    transport: stdio
    command: npx
    args: -y @modelcontextprotocol/server-filesystem <allowed-dir>

  Git:
    transport: stdio
    command: npx
    args: -y @modelcontextprotocol/server-git --repository <repo-path>

  Memory:
    transport: stdio
    command: npx
    args: -y @modelcontextprotocol/server-memory

  Echo (this repo):
    transport: stdio
    command: node
    args: ${echoServerPath}
`);
}

main().catch((err) => {
  console.error("\n❌ MCP verification failed:", err);
  process.exit(1);
});
