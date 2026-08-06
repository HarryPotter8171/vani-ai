/**
 * Executor — runs planned steps with retries, parallel tool calls, and verification.
 */

import { CHAT_MODEL, getGeminiClient } from "../services/geminiClient.js";
import { IMAGE_EDIT_SUCCESS_CAPTION } from "../services/image/index.js";
import { imageEditUnavailableMessage } from "../services/imageToolIntent.js";
import { VANI_IDENTITY_LOCK } from "../services/identity.js";
import {
  sanitizeIdentityResponse,
  forcedIdentityReply,
  createIdentityStreamGuard,
} from "../services/identity/IdentityGuard.js";
import { AGENT_CONFIG, getAgentType } from "./config.js";
import { executeAgentTool, getAgentTool } from "./ToolRegistry.js";
import { SESSION_STATUS } from "./AgentSession.js";

function groupSteps(steps) {
  /** @type {Array<Array<number>>} */
  const groups = [];
  let i = 0;
  while (i < steps.length) {
    const step = steps[i];
    if (step.parallelGroup != null) {
      const group = [i];
      let j = i + 1;
      while (
        j < steps.length &&
        steps[j].parallelGroup === step.parallelGroup
      ) {
        group.push(j);
        j += 1;
      }
      groups.push(group);
      i = j;
    } else {
      groups.push([i]);
      i += 1;
    }
  }
  return groups;
}

async function runSingleStep(session, index, toolContext) {
  const step = session.steps[index];
  if (!step) return { ok: false, error: "Missing step" };

  if (!(await session.waitIfPaused()) || session.isCancelled) {
    return { ok: false, error: "Cancelled", cancelled: true };
  }

  session.markStepStart(index);

  // Synthesis / analysis steps without tools — record intent only.
  if (!step.tool) {
    session.markStepDone(index, {
      ok: true,
      note: "Analysis / synthesis step",
      description: step.description,
    });
    return { ok: true, result: step.result };
  }

  const tool = getAgentTool(step.tool);
  const displayName = tool?.displayName || step.tool;

  session.pushTimeline({
    kind: "tool_start",
    stepId: step.id,
    label: displayName,
    tool: step.tool,
  });
  session.emit({
    type: "tool_start",
    stepId: step.id,
    name: step.tool,
    displayName,
    progress: session.progress,
  });

  let lastError = "Tool failed";
  const maxAttempts = 1 + AGENT_CONFIG.maxRetriesPerStep;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (session.isCancelled) {
      return { ok: false, error: "Cancelled", cancelled: true };
    }
    if (!(await session.waitIfPaused())) {
      return { ok: false, error: "Cancelled", cancelled: true };
    }

    step.retries = attempt - 1;

    const result = await executeAgentTool(step.tool, step.args || {}, toolContext, {
      allowedTools: session.allowedTools,
      permissions: session.context?.permissions || null,
      timeoutMs: AGENT_CONFIG.stepTimeoutMs,
      useCache: attempt === 1,
    });

    if (result?.ok !== false) {
      session.pushTimeline({
        kind: "tool_done",
        stepId: step.id,
        label: displayName,
        tool: step.tool,
        ok: true,
        detail: attempt > 1 ? `Succeeded on retry ${attempt - 1}` : undefined,
      });
      session.emit({
        type: "tool_done",
        stepId: step.id,
        name: step.tool,
        displayName,
        ok: true,
        progress: session.progress,
      });
      if (
        (step.tool === "image_generation" || step.tool === "image_edit") &&
        (result?.imageBase64 || result?.fileId || result?.imageUrl)
      ) {
        session.emit({
          type: "image",
          mimeType: result.mimeType || "image/png",
          ...(result.fileId ? { fileId: result.fileId } : {}),
          ...(result.imageUrl ? { imageUrl: result.imageUrl } : {}),
          ...(result.size ? { size: result.size } : {}),
          ...(!result.fileId && result.imageBase64
            ? { dataBase64: result.imageBase64 }
            : {}),
          prompt: result.prompt || result.instruction,
        });
      }
      session.markStepDone(index, result);
      return { ok: true, result };
    }

    lastError = result?.error || lastError;
    if (attempt < maxAttempts) {
      session.pushTimeline({
        kind: "retry",
        stepId: step.id,
        label: `Retrying ${displayName}...`,
        tool: step.tool,
        detail: lastError,
      });
      session.emit({
        type: "retry",
        stepId: step.id,
        name: step.tool,
        attempt,
        error: lastError,
        progress: session.progress,
      });
    }
  }

  session.pushTimeline({
    kind: "tool_done",
    stepId: step.id,
    label: displayName,
    tool: step.tool,
    ok: false,
    detail: lastError,
  });
  session.emit({
    type: "tool_done",
    stepId: step.id,
    name: step.tool,
    displayName,
    ok: false,
    error: lastError,
    progress: session.progress,
  });
  session.markStepFailed(index, lastError);
  return { ok: false, error: lastError };
}

