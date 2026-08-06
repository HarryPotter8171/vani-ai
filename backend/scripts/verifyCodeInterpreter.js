/**
 * Quick verification that Code Interpreter modules load and (optionally) run.
 * Run: node scripts/verifyCodeInterpreter.js
 */
import { initCodeInterpreter, sandboxManager, sessionManager } from "../services/codeInterpreter/init.js";

initCodeInterpreter();

const health = await sandboxManager.checkHealth(true);
console.log("Health:", JSON.stringify(health, null, 2));

if (!health.enabled) {
  console.log("ℹ️  Feature flag off — structural verify OK.");
  process.exit(0);
}

if (!health.pythonAvailable) {
  console.error("✖ Python not available");
  process.exit(1);
}

const userId = "verify_user";
const session = await sessionManager.createSession(userId);
const result = await sessionManager.execute(session.sessionId, userId, {
  code: "print(1+1)\n2+2",
});
console.log("Result:", {
  status: result.status,
  stdout: result.stdout.trim(),
  preview: result.resultPreview,
  error: result.error,
});
await sessionManager.destroySession(session.sessionId, userId);

if (result.status !== "completed" || !String(result.stdout).includes("2")) {
  console.error("✖ Execution smoke failed");
  process.exit(1);
}

console.log("✅ Code Interpreter verify passed");
process.exit(0);
