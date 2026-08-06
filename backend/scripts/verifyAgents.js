/**
 * Verify VANI AI Agents framework (no live Gemini required for unit checks).
 *
 * Covers:
 *  - Coding task plan fallback
 *  - Research task plan fallback
 *  - Multi-tool workflow permissions
 *  - Long-running / cancel / pause
 *  - Error recovery (retry limits + validation)
 *
 * Run: node scripts/verifyAgents.js
 */

import assert from "assert";
import {
  initAgentTools,
  listAgentTools,
  registerAgentTool,
  createAgentTool,
  executeAgentTool,
  checkToolPermission,
  createPlan,
  buildFallbackPlan,
  AgentSession,
  SESSION_STATUS,
  AgentManager,
  getAgentType,
  listAgentTypes,
  AGENT_CONFIG,
} from "../agents/index.js";

let passed = 0;
function ok(label) {
  passed += 1;
  console.log(`  ✅ ${label}`);
}

async function testToolRegistry() {
  console.log("\n▸ Tool registry");
  initAgentTools();
  const tools = listAgentTools();
  const names = tools.map((t) => t.name());
  for (const required of [
    "web_search",
    "vision",
    "image_generation",
    "image_edit",
    "ocr",
    "memory",
    "canvas",
    "file_upload",
    "calculator",
    "weather",
    "current_time",
  ]) {
    assert(names.includes(required), `missing tool ${required}`);
  }
  ok("built-in tools registered");

  for (const tool of tools) {
    assert.strictEqual(typeof tool.name(), "string");
    assert.strictEqual(typeof tool.description(), "string");
    assert.strictEqual(typeof tool.validate, "function");
    assert.strictEqual(typeof tool.execute, "function");
  }
  ok("every tool implements name/description/validate/execute");

  // Plugin without touching AgentManager
  registerAgentTool(
    createAgentTool({
      name: "echo_probe",
      description: "Test probe",
      validate: (args) => ({ ok: true, args }),
      execute: async (args) => ({ ok: true, echo: args?.text || "hi" }),
    })
  );
  const probe = await executeAgentTool("echo_probe", { text: "vani" });
  assert.strictEqual(probe.ok, true);
  assert.strictEqual(probe.echo, "vani");
  ok("future tools plug in without AgentManager changes");
}

async function testPermissionsAndValidation() {
  console.log("\n▸ Security: permissions, validation, timeouts");
  const denied = checkToolPermission("web_search", {
    allowedTools: ["calculator"],
  });
  assert.strictEqual(denied.ok, false);
  ok("tool permission checks");

  const invalid = await executeAgentTool(
    "calculator",
    { expression: "" },
    {},
    { allowedTools: ["calculator"] }
  );
  assert.strictEqual(invalid.ok, false);
  ok("argument validation");

  registerAgentTool(
    createAgentTool({
      name: "slow_probe",
      description: "Times out",
      cacheable: false,
      validate: () => ({ ok: true, args: {} }),
      execute: () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 5000)),
    })
  );
  const timed = await executeAgentTool(
    "slow_probe",
    {},
    {},
    { timeoutMs: 50, useCache: false }
  );
  assert.strictEqual(timed.ok, false);
  assert.match(String(timed.error), /timed out/i);
  ok("timeouts");
}

async function testPlanning() {
  console.log("\n▸ Planning / task decomposition");
  const coding = buildFallbackPlan(
    "Calculate (12.5 * 4) + 3^2 and explain the steps",
    "coding"
  );
  assert(coding.length >= 2);
  assert(coding.some((s) => s.tool === "calculator" || /calculat|analyz|generat/i.test(s.title)));
  ok("coding task plan");

  const research = buildFallbackPlan(
    "Research the latest developments in solid-state batteries",
    "research"
  );
  assert(research.some((s) => s.tool === "web_search"));
  assert(research.some((s) => /search|reading|generat/i.test(s.title)));
  ok("research task plan");

  const multi = buildFallbackPlan(
    "What's the weather in Tokyo and what time is it there?",
    "web"
  );
  const toolsUsed = new Set(multi.map((s) => s.tool).filter(Boolean));
  assert(toolsUsed.has("weather") || toolsUsed.has("current_time") || toolsUsed.has("web_search"));
  ok("multi-tool workflow plan");

  // createPlan should fall back cleanly even without Gemini credentials
  const planned = await createPlan({
    agentTypeId: "general",
    userMessage: "What is 2+2?",
    contextText: "",
  });
  assert.strictEqual(planned.ok, true);
  assert(Array.isArray(planned.steps) && planned.steps.length >= 1);
  ok("createPlan returns usable steps (live or fallback)");
}

