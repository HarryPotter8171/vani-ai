/**
 * VANI Tool Registry
 *
 * Every tool exposes: id, name, description, schema, execute()
 * The registry is the single source of truth for model-callable tools.
 *
 * Optional gating fields:
 *   feature — FeatureKey checked via FeatureGate before execute
 *   quotaMetric — UsageMetric reserved/checked before execute
 */

import { featureGate } from "../billing/FeatureGate.ts";
import { recordBillingUsage } from "../middleware/usageTracking.js";
import { recordToolAnalytics } from "../middleware/analyticsLogging.js";

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
 * @property {string} [feature]
 * @property {string} [quotaMetric]
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

    const userId = ctx.userId || ctx.user?._id || ctx.user?.id || null;
    if (tool.feature || tool.quotaMetric) {
      if (tool.feature) {
        const access = await featureGate.checkAccess(
          userId ? String(userId) : null,
          tool.feature,
          1
        );
        if (!access.ok) {
          return {
            ok: false,
            error: access.message,
            code: access.code,
            requiredPlan: access.requiredPlan || null,
            upgradeHint: access.upgradeHint || null,
          };
        }
      } else if (tool.quotaMetric) {
        const quota = await featureGate.checkQuota(
          userId ? String(userId) : null,
          tool.quotaMetric,
          1
        );
        if (!quota.ok) {
          return {
            ok: false,
            error: quota.message,
            code: quota.code,
            requiredPlan: quota.requiredPlan || null,
            upgradeHint: quota.upgradeHint || null,
          };
        }
      }
    }

    const result = await tool.execute(args || {}, ctx);
    const normalized =
      result && typeof result === "object" && "ok" in result
        ? result
        : { ok: true, data: result };

    // Record image / metered tool usage after successful execution.
    if (
      normalized.ok &&
      userId &&
      tool.quotaMetric &&
      (tool.quotaMetric === "image_generation" ||
        tool.quotaMetric === "browser_sessions" ||
        tool.quotaMetric === "code_executions")
    ) {
      void recordBillingUsage(String(userId), tool.quotaMetric, 1, {
        tool: name,
      }).catch(() => undefined);
    }

    void recordToolAnalytics({
      userId: userId ? String(userId) : null,
      tool: name,
      category: tool.quotaMetric || "tool",
    }).catch(() => undefined);

    return normalized;
  } catch (err) {
    console.error(`[tool:${name}]`, err);
    return {
      ok: false,
      error: err?.message || "Tool execution failed",
      code: err?.code || null,
    };
  }
}

export function clearRegistry() {
  toolsByName.clear();
}
