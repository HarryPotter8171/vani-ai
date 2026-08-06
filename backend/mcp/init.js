import {
  mcpManager,
  mcpPermissionManager,
  installMcpAgentBridge,
} from "./index.ts";
import {
  listServers,
  saveServer,
  deleteServer,
  createMongoPermissionStore,
} from "./persist.js";

let initialized = false;

/**
 * Wire persistence, agent bridge, and health monitoring.
 * Safe to call multiple times.
 */
export function initMcp() {
  if (initialized) return mcpManager;

  mcpManager.setPersistHooks({
    listServers,
    saveServer,
    deleteServer,
  });
  mcpPermissionManager.setStore(createMongoPermissionStore());
  installMcpAgentBridge();
  mcpManager.startHealthMonitor(60_000);

  initialized = true;
  console.log("✅ MCP client ready");
  return mcpManager;
}

export { mcpManager, mcpPermissionManager };
