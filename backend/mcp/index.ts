/**
 * VANI AI — Model Context Protocol (MCP) client architecture.
 *
 * mcp/
 * ├── MCPClient.ts
 * ├── MCPManager.ts
 * ├── MCPTransport.ts
 * ├── MCPRegistry.ts
 * ├── MCPPermissionManager.ts
 * └── MCPSession.ts
 */

export { MCPClient } from "./MCPClient.ts";
export { MCPManager, mcpManager } from "./MCPManager.ts";
export { MCPTransport, createMcpTransport } from "./MCPTransport.ts";
export {
  MCPRegistry,
  mcpRegistry,
  sanitizeAgentToolName,
  validateServerInput,
} from "./MCPRegistry.ts";
export {
  MCPPermissionManager,
  mcpPermissionManager,
} from "./MCPPermissionManager.ts";
export { MCPSession } from "./MCPSession.ts";
export {
  installMcpAgentBridge,
  listRegisteredMcpAgentTools,
  registerServerTools,
  unregisterServerTools,
  resolveMcpAgentTool,
} from "./bridge.ts";
export { mcpLog } from "./logger.ts";
export * from "./types.ts";
