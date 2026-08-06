/**
 * In-memory Deep Research session with pause/cancel/resume support.
 */

import crypto from "crypto";
import {
  RESEARCH_CONFIG,
  RESEARCH_STATUS,
  TERMINAL_RESEARCH_STATUS,
} from "./config.js";

export class ResearchSession {
  /**
   * @param {object} options
   */
  constructor({
    query = "",
    userId = null,
    chatId = null,
    projectId = null,
    sessionId = null,
  } = {}) {
    this.id = sessionId || crypto.randomUUID();
    this.query = query;
    this.userId = userId;
    this.chatId = chatId;
    this.projectId = projectId;

    this.status = RESEARCH_STATUS.IDLE;
    this.phase = null;
    this.progress = 0;
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;
    this.startedAt = null;
    this.finishedAt = null;

    this.plan = null;
    /** @type {object[]} */
    this.sources = [];
    /** @type {object[]} */
    this.timeline = [];
    /** @type {object[]} */
    this.contradictions = [];
    /** @type {object[]} */
    this.citations = [];
    /** @type {string[]} */
    this.followUpQuestions = [];
    /** @type {string[]} */
    this.providers = [];

    this.report = "";
    this.confidence = null;
    this.error = null;
    this.etaSeconds = null;
    this.resumeFromPhase = null;

    this._paused = false;
    this._cancelled = false;
    this._pauseWaiters = [];
    this._listeners = new Set();
    this._abortController = new AbortController();
    /** @type {Promise<void> | null} In-flight pipeline (prevents resume double-run). */
    this._pipelinePromise = null;
    /** Guard so original + resume HTTP handlers don't double-append the report. */
    this._reportAppendedToChat = false;
  }

  get signal() {
    return this._abortController.signal;
  }

  get isTerminal() {
    return TERMINAL_RESEARCH_STATUS.has(this.status);
  }

  get isCancelled() {
    return this._cancelled || this.status === RESEARCH_STATUS.CANCELLED;
  }

