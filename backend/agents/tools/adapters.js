/**
 * Adapters that wrap existing VANI model tools into the agent tool interface:
 * name() / description() / validate() / execute()
 */

import { createAgentTool } from "../ToolRegistry.js";
import { executeTool, getTool, initTools } from "../../tools/index.js";

initTools();

/**
 * Map agent-facing tool names → existing registry tool names.
 */
export const LEGACY_TOOL_MAP = {
  web_search: "web_search",
  vision: "vision_analyze",
  image_generation: "image_generation",
  image_edit: "image_edit",
  ocr: "ocr",
  memory: "memory",
  calculator: "calculator",
  weather: "weather",
  current_time: "current_datetime",
  file_upload: "file_reader",
  browser_automation: "browser_automation",
  code_execution: "code_execution",
};

function requireString(value, field, { min = 1, max = 2000 } = {}) {
  const s = typeof value === "string" ? value.trim() : "";
  if (s.length < min) return { ok: false, error: `${field} is required` };
  if (s.length > max) return { ok: false, error: `${field} is too long` };
  return { ok: true, value: s };
}

function wrapLegacyTool({
  agentName,
  legacyName,
  displayName,
  description,
  validate,
  cacheable = true,
  enabled,
}) {
  const legacy = getTool(legacyName);
  return createAgentTool({
    name: agentName,
    displayName: displayName || legacy?.displayName || agentName,
    description: description || legacy?.description || agentName,
    schema: legacy?.schema || null,
    cacheable,
    enabled: enabled ?? legacy?.enabled !== false,
    validate,
    async execute(args, ctx) {
      return executeTool(legacyName, args, ctx);
    },
  });
}

export const webSearchAgentTool = wrapLegacyTool({
  agentName: "web_search",
  legacyName: "web_search",
  displayName: "Web Search",
  description:
    "Search the live web for up-to-date information, news, docs, and facts.",
  validate(args = {}) {
    const q = requireString(args.query ?? args.q, "query", { max: 500 });
    if (!q.ok) return q;
    return { ok: true, args: { query: q.value } };
  },
});

export const visionAgentTool = wrapLegacyTool({
  agentName: "vision",
  legacyName: "vision_analyze",
  displayName: "Vision",
  description:
    "Analyze attached images — charts, documents, screenshots, handwriting, and scenes.",
  cacheable: false,
  validate(args = {}, ctx = {}) {
    const hasImages =
      (Array.isArray(ctx.attachments) &&
        ctx.attachments.some(
          (a) => a?.kind === "image" || String(a?.mimeType || "").startsWith("image/")
        )) ||
      (Array.isArray(ctx.contents) &&
        ctx.contents.some((c) =>
          (c.parts || []).some((p) =>
            String(p?.inlineData?.mimeType || "").startsWith("image/")
          )
        ));

    if (!hasImages && !args.imageBase64) {
      return {
        ok: false,
        error: "Vision requires an attached image",
      };
    }

    const prompt =
      typeof args.prompt === "string" && args.prompt.trim()
        ? args.prompt.trim().slice(0, 2000)
        : "Analyze this image in detail.";

    return {
      ok: true,
      args: {
        prompt,
        ...(args.imageBase64 ? { imageBase64: args.imageBase64 } : {}),
        ...(args.mimeType ? { mimeType: args.mimeType } : {}),
      },
    };
  },
});

export const imageGenerationAgentTool = wrapLegacyTool({
  agentName: "image_generation",
  legacyName: "image_generation",
  displayName: "Image Generation",
  description:
    "Generate an image from a text prompt. Call immediately for create/draw/generate/illustrate requests — do not explain capabilities.",
  cacheable: false,
  validate(args = {}) {
    const prompt = requireString(args.prompt ?? args.description, "prompt", {
      max: 2000,
    });
    if (!prompt.ok) return prompt;
    return {
      ok: true,
      args: {
        prompt: prompt.value,
        ...(args.aspectRatio ? { aspectRatio: args.aspectRatio } : {}),
      },
    };
  },
});