/**
 * Execute all planned steps, supporting parallel groups.
 */
export async function executePlan(session, toolContext = {}) {
  session.setStatus(SESSION_STATUS.RUNNING);

  const groups = groupSteps(session.steps);

  for (const indices of groups) {
    if (session.isCancelled) {
      return { ok: false, cancelled: true };
    }
    if (!(await session.waitIfPaused())) {
      return { ok: false, cancelled: true };
    }

    if (indices.length === 1) {
      const outcome = await runSingleStep(session, indices[0], toolContext);
      if (outcome.cancelled) return { ok: false, cancelled: true };
      continue;
    }

    // Parallel tool execution (capped)
    const capped = indices.slice(0, AGENT_CONFIG.maxParallelTools);
    const results = await Promise.all(
      capped.map((index) => runSingleStep(session, index, toolContext))
    );
    if (results.some((r) => r.cancelled)) {
      return { ok: false, cancelled: true };
    }
  }

  return { ok: true };
}

/**
 * Light verification pass — check failures and ask the model if results suffice.
 */
export async function verifyResults(session, { contextText = "", signal } = {}) {
  session.setStatus(SESSION_STATUS.VERIFYING);
  session.updateProgress(85);

  const failed = session.steps.filter((s) => s.status === "failed");
  const completed = session.steps.filter((s) => s.status === "completed");

  const findings = completed
    .filter((s) => s.tool && s.result)
    .map((s) => {
      const payload = JSON.stringify(s.result);
      return `### ${s.title} (${s.tool})\n${payload.slice(0, 4000)}`;
    })
    .join("\n\n");

  if (!findings && !failed.length) {
    return {
      ok: true,
      sufficient: true,
      notes: "No tool results to verify; answer from reasoning.",
    };
  }

  try {
    const prompt = `You verify agent execution results for VANI AI.
${VANI_IDENTITY_LOCK}

User request: ${session.userMessage}
Context: ${contextText || "(none)"}

Completed tool findings:
${findings || "(none)"}

Failed steps:
${failed.map((s) => `- ${s.title}: ${s.error}`).join("\n") || "(none)"}

Return ONLY JSON:
{ "sufficient": true|false, "notes": "brief verification notes", "missing": [] }`;

    const response = await Promise.race([
      getGeminiClient().models.generateContent({
        model: CHAT_MODEL,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { temperature: 0 },
      }),
      new Promise((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Verification timed out")),
          AGENT_CONFIG.verifyTimeoutMs
        );
        if (typeof timer.unref === "function") timer.unref();
      }),
    ]);

    if (signal?.aborted || session.isCancelled) {
      return { ok: false, cancelled: true };
    }

    const text = response?.text || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        session.pushTimeline({
          kind: "verify",
          label: "Result verification",
          detail: parsed.notes || (parsed.sufficient ? "Results look sufficient" : "Gaps remain"),
        });
        return {
          ok: true,
          sufficient: parsed.sufficient !== false,
          notes: parsed.notes || "",
          missing: parsed.missing || [],
        };
      } catch {
        /* fall through */
      }
    }

    return {
      ok: true,
      sufficient: failed.length === 0,
      notes: failed.length ? "Some steps failed" : "Verification complete",
    };
  } catch (err) {
    console.warn("[Executor] verify skipped:", err?.message);
    return {
      ok: true,
      sufficient: true,
      notes: "Verification skipped; proceeding with available results",
      warning: err?.message,
    };
  }
}

/**
 * Stream the final natural-language answer from gathered step results.
 */
