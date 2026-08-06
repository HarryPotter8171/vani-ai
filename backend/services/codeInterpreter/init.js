import {
  sessionManager,
  sandboxManager,
  codeLog,
  publishPlotToCanvas,
  isCodeInterpreterEnabled,
} from "./index.ts";

let initialized = false;

/**
 * Wire cleanup monitor for Code Interpreter sessions.
 * Safe to call multiple times.
 */
export function initCodeInterpreter() {
  if (initialized) return sessionManager;

  sessionManager.startCleanupMonitor(60_000);
  initialized = true;

  if (isCodeInterpreterEnabled()) {
    console.log("✅ Code Interpreter ready");
  } else {
    console.log(
      "ℹ️  Code Interpreter registered (disabled — set VANI_ENABLE_CODE_EXECUTION=true)"
    );
  }

  return sessionManager;
}

export {
  sessionManager,
  sandboxManager,
  codeLog,
  publishPlotToCanvas,
  isCodeInterpreterEnabled,
};
