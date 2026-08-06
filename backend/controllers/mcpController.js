import {
  mcpManager,
  mcpPermissionManager,
} from "../mcp/init.js";

/** Authenticated user from requireAuth — never trust client identity. */
function resolveUser(req) {
  if (!req.user?._id) {
    const err = new Error("Authentication required");
    err.status = 401;
    throw err;
  }
  return { _id: req.user._id, id: req.user.id, email: req.user.email, name: req.user.name };
}

function badRequest(res, error) {
  return res.status(400).json({ error });
}

export const listServers = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const servers = await mcpManager.listServers(String(user._id));
    res.json({ servers });
  } catch (err) {
    console.error("[mcp]", err);
    res.status(500).json({ error: err.message || "Unable to list MCP servers" });
  }
};

export const getServer = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const server = await mcpManager.getServer(String(user._id), req.params.id);
    res.json({ server });
  } catch (err) {
    const status = err.message === "MCP server not found" ? 404 : 500;
    res.status(status).json({ error: err.message || "Unable to load MCP server" });
  }
};

export const addServer = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const body = req.body || {};
    if (!body.name || !body.transport) {
      return badRequest(res, "name and transport are required");
    }
    const server = await mcpManager.addServer(String(user._id), body);
    res.status(201).json({ server });
  } catch (err) {
    console.error("[mcp]", err);
    res.status(400).json({ error: err.message || "Unable to add MCP server" });
  }
};

export const updateServer = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const server = await mcpManager.updateServer(
      String(user._id),
      req.params.id,
      req.body || {}
    );
    res.json({ server });
  } catch (err) {
    const status = err.message === "MCP server not found" ? 404 : 400;
    res.status(status).json({ error: err.message || "Unable to update MCP server" });
  }
};

export const removeServer = async (req, res) => {
  try {
    const user = await resolveUser(req);
    await mcpManager.removeServer(String(user._id), req.params.id);
    res.json({ ok: true });
  } catch (err) {
    const status = err.message === "MCP server not found" ? 404 : 500;
    res.status(status).json({ error: err.message || "Unable to remove MCP server" });
  }
};

export const connectServer = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const status = await mcpManager.connect(String(user._id), req.params.id);
    res.json({ status });
  } catch (err) {
    res.status(400).json({ error: err.message || "Unable to connect" });
  }
};

export const disconnectServer = async (req, res) => {
  try {
    const user = await resolveUser(req);
    await mcpManager.disconnect(String(user._id), req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message || "Unable to disconnect" });
  }
};

export const testServer = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const result = await mcpManager.testConnection(String(user._id), req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message || "Connection test failed" });
  }
};

export const testTransport = async (req, res) => {
  try {
    const { transport, timeoutMs } = req.body || {};
    if (!transport) return badRequest(res, "transport is required");
    const result = await mcpManager.testTransport(transport, timeoutMs);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message || "Transport test failed" });
  }
};

export const listTools = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const tools = await mcpManager.listTools(String(user._id), req.params.id);
    res.json({ tools });
  } catch (err) {
    res.status(400).json({ error: err.message || "Unable to list tools" });
  }
};

export const listResources = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const resources = await mcpManager.listResources(String(user._id), req.params.id);
    res.json({ resources });
  } catch (err) {
    res.status(400).json({ error: err.message || "Unable to list resources" });
  }
};

export const listPrompts = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const prompts = await mcpManager.listPrompts(String(user._id), req.params.id);
    res.json({ prompts });
  } catch (err) {
    res.status(400).json({ error: err.message || "Unable to list prompts" });
  }
};

export const callTool = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const { toolName, arguments: args } = req.body || {};
    if (!toolName) return badRequest(res, "toolName is required");
    // Never accept client-controlled skipPermission — always enforce grants.
    const result = await mcpManager.callTool(
      String(user._id),
      req.params.id,
      toolName,
      args || {},
      { skipPermission: false }
    );
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message || "Tool call failed" });
  }
};

export const readResource = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const uri = req.body?.uri || req.query?.uri;
    if (!uri) return badRequest(res, "uri is required");
    const result = await mcpManager.readResource(
      String(user._id),
      req.params.id,
      String(uri)
    );
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message || "Resource read failed" });
  }
};

export const health = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const healthStatus = await mcpManager.healthCheck(
      String(user._id),
      req.params.id
    );
    res.json({ health: healthStatus });
  } catch (err) {
    res.status(400).json({ error: err.message || "Health check failed" });
  }
};

export const discoverTools = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const tools = await mcpManager.discoverTools(String(user._id));
    res.json({ tools });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unable to discover tools" });
  }
};

export const listPermissions = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const permissions = await mcpPermissionManager.listPermissions(String(user._id));
    res.json({ permissions });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unable to list permissions" });
  }
};

export const getPermission = async (req, res) => {
  try {
    const user = await resolveUser(req);
    await mcpManager.getServer(String(user._id), req.params.id);
    const permission = await mcpPermissionManager.getPermission(
      String(user._id),
      req.params.id
    );
    res.json({ permission });
  } catch (err) {
    const status = err.message === "MCP server not found" ? 404 : 500;
    res.status(status).json({ error: err.message || "Unable to load permission" });
  }
};

export const grantPermission = async (req, res) => {
  try {
    const user = await resolveUser(req);
    // Ensure the server belongs to the caller before recording grants.
    await mcpManager.getServer(String(user._id), req.params.id);
    const { trustServer, toolName } = req.body || {};
    const permission = await mcpPermissionManager.grant(
      String(user._id),
      req.params.id,
      { trustServer: Boolean(trustServer), toolName }
    );
    res.json({ permission });
  } catch (err) {
    const status = err.message === "MCP server not found" ? 404 : 400;
    res.status(status).json({ error: err.message || "Unable to grant permission" });
  }
};

export const revokePermission = async (req, res) => {
  try {
    const user = await resolveUser(req);
    await mcpManager.getServer(String(user._id), req.params.id);
    const { toolName, untrust } = req.body || {};
    if (toolName) {
      const permission = await mcpPermissionManager.denyTool(
        String(user._id),
        req.params.id,
        toolName
      );
      return res.json({ permission });
    }
    if (untrust) {
      const permission = await mcpPermissionManager.trustServer(
        String(user._id),
        req.params.id,
        false
      );
      return res.json({ permission });
    }
    await mcpPermissionManager.revokeAll(String(user._id), req.params.id);
    res.json({ ok: true });
  } catch (err) {
    const status = err.message === "MCP server not found" ? 404 : 400;
    res.status(status).json({ error: err.message || "Unable to revoke permission" });
  }
};
