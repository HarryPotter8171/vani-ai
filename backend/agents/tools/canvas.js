/**
 * Canvas agent tool — create / update canvas drafts for long-form agent output.
 * Plugs into the existing canvas service without modifying AgentManager.
 */

import { createAgentTool } from "../ToolRegistry.js";
import {
  createCanvas,
  updateCanvas,
  listCanvases,
  CanvasValidationError,
  CanvasConflictError,
  CanvasNotFoundError,
} from "../../services/canvas/index.js";

export const canvasAgentTool = createAgentTool({
  name: "canvas",
  displayName: "Canvas",
  description:
    "Create or update a Canvas document for long-form writing, code, or structured drafts tied to the chat.",
  cacheable: false,
  schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["create", "update", "list"],
        description: "Canvas operation",
      },
      title: { type: "string", description: "Canvas title" },
      content: { type: "string", description: "Canvas body content" },
      type: {
        type: "string",
        description: "Canvas type, e.g. markdown, code, document",
      },
      canvasId: { type: "string", description: "Existing canvas id for update" },
    },
    required: ["action"],
  },
  validate(args = {}, ctx = {}) {
    const action = String(args.action || "create").toLowerCase();
    if (!["create", "update", "list"].includes(action)) {
      return { ok: false, error: `Invalid canvas action: ${action}` };
    }
    if (!ctx.userId) {
      return { ok: false, error: "Canvas requires an authenticated user" };
    }
    if (action === "create") {
      const content = typeof args.content === "string" ? args.content : "";
      if (!content.trim()) {
        return { ok: false, error: "content is required to create a canvas" };
      }
      if (content.length > 200_000) {
        return { ok: false, error: "content is too large" };
      }
    }
    if (action === "update" && !args.canvasId) {
      return { ok: false, error: "canvasId is required for update" };
    }
    return {
      ok: true,
      args: {
        action,
        title: typeof args.title === "string" ? args.title.slice(0, 200) : undefined,
        content: typeof args.content === "string" ? args.content : undefined,
        type: typeof args.type === "string" ? args.type : undefined,
        canvasId: args.canvasId,
      },
    };
  },
  async execute(args, ctx) {
    try {
      if (args.action === "list") {
        const result = await listCanvases(ctx.userId, {
          chatId: ctx.chatId || undefined,
          limit: 20,
        });
        const items = result?.items || result || [];
        return {
          ok: true,
          canvases: (Array.isArray(items) ? items : []).map((c) => ({
            id: String(c._id || c.id),
            title: c.title,
            type: c.type,
            updatedAt: c.updatedAt,
          })),
        };
      }

      if (args.action === "update") {
        const updated = await updateCanvas(ctx.userId, args.canvasId, {
          title: args.title,
          content: args.content,
          type: args.type,
        }, { force: true, source: "agent" });
        return {
          ok: true,
          action: "update",
          canvasId: String(updated._id || updated.id || args.canvasId),
          title: updated.title,
          note: "Canvas updated. Tell the user the draft is ready in Canvas.",
        };
      }

      const created = await createCanvas(ctx.userId, {
        chatId: ctx.chatId || null,
        title: args.title || "Agent Draft",
        content: args.content,
        type: args.type || "markdown",
      });

      return {
        ok: true,
        action: "create",
        canvasId: String(created._id || created.id),
        title: created.title,
        note: "Canvas created. Tell the user the draft is ready in Canvas.",
      };
    } catch (err) {
      if (
        err instanceof CanvasValidationError ||
        err instanceof CanvasConflictError ||
        err instanceof CanvasNotFoundError
      ) {
        return { ok: false, error: err.message };
      }
      console.warn("[canvas-agent-tool]", err?.message);
      return {
        ok: false,
        error: err?.message || "Canvas operation failed",
      };
    }
  },
});
