import { browserManager } from "../../browser/init.js";

const ACTIONS = [
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
];

/**
 * Model-callable browser automation tool.
 * Never bypasses BrowserPermissions — user must approve site access.
 */
export const browserAutomationTool = {
  id: "browser_automation",
  name: "browser_automation",
  displayName: "Browser Automation",
  feature: "browser",
  quotaMetric: "browser_sessions",
  description:
    "Automate a real browser (Chromium/Firefox/WebKit): open pages, click, fill forms, type, upload/download, screenshot, extract content, scroll, switch tabs, and handle dialogs. Requires user approval before acting on a site. Never use for purchases, payments, or deleting user data without explicit confirmation.",
  future: false,
  enabled: process.env.VANI_ENABLE_BROWSER_AUTOMATION === "true",
  schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ACTIONS,
        description:
          "Single action, or 'run' to execute a multi-step goal/steps plan",
      },
      goal: {
        type: "string",
        description: "Natural-language goal for a multi-step run (preferred with action=run)",
      },
      url: {
        type: "string",
        description: "Target URL",
      },
      selector: {
        type: "string",
        description: "CSS selector for the target element",
      },
      value: {
        type: "string",
        description: "Text/value for fill, type, select, wait duration, scroll direction, etc.",
      },
      filePath: {
        type: "string",
        description: "Absolute server path for file upload",
      },
      steps: {
        type: "array",
        description: "Explicit ordered browser steps for action=run",
        items: {
          type: "object",
          properties: {
            action: { type: "string" },
            url: { type: "string" },
            selector: { type: "string" },
            value: { type: "string" },
            filePath: { type: "string" },
            label: { type: "string" },
            timeoutMs: { type: "number" },
          },
          required: ["action"],
          additionalProperties: false,
        },
      },
      engine: {
        type: "string",
        enum: ["chromium", "firefox", "webkit"],
        description: "Browser engine (default chromium)",
      },
      mode: {
        type: "string",
        enum: ["isolated", "persistent", "private"],
        description: "Session isolation mode",
      },
      persistCookies: {
        type: "boolean",
        description: "Persist cookies when mode=persistent",
      },
      instruction: {
        type: "string",
        description: "Legacy alias for goal",
      },
    },
    required: ["action"],
    additionalProperties: false,
  },

  async execute(args = {}, ctx = {}) {
    if (process.env.VANI_ENABLE_BROWSER_AUTOMATION !== "true") {
      return {
        ok: false,
        error:
          "Browser automation is disabled. Set VANI_ENABLE_BROWSER_AUTOMATION=true to enable.",
      };
    }

    const userId = ctx.userId || ctx.user?._id || ctx.user?.id;
    if (!userId) {
      return {
        ok: false,
        error: "Browser automation requires an authenticated user context",
      };
    }

    const action = String(args.action || "run").toLowerCase();
    const goal =
      (typeof args.goal === "string" && args.goal.trim()) ||
      (typeof args.instruction === "string" && args.instruction.trim()) ||
      undefined;

    /** @type {import('../../browser/types.ts').BrowserActionInput[]} */
    let steps = Array.isArray(args.steps) ? args.steps : undefined;

    if (action !== "run") {
      steps = [
        {
          action,
          url: args.url,
          selector: args.selector,
          value: args.value,
          filePath: args.filePath,
          label: args.label,
        },
      ];
    } else if (!steps?.length && args.url && !goal) {
      steps = [{ action: "open", url: args.url }];
    }

    try {
      const result = await browserManager.runAutomation({
        userId: String(userId),
        goal: goal || (args.url ? `Open ${args.url}` : undefined),
        url: args.url,
        steps,
        engine: args.engine,
        mode: args.mode,
        persistCookies: args.persistCookies,
        headless: true,
        // Tools block until the user resolves the Browser Panel approval.
        approvalTimeoutMs: Number(process.env.VANI_BROWSER_APPROVAL_TIMEOUT_MS) || 120_000,
      });

      if (!result.ok) {
        return {
          ok: false,
          runId: result.runId,
          needsApproval: Boolean(result.needsApproval),
          approval: result.approval || null,
          error: result.error || "Browser automation failed",
          snapshot: summarizeSnapshot(result.snapshot),
        };
      }

      return {
        ok: true,
        runId: result.runId,
        url: result.report?.url || result.snapshot?.currentUrl,
        title: result.report?.title || null,
        extract: result.report?.extract || null,
        verification: result.report?.verification || null,
        timeline: (result.snapshot?.timeline || []).slice(-12),
        screenshotCount: result.snapshot?.screenshots?.length || 0,
        latestScreenshotId: result.snapshot?.latestScreenshotId || null,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

function summarizeSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    runId: snapshot.runId,
    status: snapshot.status,
    goal: snapshot.goal,
    currentUrl: snapshot.currentUrl,
    timeline: (snapshot.timeline || []).slice(-8),
    pendingApproval: snapshot.pendingApproval,
    error: snapshot.error,
  };
}