  get isPaused() {
    return this._paused || this.status === RESEARCH_STATUS.PAUSED;
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
        console.error("[ResearchSession] listener error:", err);
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

  setPhase(phase, detail = null) {
    this.phase = phase;
    this.status =
      phase && RESEARCH_STATUS[phase.toUpperCase()]
        ? RESEARCH_STATUS[phase.toUpperCase()]
        : phase || this.status;
    this.updatedAt = Date.now();
    this.etaSeconds = estimateRemaining(phase, this.progress);
    this.pushTimeline({
      kind: "phase",
      phase,
      label: RESEARCH_CONFIG.phaseLabels[phase] || phase,
      detail,
      status: "running",
    });
    this.emit({
      type: "phase",
      phase,
      label: RESEARCH_CONFIG.phaseLabels[phase] || phase,
      detail,
      progress: this.progress,
      etaSeconds: this.etaSeconds,
      status: this.status,
    });
  }

  setProgress(progress, label = null) {
    this.progress = Math.max(0, Math.min(100, Math.round(progress)));
    this.etaSeconds = estimateRemaining(this.phase, this.progress);
    this.emit({
      type: "progress",
      progress: this.progress,
      label,
      phase: this.phase,
      etaSeconds: this.etaSeconds,
    });
  }

  addSource(source) {
    this.sources.push(source);
    this.emit({
      type: "source",
      source: summarizeSource(source),
      progress: this.progress,
    });
  }

  pause() {
    if (this.isTerminal) return { ok: false, error: "Session already finished" };
    this._paused = true;
    this.status = RESEARCH_STATUS.PAUSED;
    this.resumeFromPhase = this.phase;
    this.pushTimeline({ kind: "status", label: "Paused", status: "paused" });
    this.emit({ type: "paused", status: this.status, progress: this.progress });
    return { ok: true };
  }

  resume() {
    if (!this._paused && this.status !== RESEARCH_STATUS.PAUSED) {
      return { ok: false, error: "Session is not paused" };
    }
    this._paused = false;
    this.status = this.phase || RESEARCH_STATUS.PLANNING;
    this.pushTimeline({ kind: "status", label: "Resumed", status: "running" });
    for (const resolve of this._pauseWaiters.splice(0)) resolve(true);
    this.emit({ type: "resumed", status: this.status, progress: this.progress });
    return { ok: true };
  }

  cancel(reason = "Cancelled by user") {
    if (this.isTerminal && this.status === RESEARCH_STATUS.CANCELLED) {
      return { ok: true };
    }
    this._cancelled = true;
    this._paused = false;
    this.status = RESEARCH_STATUS.CANCELLED;
    this.error = reason;
    this.finishedAt = Date.now();
    try {
      this._abortController.abort();
    } catch {
      /* ignore */
    }
    for (const resolve of this._pauseWaiters.splice(0)) resolve(false);
    this.pushTimeline({
      kind: "status",
      label: "Stopped",
      status: "cancelled",
      detail: reason,
    });
    this.emit({
      type: "cancelled",
      reason,
      status: this.status,
      progress: this.progress,
    });
    return { ok: true };
  }

  /**
   * Await while paused. Returns false if cancelled.
   */
  async waitIfPaused() {
    if (this.isCancelled) return false;
    if (!this._paused) return true;
    return new Promise((resolve) => {
      this._pauseWaiters.push(resolve);
    });
  }

  complete({ report, citations, confidence, followUpQuestions, contradictions }) {
    this.report = report || this.report;
    this.citations = citations || this.citations;
    this.confidence = confidence;
    this.followUpQuestions = followUpQuestions || this.followUpQuestions;
    this.contradictions = contradictions || this.contradictions;
    this.progress = 100;
    this.status = RESEARCH_STATUS.COMPLETED;
    this.phase = "completed";
    this.finishedAt = Date.now();
    this.etaSeconds = 0;
    this.pushTimeline({
      kind: "status",
      label: "Completed",
      status: "completed",
    });
    this.emit({
      type: "completed",
      report: this.report,
      citations: this.citations,
      confidence: this.confidence,
      followUpQuestions: this.followUpQuestions,
      contradictions: this.contradictions,
      sources: this.sources.map(summarizeSource),
      progress: 100,
      status: this.status,
    });
  }

  fail(error) {
    this.error = error?.message || String(error || "Research failed");
    this.status = RESEARCH_STATUS.FAILED;
    this.finishedAt = Date.now();
    this.pushTimeline({
      kind: "status",
      label: "Failed",
      status: "failed",
      detail: this.error,
    });
    this.emit({
      type: "error",
      error: this.error,
      status: this.status,
      progress: this.progress,
    });
  }

  toJSON() {
    return {
      id: this.id,
      query: this.query,
      chatId: this.chatId,
      projectId: this.projectId,
      status: this.status,
      phase: this.phase,
      progress: this.progress,
      etaSeconds: this.etaSeconds,
      plan: this.plan,
      sources: this.sources.map(summarizeSource),
      timeline: this.timeline,
      contradictions: this.contradictions,
      citations: this.citations,
      followUpQuestions: this.followUpQuestions,
      providers: this.providers,
      report: this.report,
      confidence: this.confidence,
      error: this.error,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
    };
  }
}

function summarizeSource(source) {
  if (!source) return source;
  return {
    citationId: source.citationId,
    citationLabel: source.citationLabel,
    title: source.title,
    url: source.url,
    snippet: (source.snippet || source.text || "").slice(0, 280),
    score: source.score,
    ok: source.ok,
    provider: source.provider,
    error: source.error,
  };
}

function estimateRemaining(phase, progress) {
  const phases = RESEARCH_CONFIG.phases;
  const idx = phases.indexOf(phase);
  if (idx < 0) {
    return Math.max(5, Math.round(((100 - progress) / 100) * 60));
  }

  let remaining = 0;
  for (let i = idx; i < phases.length; i += 1) {
    const p = phases[i];
    const full = RESEARCH_CONFIG.estimatedPhaseSeconds[p] || 10;
    if (i === idx) {
      // Assume current phase is half done when progress mid-band.
      const phaseSpan = 100 / phases.length;
      const local = Math.max(0, Math.min(1, (progress - idx * phaseSpan) / phaseSpan));
      remaining += full * (1 - local);
    } else {
      remaining += full;
    }
  }
  return Math.max(3, Math.round(remaining));
}

/** Active sessions keyed by id */
export const researchSessions = new Map();

export function getResearchSession(id) {
  return researchSessions.get(id) || null;
}

export function rememberSession(session) {
  researchSessions.set(session.id, session);
  // Opportunistic TTL cleanup — drop finished/abandoned sessions; cancel
  // anything still alive past TTL so the map cannot grow without bound.
  const ttl = RESEARCH_CONFIG.sessionTtlMs;
  setTimeout(() => {
    const current = researchSessions.get(session.id);
    if (!current) return;
    if (!current.isTerminal) {
      current.cancel("Session expired");
    }
    researchSessions.delete(session.id);
  }, ttl).unref?.();
  return session;
}
