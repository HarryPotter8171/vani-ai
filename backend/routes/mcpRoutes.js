import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { usageGuard, usageGuardFeature } from "../middleware/usageGuard.js";
import {
  listServers,
  getServer,
  addServer,
  updateServer,
  removeServer,
  connectServer,
  disconnectServer,
  testServer,
  testTransport,
  listTools,
  listResources,
  listPrompts,
  callTool,
  readResource,
  health,
  discoverTools,
  listPermissions,
  getPermission,
  grantPermission,
  revokePermission,
} from "../controllers/mcpController.js";

const router = express.Router();

router.use(requireAuth);
router.use(usageGuardFeature("mcp"));

const mcpWriteLimit = createRateLimiter({
  windowMs: 60_000,
  max: 40,
  message: "Too many MCP configuration changes. Please try again shortly.",
});

const mcpExecLimit = createRateLimiter({
  windowMs: 60_000,
  max: 60,
  message: "Too many MCP tool calls. Please try again shortly.",
});

router.get("/servers", listServers);
router.get("/servers/:id", getServer);
router.post("/servers", mcpWriteLimit, addServer);
router.patch("/servers/:id", mcpWriteLimit, updateServer);
router.delete("/servers/:id", mcpWriteLimit, removeServer);

router.post("/servers/:id/connect", mcpWriteLimit, connectServer);
router.post("/servers/:id/disconnect", mcpWriteLimit, disconnectServer);
router.post("/servers/:id/test", mcpWriteLimit, testServer);
router.post("/test-transport", mcpWriteLimit, testTransport);

router.get("/servers/:id/tools", listTools);
router.get("/servers/:id/resources", listResources);
router.get("/servers/:id/prompts", listPrompts);
router.get("/servers/:id/health", health);

router.post(
  "/servers/:id/tools/call",
  usageGuard("mcp"),
  mcpExecLimit,
  callTool
);
router.post(
  "/servers/:id/resources/read",
  usageGuard("mcp"),
  mcpExecLimit,
  readResource
);

router.get("/tools", discoverTools);

router.get("/permissions", listPermissions);
router.get("/servers/:id/permissions", getPermission);
router.post("/servers/:id/permissions/grant", mcpWriteLimit, grantPermission);
router.post("/servers/:id/permissions/revoke", mcpWriteLimit, revokePermission);

export default router;