export const ocrAgentTool = wrapLegacyTool({
  agentName: "ocr",
  legacyName: "ocr",
  displayName: "OCR",
  description:
    "Extract plain text, tables, and handwriting (best effort) from an attached JPG/JPEG/PNG/WEBP image or PDF, including mixed Hindi + English. Call immediately for read/OCR/transcribe/extract-text/summarize-scanned-doc requests.",
  cacheable: false,
  validate(args = {}, ctx = {}) {
    const pools = [
      ...(Array.isArray(ctx.attachments) ? ctx.attachments : []),
      ...(Array.isArray(ctx.conversationAttachments)
        ? ctx.conversationAttachments
        : []),
    ];
    const hasOcrable =
      pools.some((a) => {
        if (!a) return false;
        const mime = String(a.mimeType || "").toLowerCase();
        const kind = String(a.kind || "").toLowerCase();
        const name = String(a.name || "");
        return (
          kind === "pdf" ||
          mime === "application/pdf" ||
          /\.pdf$/i.test(name) ||
          kind === "image" ||
          mime.startsWith("image/") ||
          /\.(jpe?g|png|webp)$/i.test(name)
        );
      }) ||
      (Array.isArray(ctx.contents) &&
        ctx.contents.some((c) =>
          (c.parts || []).some((p) => {
            const mime = String(p?.inlineData?.mimeType || "");
            return mime.startsWith("image/") || mime === "application/pdf";
          })
        )) ||
      Boolean(args.fileId);

    if (!hasOcrable) {
      return {
        ok: false,
        error: "OCR requires an attached image (JPG/PNG/WEBP) or PDF",
      };
    }

    let fileId =
      typeof args.fileId === "string" && args.fileId.trim()
        ? args.fileId.trim()
        : null;
    if (!fileId) {
      for (let i = pools.length - 1; i >= 0; i -= 1) {
        const id = pools[i]?.fileId || pools[i]?.id;
        if (typeof id === "string" && id.trim()) {
          fileId = id.trim();
          break;
        }
      }
    }

    return {
      ok: true,
      args: {
        ...(fileId ? { fileId } : {}),
        ...(typeof args.focus === "string" && args.focus.trim()
          ? { focus: args.focus.trim().slice(0, 500) }
          : {}),
        ...(typeof args.language === "string" && args.language.trim()
          ? { language: args.language.trim().slice(0, 40) }
          : {}),
      },
    };
  },
});

export const imageEditAgentTool = wrapLegacyTool({
  agentName: "image_edit",
  legacyName: "image_edit",
  displayName: "✏️ Editing image",
  description:
    "Edit an attached source image in place (not generate a new one). Call immediately for add/remove/replace/change/recolor/erase/crop/expand/edit requests on an uploaded image. Preserve camera angle, people, objects, perspective, lighting, and composition — only modify the requested region. Never refuse or offer a new generation instead.",
  cacheable: false,
  validate(args = {}, ctx = {}) {
    const pools = [
      ...(Array.isArray(ctx.attachments) ? ctx.attachments : []),
      ...(Array.isArray(ctx.conversationAttachments)
        ? ctx.conversationAttachments
        : []),
    ];
    const hasImages =
      pools.some(
        (a) =>
          a?.kind === "image" ||
          String(a?.mimeType || "").startsWith("image/") ||
          a?.fileId ||
          a?.dataBase64
      ) ||
      (Array.isArray(ctx.contents) &&
        ctx.contents.some((c) =>
          (c.parts || []).some((p) =>
            String(p?.inlineData?.mimeType || "").startsWith("image/")
          )
        )) ||
      Boolean(args.imageFileId);

    if (!hasImages) {
      return { ok: false, error: "Image editing requires an attached image" };
    }

    const instruction = requireString(
      args.instruction ?? args.prompt ?? args.description,
      "instruction",
      { max: 2000 }
    );
    if (!instruction.ok) return instruction;

    let imageFileId =
      typeof args.imageFileId === "string" && args.imageFileId.trim()
        ? args.imageFileId.trim()
        : null;
    if (!imageFileId) {
      for (let i = pools.length - 1; i >= 0; i -= 1) {
        const id = pools[i]?.fileId || pools[i]?.id;
        if (typeof id === "string" && id.trim()) {
          imageFileId = id.trim();
          break;
        }
      }
    }

    return {
      ok: true,
      args: {
        instruction: instruction.value,
        ...(imageFileId ? { imageFileId } : {}),
        ...(args.imageIndex != null ? { imageIndex: args.imageIndex } : {}),
        ...(args.aspectRatio ? { aspectRatio: args.aspectRatio } : {}),
      },
    };
  },
});

export const memoryAgentTool = wrapLegacyTool({
  agentName: "memory",
  legacyName: "memory",
  displayName: "Memory",
  description:
    "Save, recall, list, or forget durable user preferences and facts.",
  cacheable: false,
  validate(args = {}) {
    const action = String(args.action || "recall").toLowerCase();
    const allowed = new Set(["save", "recall", "list", "delete", "forget"]);
    if (!allowed.has(action)) {
      return { ok: false, error: `Invalid memory action: ${action}` };
    }
    if (action === "save") {
      const key = requireString(args.key, "key", { max: 120 });
      if (!key.ok) return key;
      const value = requireString(args.value, "value", { max: 4000 });
      if (!value.ok) return value;
      return {
        ok: true,
        args: {
          action,
          key: key.value,
          value: value.value,
          category: args.category,
        },
      };
    }
    return { ok: true, args: { ...args, action } };
  },
});

export const calculatorAgentTool = wrapLegacyTool({
  agentName: "calculator",
  legacyName: "calculator",
  displayName: "Calculator",
  description: "Evaluate precise arithmetic expressions safely.",
  validate(args = {}) {
    const expression = requireString(args.expression, "expression", {
      max: 200,
    });
    if (!expression.ok) return expression;
    return { ok: true, args: { expression: expression.value } };
  },
});

