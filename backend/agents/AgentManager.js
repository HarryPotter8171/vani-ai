/**
 * AgentManager — session lifecycle, orchestration, pause/resume/cancel/retry.
 * Future tools plug into ToolRegistry without modifying this file.
 */

import { AGENT_CONFIG, getAgentType, listAgentTypes } from "./config.js";
import { AgentSession, SESSION_STATUS, isSessionExpired } from "./AgentSession.js";
import { MemoryManager } from "./MemoryManager.js";
import { createPlan } from "./Planner.js";
import { executePlan, verifyResults, generateFinalAnswer } from "./Executor.js";
import { initAgentTools } from "./tools/index.js";

/** @type {Map<string, AgentSession>} */
const sessions = new Map();

/** @type {Map<string, { count: number, resetAt: number }>} */
const runBuckets = new Map();

let toolsReady = false;

function ensureTools() {
  if (!toolsReady) {
    initAgentTools();
    toolsReady = true;
  }
}

function rateLimitKey(userKey) {
  return String(userKey || "anonymous");
}

function checkRateLimit(userKey) {
  const key = rateLimitKey(userKey);
  const now = Date.now();
  let bucket = runBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + AGENT_CONFIG.rateLimit.windowMs };
    runBuckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > AGENT_CONFIG.rateLimit.maxRuns) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return {
      ok: false,
      error: "Agent rate limit exceeded. Please try again shortly.",
      retryAfter,
    };
  }
  return { ok: true };
}

function pruneSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.isTerminal && isSessionExpired(session, now)) {
      sessions.delete(id);
    }
  }
}

function countActiveForUser(userKey) {
  let n = 0;
  for (const session of sessions.values()) {
    if (session.context?.userKey === userKey && !session.isTerminal) n += 1;
  }
  return n;
}

export class AgentManager {
  constructor() {
    ensureTools();
  }

  listTypes() {
    return listAgentTypes();
  }

  getSession(sessionId) {
    return sessions.get(sessionId) || null;
  }

  /**
   * Create a new agent session (does not start execution).
   */
  createSession({
    agentType = "general",
    userMessage,
    conversation = [],
    context = {},
  } = {}) {
    ensureTools();
    pruneSessions();

    const type = getAgentType(agentType);
    const userKey = context.userKey || context.userEmail || context.userId || "anonymous";

    const limit = checkRateLimit(userKey);
    if (!limit.ok) {
      const err = new Error(limit.error);
      err.code = "RATE_LIMIT";
      err.retryAfter = limit.retryAfter;
      throw err;
    }

    if (countActiveForUser(userKey) >= AGENT_CONFIG.maxSessionsPerUser) {
      const err = new Error("Too many active agent sessions. Cancel one and retry.");
      err.code = "SESSION_LIMIT";
      throw err;
    }

    const session = new AgentSession({
      agentType: type.id,
      userMessage: String(userMessage || "").trim(),
      conversation,
      context: { ...context, userKey },
    });

    sessions.set(session.id, session);
    return session;
  }

