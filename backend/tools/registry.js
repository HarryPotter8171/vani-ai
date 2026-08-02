/**
 * VANI Tool Registry
 *
 * Every tool exposes: id, name, description, schema, execute()
 * The registry is the single source of truth for model-callable tools.
 */

const toolsByName = new Map();

/**
 * @typedef {object} ToolContext
 * @property {string} [userId]
 * @property {string} [userEmail]
 * @property {string} [userName]
 * @property {object[]} [contents]
 * @property {object[]} [attachments]
 * @property {AbortSignal} [signal]
 */

/**
 * @typedef {object} ToolDefinition
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {object} schema - JSON Schema for parameters
 * @property {(args: object, ctx: ToolContext) => Promise<object>|object} execute
 * @property {boolean} [enabled=true]
 * @property {boolean} [future=false]
 * @property {string} [displayName]
 */

function assertTool(tool) {
  if (!tool || typeof tool !== "object") throw new Error("Tool must be an object");
  for (const key of ["id", "name", "description", "schema", "execute"]) {
    if (tool[key] == null) throw new Error(`Tool missing required field: ${key}`);
  }
  if (typeof tool.execute !== "function") {
    throw new Error(`Tool "${tool.name}" execute() must be a function`);
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tool.name)) {
    throw new Error(`Invalid tool name "${tool.name}"`);
  }
}

export function registerTool(tool) {
  assertTool(tool);
  const normalized = {
    enabled: true,
    future: false,
    displayName: tool.displayName || tool.name,
    ...tool,
  };
  toolsByName.set(normalized.name, normalized);
  return normalized;
}

export function getTool(name) {
  return toolsByName.get(name) || null;
}

export function listTools({ includeDisabled = false } = {}) {
  const all = [...toolsByName.values()];
  // `future` tools stay registered but are only model-callable when enabled.
  return includeDisabled ? all : all.filter((t) => t.enabled);
}

export function getFunctionDeclarations() {
  return listTools().map((tool) => ({
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: tool.schema,
  }));
}

/**
 * Execute a tool safely. Never throws to the model loop — returns { ok, ... }.
 */
export async function executeTool(name, args = {}, ctx = {}) {
  const tool = getTool(name);
  if (!tool) {
    return { ok: false, error: `Unknown tool: ${name}` };
  }
  if (!tool.enabled || tool.future) {
    return {
      ok: false,
      error: `Tool "${name}" is not available yet.`,
      future: !!tool.future,
    };
  }

  try {
    if (ctx.signal?.aborted) {
      return { ok: false, error: "Aborted" };
    }
    const result = await tool.execute(args || {}, ctx);
    if (result && typeof result === "object" && "ok" in result) return result;
    return { ok: true, data: result };
  } catch (err) {
    console.error(`[tool:${name}]`, err);
    return {
      ok: false,
      error: err?.message || "Tool execution failed",
    };
  }
}

export function clearRegistry() {
  toolsByName.clear();
}