export const weatherAgentTool = wrapLegacyTool({
  agentName: "weather",
  legacyName: "weather",
  displayName: "Weather",
  description: "Get current weather for a city or place.",
  validate(args = {}) {
    const location = requireString(
      args.location ?? args.city ?? args.place,
      "location",
      { max: 120 }
    );
    if (!location.ok) return location;
    return { ok: true, args: { location: location.value } };
  },
});

export const currentTimeAgentTool = wrapLegacyTool({
  agentName: "current_time",
  legacyName: "current_datetime",
  displayName: "Current Time",
  description: "Get the current date and time for any IANA timezone.",
  validate(args = {}) {
    const timezone =
      typeof args.timezone === "string" && args.timezone.trim()
        ? args.timezone.trim()
        : "Asia/Kolkata";
    if (timezone.length > 80) {
      return { ok: false, error: "timezone is too long" };
    }
    return { ok: true, args: { timezone } };
  },
});

export const fileUploadAgentTool = wrapLegacyTool({
  agentName: "file_upload",
  legacyName: "file_reader",
  displayName: "File Upload",
  description:
    "Read and inspect uploaded files (PDF, documents, spreadsheets, text). For large/chunked exams, keep reading with offsets until every requested question is answered — never ask the user to specify one question.",
  cacheable: false,
  validate(args = {}, ctx = {}) {
    const hasFiles =
      (Array.isArray(ctx.attachments) && ctx.attachments.length > 0) ||
      Boolean(args.fileId) ||
      Boolean(args.path);

    if (!hasFiles) {
      return {
        ok: false,
        error: "File upload tool requires an attached or referenced file",
      };
    }

    return {
      ok: true,
      args: {
        filename: args.filename || args.name,
        instruction:
          typeof args.instruction === "string"
            ? args.instruction.slice(0, 500)
            : typeof args.query === "string"
              ? args.query.slice(0, 500)
              : undefined,
      },
    };
  },
});

const BROWSER_ACTIONS = new Set([
  "open",
  "navigate",
  "click",
  "fill",
  "type",
  "upload",
  "download",
  "screenshot",
  "extract",
  "wait",
  "scroll",
  "switch_tab",
  "handle_dialog",
  "press",
  "hover",
  "select",
  "run",
]);

export const codeExecutionAgentTool = wrapLegacyTool({
  agentName: "code_execution",
  legacyName: "code_execution",
  displayName: "Code Interpreter",
  description:
    "Run Python in a secure sandbox for data analysis, charts, CSV/XLSX/PDF work, and numerical computing. Variables persist across calls in the same session.",
  cacheable: false,
  enabled: process.env.VANI_ENABLE_CODE_EXECUTION === "true",
  validate(args = {}) {
    const code =
      typeof args.code === "string"
        ? args.code
        : typeof args.source === "string"
          ? args.source
          : "";
    if (!code.trim()) {
      return { ok: false, error: "code is required" };
    }
    if (code.length > 100_000) {
      return { ok: false, error: "code is too long" };
    }
    return {
      ok: true,
      args: {
        language: "python",
        code,
        sessionId: args.sessionId,
        timeoutMs: args.timeoutMs,
        publishCanvas: Boolean(args.publishCanvas),
      },
    };
  },
});

export const browserAutomationAgentTool = wrapLegacyTool({
  agentName: "browser_automation",
  legacyName: "browser_automation",
  displayName: "Browser Automation",
  description:
    "Control a real browser with user permission: open sites, click, fill forms, type, upload/download, screenshot, and read page content. Never purchase, pay, or delete data without explicit confirmation.",
  cacheable: false,
  enabled: process.env.VANI_ENABLE_BROWSER_AUTOMATION === "true",
  validate(args = {}) {
    const action = String(args.action || "run").toLowerCase();
    if (!BROWSER_ACTIONS.has(action)) {
      return { ok: false, error: `Invalid browser action: ${action}` };
    }

    if (action === "run") {
      const hasPlan =
        (typeof args.goal === "string" && args.goal.trim()) ||
        (typeof args.instruction === "string" && args.instruction.trim()) ||
        (typeof args.url === "string" && args.url.trim()) ||
        (Array.isArray(args.steps) && args.steps.length > 0);
      if (!hasPlan) {
        return {
          ok: false,
          error: "browser_automation run requires goal, url, or steps",
        };
      }
    } else if (
      ["open", "navigate"].includes(action) &&
      !(typeof args.url === "string" && args.url.trim())
    ) {
      return { ok: false, error: "url is required for open/navigate" };
    }

    return {
      ok: true,
      args: {
        action,
        goal: args.goal || args.instruction,
        url: args.url,
        selector: args.selector,
        value: args.value,
        filePath: args.filePath,
        steps: args.steps,
        engine: args.engine,
        mode: args.mode,
        persistCookies: args.persistCookies,
        instruction: args.instruction,
      },
    };
  },
});