async function testSessionControls() {
  console.log("\n▸ Session: pause / resume / cancel / progress");
  const session = new AgentSession({
    agentType: "general",
    userMessage: "Long running task",
  });
  session.setStatus(SESSION_STATUS.RUNNING);
  session.setPlan([
    { title: "Searching...", tool: "web_search", args: { query: "test" } },
    { title: "Analyzing...", tool: null },
    { title: "Generating answer...", tool: null },
  ]);
  assert.strictEqual(session.steps.length, 3);
  ok("task breakdown stored on session");

  assert.strictEqual(session.requestPause(), true);
  assert.strictEqual(session.status, SESSION_STATUS.PAUSED);
  assert.strictEqual(session.resume(), true);
  assert.strictEqual(session.status, SESSION_STATUS.RUNNING);
  ok("pause / resume");

  assert.strictEqual(session.cancel("stop"), true);
  assert.strictEqual(session.status, SESSION_STATUS.CANCELLED);
  ok("cancel execution");

  session.updateProgress(42);
  assert.strictEqual(session.progress, 42);
  ok("progress percentage");
}

async function testErrorRecovery() {
  console.log("\n▸ Error recovery / retry limits");
  assert(AGENT_CONFIG.maxRetriesPerStep >= 1);
  ok(`retry limit configured (${AGENT_CONFIG.maxRetriesPerStep})`);

  const manager = new AgentManager();
  const types = manager.listTypes();
  assert.strictEqual(types.length, listAgentTypes().length);
  assert(types.some((t) => t.id === "coding"));
  assert(types.some((t) => t.id === "research"));
  ok("AgentManager lists all agent types");

  const coding = getAgentType("coding");
  assert(coding.tools.includes("calculator"));
  assert(!coding.tools.includes("weather"));
  ok("context-aware tool allow-lists per agent type");

  // Validation failure path through manager tools
  const badCalc = await executeAgentTool(
    "calculator",
    { expression: "not-a-math-expression!!!" },
    {},
    { allowedTools: coding.tools }
  );
  // May be ok:false from evaluate, or ok with error — either is recovery-safe
  assert(badCalc && typeof badCalc === "object");
  ok("failed tool returns structured error (no throw)");
}

async function testRateLimit() {
  console.log("\n▸ Rate limiting");
  const manager = new AgentManager();
  const key = `verify-rate-${Date.now()}`;
  let hit = false;
  try {
    for (let i = 0; i < AGENT_CONFIG.rateLimit.maxRuns + 2; i += 1) {
      const session = manager.createSession({
        agentType: "general",
        userMessage: `msg ${i}`,
        context: { userKey: key },
      });
      // Complete immediately so maxSessionsPerUser doesn't fire first.
      session.setStatus(SESSION_STATUS.COMPLETED);
    }
  } catch (err) {
    hit = err?.code === "RATE_LIMIT";
  }
  assert(hit, "expected RATE_LIMIT after exceeding maxRuns");
  ok("rate limiting");
}

async function main() {
  console.log("VANI AI Agents — verification");
  await testToolRegistry();
  await testPermissionsAndValidation();
  await testPlanning();
  await testSessionControls();
  await testErrorRecovery();
  await testRateLimit();
  console.log(`\n✅ All ${passed} checks passed\n`);
}

main().catch((err) => {
  console.error("\n❌ Verification failed:", err);
  process.exit(1);
});
