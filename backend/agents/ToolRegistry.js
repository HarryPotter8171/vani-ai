/**
 * Plugin-based agent tool registry.
 *
 * Every tool implements: name(), description(), validate(), execute()
 * Future tools register without modifying AgentManager.
 */

import { AGENT_CONFIG } from "./config.js";

/** @type {Map<string, import('./types.js').AgentTool>} */
const toolsByName = new Map();

/** Simple TTL cache for idempotent tool results. */
const resultCache = new Map();

function cacheKey(name, args) {
  try {
    return `${name}:${JSON.stringify(args || {})}`;
  } catch {
    return null;
  }
}

function getCached(name, args) {
  const key = cacheKey(name, args);
  if (!key) return null;
  const hit = resultCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    resultCache.delete(key);
    return null;
  }
  return hit.value;
}

function setCached(name, args, value) {
  const key = cacheKey(name, args);
  if (!key) return;
  if (resultCache.size >= AGENT_CONFIG.cacheMaxEntries) {
    const first = resultCache.keys().next().value;
    if (first) resultCache.delete(first);
  }
  resultCache.set(key, {
    value,
    expiresAt: Date.now() + AGENT_CONFIG.cacheTtlMs,
  });
}

/**
 * Assert a tool exposes the required agent tool interface.
 * @param {object} tool
 */
export function assertAgentTool(tool) {
  if (!tool || typeof tool !== "object") {
    throw new Error("Agent tool must be an object");
  }
  for (const method of ["name", "description", "validate", "execute"]) {
    if (typeof tool[method] !== "function") {
      throw new Error(`Agent tool missing required method: ${method}()`);
    }
  }
  const name = tool.name();
  if (!name || typeof name !== "string" || !/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid agent tool name: ${name}`);
  }
}

/**
 * Register (or replace) a plugin tool.
 * @param {object} tool
 */
export function registerAgentTool(tool) {
  assertAgentTool(tool);
  toolsByName.set(tool.name(), tool);
  return tool;
}

export function getAgentTool(name) {
  return toolsByName.get(name) || null;
}

export function listAgentTools({ includeDisabled = false } = {}) {
  const all = [...toolsByName.values()];
  if (includeDisabled) return all;
  return all.filter((t) => t.enabled !== false);
}

export function hasAgentTool(name) {
  return toolsByName.has(name);
}

/**
 * Permission check — tool must be registered, enabled, and allowed for the agent.
 */
export function checkToolPermission(toolName, { allowedTools = null, permissions = null } = {}) {
  const tool = getAgentTool(toolName);
  if (!tool) {
    return { ok: false, error: `Unknown tool: ${toolName}` };
  }
  if (tool.enabled === false) {
    return { ok: false, error: `Tool "${toolName}" is disabled` };
  }
  if (Array.isArray(allowedTools) && !allowedTools.includes(toolName)) {
    return {
      ok: false,
      error: `Tool "${toolName}" is not permitted for this agent`,
    };
  }
  if (permissions && typeof permissions === "object") {
    if (permissions[toolName] === false) {
      return { ok: false, error: `Tool "${toolName}" denied by permissions` };
    }
  }
  return { ok: true, tool };
}

/**
 * Validate + execute a tool with timeout, permission checks, and optional cache.
 */
export async function executeAgentTool(
  toolName,
  args = {},
  ctx = {},
  { allowedTools = null, permissions = null, timeoutMs = AGENT_CONFIG.stepTimeoutMs, useCache = true } = {}
) {
  const permission = checkToolPermission(toolName, { allowedTools, permissions });
  if (!permission.ok) {
    return { ok: false, error: permission.error, tool: toolName };
  }

  const tool = permission.tool;

  let validation;
  try {
    validation = tool.validate(args || {}, ctx);
  } catch (err) {
    return {
      ok: false,
      error: err?.message || "Validation failed",
      tool: toolName,
    };
  }

  if (validation && validation.ok === false) {
    return {
      ok: false,
      error: validation.error || "Invalid tool arguments",
      tool: toolName,
    };
  }

  const normalizedArgs = validation?.args ?? args ?? {};

  if (useCache && tool.cacheable !== false) {
    const cached = getCached(toolName, normalizedArgs);
    if (cached) {
      return { ...cached, cached: true };
    }
  }

  if (ctx.signal?.aborted) {
    return { ok: false, error: "Aborted", tool: toolName };
  }

  const timeout = Number.isFinite(timeoutMs) ? timeoutMs : AGENT_CONFIG.stepTimeoutMs;

  try {
    const result = await Promise.race([
      Promise.resolve(tool.execute(normalizedArgs, ctx)),
      new Promise((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`Tool "${toolName}" timed out after ${timeout}ms`)),
          timeout
        );
        if (typeof timer.unref === "function") timer.unref();
      }),
    ]);

    const normalized =
      result && typeof result === "object" && "ok" in result
        ? result
        : { ok: true, data: result };

    if (useCache && tool.cacheable !== false && normalized.ok !== false) {
      setCached(toolName, normalizedArgs, normalized);
    }

    return { ...normalized, tool: toolName };
  } catch (err) {
    console.error(`[agent-tool:${toolName}]`, err);
    return {
      ok: false,
      error: err?.message || "Tool execution failed",
      tool: toolName,
    };
  }
}

export function clearAgentToolRegistry() {
  toolsByName.clear();
}

export function clearAgentToolCache() {
  resultCache.clear();
}

/**
 * Create a tool from a plain definition (plugin helper).
 */
export function createAgentTool({
  name,
  description,
  validate,
  execute,
  cacheable = true,
  enabled = true,
  displayName,
  schema = null,
}) {
  if (typeof name !== "string") throw new Error("createAgentTool requires name");
  if (typeof description !== "string") throw new Error("createAgentTool requires description");
  if (typeof execute !== "function") throw new Error("createAgentTool requires execute");

  return {
    enabled,
    cacheable,
    displayName: displayName || name,
    schema,
    name() {
      return name;
    },
    description() {
      return description;
    },
    validate(args, ctx) {
      if (typeof validate === "function") return validate(args, ctx);
      return { ok: true, args: args || {} };
    },
    execute(args, ctx) {
      return execute(args, ctx);
    },
  };
}
