/**
 * AgentSession — lifecycle + progress state for a single agent run.
 *
 * States: idle → planning → running → verifying → completed
 *          ↘ paused ↗        ↘ failed / cancelled
 */

import crypto from "crypto";
import { AGENT_CONFIG, getAgentType } from "./config.js";
import { listRegisteredMcpAgentTools } from "../mcp/bridge.ts";

export const SESSION_STATUS = {
  IDLE: "idle",
  PLANNING: "planning",
  RUNNING: "running",
  PAUSED: "paused",
  VERIFYING: "verifying",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
};

const TERMINAL = new Set([
  SESSION_STATUS.COMPLETED,
  SESSION_STATUS.FAILED,
  SESSION_STATUS.CANCELLED,
]);

export class AgentSession {
  /**
   * @param {object} options
   * @param {string} options.agentType
   * @param {string} options.userMessage
   * @param {object[]} [options.conversation]
   * @param {object} [options.context]
   * @param {string} [options.sessionId]
   */
  constructor({
    agentType = "general",
    userMessage = "",
    conversation = [],
    context = {},
    sessionId = null,
  } = {}) {
    this.id = sessionId || crypto.randomUUID();
    this.agentType = getAgentType(agentType).id;
    this.userMessage = userMessage;
    this.conversation = Array.isArray(conversation) ? conversation : [];
    this.context = context || {};

    this.status = SESSION_STATUS.IDLE;
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;

    /** @type {object[]} */
    this.plan = [];
    /** @type {object[]} */
    this.steps = [];
    /** @type {object[]} */
    this.timeline = [];

    this.currentStepIndex = -1;
    this.progress = 0;
    this.finalAnswer = "";
    this.error = null;
    this.retryCount = 0;

    this._paused = false;
    this._cancelled = false;
    this._pauseWaiters = [];
    this._listeners = new Set();
  }

  get isTerminal() {
    return TERMINAL.has(this.status);
  }

  get isCancelled() {
    return this._cancelled || this.status === SESSION_STATUS.CANCELLED;
  }

  get isPaused() {
    return this._paused || this.status === SESSION_STATUS.PAUSED;
  }

  get allowedTools() {
    const base = getAgentType(this.agentType).tools || [];
    // MCP tools are user-configured and registered dynamically — expose only
    // this session user's tools so planners cannot see other tenants' MCP tools.
    const userId = this.context?.userId ? String(this.context.userId) : null;
    const mcpTools = listRegisteredMcpAgentTools(userId);
    if (!mcpTools.length) return base;
    return [...base, ...mcpTools];
  }

  on(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  emit(event) {
    this.updatedAt = Date.now();
    for (const listener of this._listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[AgentSession] listener error:", err);
      }
    }
  }

  pushTimeline(entry) {
    const item = {
      id: crypto.randomUUID(),
      at: Date.now(),
      ...entry,
    };
    this.timeline.push(item);
    this.emit({ type: "timeline", entry: item, progress: this.progress });
    return item;
  }

  setStatus(status, detail = null) {
    this.status = status;
    this.updatedAt = Date.now();
    this.pushTimeline({
      kind: "status",
      label: statusLabel(status),
      status,
      detail,
    });
    this.emit({ type: "status", status, detail, progress: this.progress });
  }

  setPlan(steps) {
    this.plan = steps.map((step, index) => ({
      id: step.id || `step-${index + 1}`,
      index,
      title: step.title || `Step ${index + 1}`,
      description: step.description || "",
      tool: step.tool || null,
      args: step.args || {},
      parallelGroup: step.parallelGroup ?? null,
      status: "pending",
      retries: 0,
      result: null,
      error: null,
    }));
    this.steps = this.plan.map((s) => ({ ...s }));
    this.progress = 5;
    this.emit({ type: "plan", plan: this.plan, progress: this.progress });
    this.pushTimeline({
      kind: "plan",
      label: "Task breakdown ready",
      detail: `${this.plan.length} steps`,
    });
  }

  updateProgress(value) {
    this.progress = Math.max(0, Math.min(100, Math.round(value)));
    this.emit({ type: "progress", progress: this.progress });
  }