  pause(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) return { ok: false, error: "Session not found" };
    return { ok: session.requestPause(), session: session.toJSON() };
  }

  resume(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) return { ok: false, error: "Session not found" };
    return { ok: session.resume(), session: session.toJSON() };
  }

  cancel(sessionId, reason) {
    const session = this.getSession(sessionId);
    if (!session) return { ok: false, error: "Session not found" };
    return { ok: session.cancel(reason), session: session.toJSON() };
  }

  /**
   * Retry a failed step (or the whole run from a failed step index).
   */
  async retryStep(sessionId, stepIndex) {
    const session = this.getSession(sessionId);
    if (!session) return { ok: false, error: "Session not found" };
    if (session.isCancelled) return { ok: false, error: "Session cancelled" };

    const index =
      typeof stepIndex === "number" ? stepIndex : session.currentStepIndex;
    const step = session.steps[index];
    if (!step) return { ok: false, error: "Step not found" };

    step.status = "pending";
    step.error = null;
    step.result = null;
    step.retries = (step.retries || 0) + 1;
    session.retryCount += 1;
    session.status = SESSION_STATUS.RUNNING;
    session._cancelled = false;
    session._paused = false;

    session.pushTimeline({
      kind: "retry",
      stepId: step.id,
      label: `Retrying ${step.title}...`,
      tool: step.tool,
    });

    return { ok: true, session: session.toJSON() };
  }

  /**
   * Full agent run as an async generator of stream events.
   *
   * Yields:
   *   session_start | status | plan | progress | timeline |
   *   step_start | step_done | step_failed | tool_start | tool_done |
   *   retry | delta | completed | error | cancelled | paused | resumed
   */
  async *run(session, { signal } = {}) {
    ensureTools();

    const abortProxy = {
      get aborted() {
        return Boolean(signal?.aborted || session.isCancelled);
      },
    };

    /** @type {object[]} */
    const queue = [];
    let resolveWait = null;
    let closed = false;

    const onEvent = (event) => {
      queue.push(event);
      if (resolveWait) {
        const r = resolveWait;
        resolveWait = null;
        r();
      }
    };

    const unsubscribe = session.on(onEvent);

    const waitForEvent = async () => {
      if (queue.length || closed) return;
      await new Promise((resolve) => {
        resolveWait = resolve;
      });
    };

    const drain = function* () {
      while (queue.length) {
        yield queue.shift();
      }
    };

    try {
      if (!session.userMessage) {
        session.setStatus(SESSION_STATUS.FAILED, "Empty message");
        yield { type: "error", error: "Message is required", sessionId: session.id };
        return;
      }

      yield {
        type: "session_start",
        sessionId: session.id,
        agentType: session.agentType,
        agentName: getAgentType(session.agentType).name,
        progress: 0,
      };

      // ── Memory / conversation context ─────────────────────────────
      const memory = new MemoryManager({
        userId: session.context?.userId || null,
        chatId: session.context?.chatId || null,
      });
      const memoryBundle = await memory.buildAgentContext({
        userMessage: session.userMessage,
        conversation: session.conversation,
      });

      // ── Planning ──────────────────────────────────────────────────
      session.setStatus(SESSION_STATUS.PLANNING);
      yield* drain();

      const attachmentPools = [
        ...(session.context?.attachments || []),
        ...(session.context?.conversationAttachments || []),
      ];
      const hasImages = attachmentPools.some((att) => {
        if (!att) return false;
        const mime = String(att.mimeType || "").toLowerCase();
        const kind = String(att.kind || "").toLowerCase();
        return (
          kind === "image" ||
          mime.startsWith("image/") ||
          /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.test(att.name || "") ||
          Boolean(att.dataBase64 && (kind === "image" || mime.startsWith("image/")))
        );
      }) ||
        (Array.isArray(session.context?.contents) &&
          session.context.contents.some((c) =>
            (c.parts || []).some((p) =>
              String(p?.inlineData?.mimeType || "").startsWith("image/")
            )
          ));

      const planResult = await createPlan({
        agentTypeId: session.agentType,
        userMessage: session.userMessage,
        contextText: memoryBundle.contextText,
        signal: abortProxy,
        hasImages,
        allowedTools: session.allowedTools,
      });

      if (session.isCancelled || abortProxy.aborted) {
        yield { type: "cancelled", sessionId: session.id, progress: session.progress };
        return;
      }

      session.setPlan(planResult.steps || []);
      yield* drain();

      // ── Execution ─────────────────────────────────────────────────
      const toolContext = {
        userId: session.context?.userId,
        userEmail: session.context?.userEmail,
        userName: session.context?.userName,
        chatId: session.context?.chatId,
        projectId: session.context?.projectId,
        attachments: session.context?.attachments || [],
        conversationAttachments: session.context?.conversationAttachments || [],
        contents: session.context?.contents || [],
        signal: abortProxy,
        agentSessionId: session.id,
        memoryManager: memory,
      };

      const execResult = await executePlan(session, toolContext);
      yield* drain();

      if (execResult.cancelled || session.isCancelled || abortProxy.aborted) {
        if (!session.isCancelled) session.cancel("Aborted");
        yield { type: "cancelled", sessionId: session.id, progress: session.progress };
        return;
      }

      // ── Verification ──────────────────────────────────────────────
      await verifyResults(session, {
        contextText: memoryBundle.contextText,
        signal: abortProxy,
      });
      yield* drain();

      if (session.isCancelled || abortProxy.aborted) {
        yield { type: "cancelled", sessionId: session.id, progress: session.progress };
        return;
      }

      // ── Final response ────────────────────────────────────────────
      for await (const event of generateFinalAnswer(session, {
        contextText: memoryBundle.contextText,
        signal: abortProxy,
      })) {
        yield event;
        yield* drain();
      }

      if (session.isCancelled || abortProxy.aborted) {
        yield { type: "cancelled", sessionId: session.id, progress: session.progress };
        return;
      }

      if (!session.finalAnswer.trim()) {
        session.finalAnswer =
          "I planned and executed the task, but could not produce a final answer. Please try again.";
        yield { type: "delta", text: session.finalAnswer };
      }

      session.setStatus(SESSION_STATUS.COMPLETED);
      session.updateProgress(100);
      yield* drain();
      yield {
        type: "completed",
        sessionId: session.id,
        progress: 100,
        answer: session.finalAnswer,
        steps: session.steps,
      };
    } catch (err) {
      console.error("[AgentManager] run failed:", err);
      session.error =
        "We couldn't complete that task right now. Please try again.";
      session.setStatus(SESSION_STATUS.FAILED, session.error);
      yield* drain();
      yield {
        type: "error",
        sessionId: session.id,
        error: session.error,
        progress: session.progress,
      };
    } finally {
      closed = true;
      unsubscribe();
      if (resolveWait) resolveWait();
    }
  }
}

/** Singleton used by HTTP controllers. */
export const agentManager = new AgentManager();
