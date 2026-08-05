import {
  sessionManager,
  sandboxManager,
  publishPlotToCanvas,
} from "../../services/codeInterpreter/init.js";

export const codeExecutionTool = {
  id: "code_execution",
  name: "code_execution",
  displayName: "Code Interpreter",
  feature: "code_interpreter",
  quotaMetric: "code_executions",
  description:
    "Execute Python in a secure sandbox for data analysis, charts, CSV/XLSX/PDF processing, and numerical computing (pandas, numpy, matplotlib, openpyxl, reportlab). Variables persist across calls in the same session. Prefer for calculations on tabular data, generating plots, or transforming files.",
  future: false,
  enabled: process.env.VANI_ENABLE_CODE_EXECUTION === "true",
  schema: {
    type: "object",
    properties: {
      language: {
        type: "string",
        enum: ["python"],
        description: "Language to execute (Python only)",
      },
      code: {
        type: "string",
        description: "Python source code to run in the sandbox",
      },
      sessionId: {
        type: "string",
        description:
          "Optional existing Code Interpreter session id for notebook-style persistence",
      },
      timeoutMs: {
        type: "number",
        description: "Optional per-execution timeout in milliseconds",
      },
      publishCanvas: {
        type: "boolean",
        description:
          "When true and plots were generated, publish a Canvas draft with the latest chart",
      },
    },
    required: ["code"],
    additionalProperties: false,
  },
  async execute(args = {}, ctx = {}) {
    if (!sandboxManager.isEnabled()) {
      return {
        ok: false,
        error:
          "Code Interpreter is disabled. Set VANI_ENABLE_CODE_EXECUTION=true on the server.",
      };
    }

    const userId = ctx.userId ? String(ctx.userId) : null;
    if (!userId) {
      return { ok: false, error: "Authentication required for Code Interpreter" };
    }

    const language = String(args.language || "python").toLowerCase();
    if (language !== "python") {
      return {
        ok: false,
        error: "Only Python is supported in the Code Interpreter sandbox",
      };
    }

    const code = typeof args.code === "string" ? args.code : "";
    if (!code.trim()) {
      return { ok: false, error: "code is required" };
    }

    try {
      const { session, result } = await sessionManager.runPython(userId, code, {
        sessionId: args.sessionId || null,
        timeoutMs: typeof args.timeoutMs === "number" ? args.timeoutMs : undefined,
      });

      let canvasId = null;
      if (args.publishCanvas && result.plots?.length) {
        const plot = result.plots[result.plots.length - 1];
        const fileUrl = `/api/code/sessions/${session.sessionId}/files/${plot.fileId}`;
        const published = await publishPlotToCanvas({
          userId,
          chatId: ctx.chatId || null,
          title: "Code Interpreter Chart",
          plotMarkdown: `![chart](${fileUrl})\n\n\`\`\`\n${(result.stdout || "").slice(0, 2000)}\n\`\`\``,
        });
        if (published.ok) canvasId = published.canvasId;
      }

      return {
        ok: result.status === "completed",
        sessionId: session.sessionId,
        executionId: result.executionId,
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
        error: result.error,
        resultPreview: result.resultPreview,
        plots: result.plots.map((p) => ({
          id: p.id,
          fileId: p.fileId,
          path: p.path,
          mimeType: p.mimeType,
          downloadPath: `/api/code/sessions/${session.sessionId}/files/${p.fileId}`,
        })),
        files: result.files.map((f) => ({
          id: f.id,
          name: f.name,
          path: f.path,
          mimeType: f.mimeType,
          size: f.size,
          downloadPath: `/api/code/sessions/${session.sessionId}/files/${f.id}`,
        })),
        durationMs: result.durationMs,
        canvasId,
        note:
          "Sandbox has no network access. Uploaded files live under INPUTS/; write outputs to OUTPUTS/ or PLOTS/.",
      };
    } catch (err) {
      return {
        ok: false,
        error: err?.message || "Code execution failed",
      };
    }
  },
};