  markStepStart(index) {
    const step = this.steps[index];
    if (!step) return;
    this.currentStepIndex = index;
    step.status = "running";
    step.startedAt = Date.now();
    const pct = 10 + ((index / Math.max(this.steps.length, 1)) * 70);
    this.updateProgress(pct);
    this.pushTimeline({
      kind: "step_start",
      stepId: step.id,
      label: step.title,
      tool: step.tool,
      detail: step.description,
    });
    this.emit({ type: "step_start", step, progress: this.progress });
  }

  markStepDone(index, result) {
    const step = this.steps[index];
    if (!step) return;
    step.status = "completed";
    step.result = result;
    step.finishedAt = Date.now();
    const done = this.steps.filter((s) => s.status === "completed").length;
    this.updateProgress(10 + (done / Math.max(this.steps.length, 1)) * 70);
    this.pushTimeline({
      kind: "step_done",
      stepId: step.id,
      label: step.title,
      tool: step.tool,
      ok: true,
    });
    this.emit({ type: "step_done", step, progress: this.progress });
  }

  markStepFailed(index, error) {
    const step = this.steps[index];
    if (!step) return;
    step.status = "failed";
    step.error = error;
    step.finishedAt = Date.now();
    this.pushTimeline({
      kind: "step_failed",
      stepId: step.id,
      label: step.title,
      tool: step.tool,
      ok: false,
      detail: error,
    });
    this.emit({ type: "step_failed", step, error, progress: this.progress });
  }

  requestPause() {
    if (this.isTerminal) return false;
    this._paused = true;
    if (this.status !== SESSION_STATUS.PAUSED) {
      this.setStatus(SESSION_STATUS.PAUSED);
    }
    this.emit({ type: "paused", progress: this.progress });
    return true;
  }

  resume() {
    if (!this._paused && this.status !== SESSION_STATUS.PAUSED) return false;
    if (this.isTerminal || this._cancelled) return false;
    this._paused = false;
    this.status = SESSION_STATUS.RUNNING;
    this.pushTimeline({ kind: "status", label: "Resumed", status: "running" });
    this.emit({ type: "resumed", progress: this.progress });
    for (const resolve of this._pauseWaiters.splice(0)) resolve();
    return true;
  }

  cancel(reason = "Cancelled by user") {
    if (this.isTerminal) return false;
    this._cancelled = true;
    this._paused = false;
    this.error = reason;
    this.setStatus(SESSION_STATUS.CANCELLED, reason);
    this.emit({ type: "cancelled", reason, progress: this.progress });
    for (const resolve of this._pauseWaiters.splice(0)) resolve();
    return true;
  }

  /** Await if paused; returns false if cancelled while waiting. */
  async waitIfPaused() {
    while (this._paused && !this._cancelled) {
      await new Promise((resolve) => {
        this._pauseWaiters.push(resolve);
      });
    }
    return !this._cancelled;
  }

  toJSON() {
    return {
      id: this.id,
      agentType: this.agentType,
      status: this.status,
      progress: this.progress,
      plan: this.plan,
      steps: this.steps,
      timeline: this.timeline,
      currentStepIndex: this.currentStepIndex,
      finalAnswer: this.finalAnswer,
      error: this.error,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      userMessage: this.userMessage,
    };
  }
}

function statusLabel(status) {
  switch (status) {
    case SESSION_STATUS.PLANNING:
      return "Planning...";
    case SESSION_STATUS.RUNNING:
      return "Executing...";
    case SESSION_STATUS.PAUSED:
      return "Paused";
    case SESSION_STATUS.VERIFYING:
      return "Verifying results...";
    case SESSION_STATUS.COMPLETED:
      return "Completed";
    case SESSION_STATUS.FAILED:
      return "Failed";
    case SESSION_STATUS.CANCELLED:
      return "Cancelled";
    default:
      return "Ready";
  }
}

export function isSessionExpired(session, now = Date.now()) {
  return now - session.updatedAt > AGENT_CONFIG.sessionTtlMs;
}