export async function* generateFinalAnswer(session, { contextText = "", signal } = {}) {
  session.updateProgress(90);
  session.pushTimeline({
    kind: "status",
    label: "Generating answer...",
    status: "generating",
  });

  // Code-level identity short-circuit — never ask the model identity questions.
  const forced = forcedIdentityReply(session.userMessage || "");
  if (forced) {
    session.finalAnswer = forced;
    yield { type: "delta", text: forced, replace: true };
    session.updateProgress(100);
    return;
  }

  const editSteps = session.steps.filter((s) => s.tool === "image_edit");
  const editSucceeded = editSteps.some(
    (s) =>
      s.status === "completed" &&
      (s.result?.imageBase64 || s.result?.fileId || s.result?.imageUrl)
  );
  const editFailed =
    editSteps.length > 0 &&
    editSteps.every((s) => s.status === "failed" || s.result?.ok === false);

  // Image edits: fixed caption only — never LLM-echo OCR/metadata from context.
  if (editSucceeded) {
    session.finalAnswer = IMAGE_EDIT_SUCCESS_CAPTION;
    yield { type: "delta", text: IMAGE_EDIT_SUCCESS_CAPTION, replace: true };
    session.updateProgress(100);
    return;
  }
  if (editFailed && editSteps.length && !session.steps.some((s) => s.tool !== "image_edit" && s.status === "completed")) {
    const msg = imageEditUnavailableMessage();
    session.finalAnswer = msg;
    yield { type: "delta", text: msg, replace: true };
    session.updateProgress(100);
    return;
  }

  const agent = getAgentType(session.agentType);
  const findings = session.steps
    .filter((s) => s.status === "completed" && s.result)
    .map((s) => {
      const payload = JSON.stringify(s.result);
      return `### ${s.title}${s.tool ? ` [${s.tool}]` : ""}\n${payload.slice(0, 6000)}`;
    })
    .join("\n\n");

  const failures = session.steps
    .filter((s) => s.status === "failed")
    .map((s) => `- ${s.title}: ${s.error}`)
    .join("\n");

  const systemInstruction = `You are VANI AI — ${agent.name}.
${agent.systemFocus}

${VANI_IDENTITY_LOCK}

IMAGE CAPABILITIES:
- VANI can generate images (image_generation), edit uploaded images (image_edit), analyze images (vision), and render images inline in chat.
- Never say you cannot generate/edit/display images, that you are text-only, or offer a new generation instead of editing — unless an image tool just failed.
- If image_edit failed, say exactly: "The image editing service is temporarily unavailable."
- If image_generation failed, say exactly: "The image generation service is temporarily unavailable."
- Never reprint OCR text, image metadata, Format/Dimensions, or base64 in the answer.

WRITING STYLE:
- Warm, clear, calm companion tone — never cold or corporate.
- Stay grounded in tool findings. No fluff, no empty flattery.
- Use clean markdown when helpful. Cite source URLs when present.
- If some tools failed, still help with what you have — never invent tool results.`;

  const userPrompt = `${contextText ? `CONTEXT:\n${contextText}\n\n` : ""}USER REQUEST:
${session.userMessage}

AGENT PLAN FINDINGS:
${findings || "(no tool findings — answer from reasoning and context)"}

FAILED STEPS:
${failures || "(none)"}

Provide the final answer for the user now.`;

  let stream;
  try {
    stream = await Promise.race([
      getGeminiClient().models.generateContentStream({
        model: CHAT_MODEL,
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        config: {
          systemInstruction,
          temperature: 0.4,
        },
      }),
      new Promise((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Final answer timed out")),
          AGENT_CONFIG.finalAnswerTimeoutMs
        );
        if (typeof timer.unref === "function") timer.unref();
      }),
    ]);
  } catch (err) {
    const fallback =
      findings || failures
        ? "I finished the planned steps but timed out while writing the final answer. Please try again."
        : err?.message || "Unable to generate a final answer.";
    console.warn("[Executor] final answer failed:", err?.message);
    session.finalAnswer = fallback;
    yield { type: "delta", text: fallback, replace: true };
    session.updateProgress(100);
    return;
  }

  const identityGuard = createIdentityStreamGuard(session.userMessage || "");

  for await (const chunk of stream) {
    if (signal?.aborted || session.isCancelled) return;
    if (!(await session.waitIfPaused())) return;
    const text = chunk?.text;
    if (text) {
      const out = identityGuard.push(text);
      if (!out?.text) continue;
      if (out.replace) {
        session.finalAnswer = out.text;
        yield { type: "delta", text: out.text, replace: true };
      } else {
        session.finalAnswer += out.text;
        yield { type: "delta", text: out.text };
      }
    }
  }

  const trailing = identityGuard.flush();
  if (trailing?.text) {
    if (trailing.replace) {
      session.finalAnswer = trailing.text;
      yield { type: "delta", text: trailing.text, replace: true };
    } else {
      session.finalAnswer += trailing.text;
      yield { type: "delta", text: trailing.text };
    }
  }

  // Final post-generation identity enforcement on the full answer.
  const enforced = sanitizeIdentityResponse(
    session.finalAnswer,
    session.userMessage || ""
  );
  if (enforced !== session.finalAnswer) {
    session.finalAnswer = enforced;
    yield { type: "delta", text: enforced, replace: true };
  }

  session.updateProgress(100);
}
