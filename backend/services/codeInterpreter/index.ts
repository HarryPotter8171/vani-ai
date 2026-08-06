/**
 * VANI AI — Code Interpreter
 *
 * services/codeInterpreter/
 * ├── SandboxManager.ts
 * ├── PythonRunner.ts
 * ├── FileManager.ts
 * ├── SessionManager.ts
 * └── kernel/bootstrap.py
 */

export { SessionManager, sessionManager } from "./SessionManager.ts";
export { SandboxManager, sandboxManager } from "./SandboxManager.ts";
export { FileManager } from "./FileManager.ts";
export { PythonRunner } from "./PythonRunner.ts";
export { codeLog } from "./logger.ts";
export {
  isCodeInterpreterEnabled,
  getLimits,
  getPythonBinary,
  getWorkspaceRoot,
  SANDBOX_PACKAGES,
} from "./config.ts";
export * from "./types.ts";

/** Push a generated plot into Canvas as a markdown image reference when possible. */
export async function publishPlotToCanvas(opts: {
  userId: string;
  chatId?: string | null;
  title?: string;
  plotMarkdown: string;
}): Promise<{ ok: boolean; canvasId?: string; error?: string }> {
  try {
    const { createCanvas } = await import("../canvas/index.js");
    const doc = await createCanvas(opts.userId, {
      title: opts.title || "Code Interpreter Chart",
      content: opts.plotMarkdown,
      type: "markdown",
      chatId: opts.chatId || undefined,
    });
    return { ok: true, canvasId: String(doc.id || doc._id) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
