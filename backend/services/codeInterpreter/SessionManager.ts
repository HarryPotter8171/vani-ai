/**
 * SessionManager — per-user isolated Code Interpreter sessions.
 *
 * Supports notebook-style persistence (variables survive across executions),
 * interrupt, restart, file upload/download, streaming events, and cleanup.
 */

import { randomUUID } from "node:crypto";
import { FileManager } from "./FileManager.ts";
import { PythonRunner } from "./PythonRunner.ts";
import { sandboxManager } from "./SandboxManager.ts";
import { getLimits } from "./config.ts";
import { codeLog } from "./logger.ts";
import type {
  ExecuteOptions,
  ExecutionResult,
  GeneratedFile,
  PlotArtifact,
  SessionSnapshot,
  SessionStatus,
  StreamEvent,
  UploadFileInput,
} from "./types.ts";

type ActiveSession = {
  sessionId: string;
  userId: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  lastExecutionAt: string | null;
  executionCount: number;
  files: FileManager;
  runner: PythonRunner;
  plots: PlotArtifact[];
  lastResult: ExecutionResult | null;
  error: string | null;
  knownPaths: Set<string>;
  listeners: Set<(event: StreamEvent) => void>;
};

function id(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
}

function nowIso() {
  return new Date().toISOString();
}

export class SessionManager {
  private sessions = new Map<string, ActiveSession>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  startCleanupMonitor(intervalMs = 60_000): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      void this.sweepIdle().catch(() => undefined);
    }, intervalMs);
    if (typeof this.cleanupTimer.unref === "function") {
      this.cleanupTimer.unref();
    }
  }

  stopCleanupMonitor(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private countUserSessions(userId: string): number {
    let n = 0;
    for (const s of this.sessions.values()) {
      if (s.userId === userId && s.status !== "closed") n++;
    }
    return n;
  }

  private getOwned(sessionId: string, userId: string): ActiveSession {
    const s = this.sessions.get(sessionId);
    if (!s || s.userId !== userId || s.status === "closed") {
      const err = new Error("Code Interpreter session not found");
      (err as Error & { status?: number }).status = 404;
      throw err;
    }
    return s;
  }

  private toSnapshot(s: ActiveSession): SessionSnapshot {
    return {
      sessionId: s.sessionId,
      userId: s.userId,
      status: s.status,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      lastExecutionAt: s.lastExecutionAt,
      executionCount: s.executionCount,
      files: s.files.listFiles(),
      plots: [...s.plots],
      lastResult: s.lastResult,
      limits: sandboxManager.getLimits(),
      error: s.error,
    };
  }

  private emit(s: ActiveSession, event: StreamEvent) {
    for (const listener of s.listeners) {
      try {
        listener(event);
      } catch {
        // ignore
      }
    }
  }

  listSessions(userId: string): SessionSnapshot[] {
    return [...this.sessions.values()]
      .filter((s) => s.userId === userId && s.status !== "closed")
      .map((s) => this.toSnapshot(s));
  }

  getSession(sessionId: string, userId: string): SessionSnapshot {
    return this.toSnapshot(this.getOwned(sessionId, userId));
  }

  subscribe(
    sessionId: string,
    userId: string,
    listener: (event: StreamEvent) => void
  ): () => void {
    const s = this.getOwned(sessionId, userId);
    s.listeners.add(listener);
    return () => s.listeners.delete(listener);
  }

  async createSession(userId: string): Promise<SessionSnapshot> {
    sandboxManager.assertEnabled();
    const limits = getLimits();
    if (this.countUserSessions(userId) >= limits.maxSessionsPerUser) {
      // Evict oldest idle session for this user
      const oldest = [...this.sessions.values()]
        .filter((s) => s.userId === userId && s.status !== "running")
        .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0];
      if (oldest) {
        await this.destroySession(oldest.sessionId, userId);
      } else {
        const err = new Error(
          `Maximum of ${limits.maxSessionsPerUser} Code Interpreter sessions reached`
        );
        (err as Error & { status?: number }).status = 429;
        throw err;
      }
    }

    const sessionId = id("cis");
    const files = new FileManager(userId, sessionId);
    await files.init();
    const runner = new PythonRunner(userId, sessionId, files.workspace);

    const session: ActiveSession = {
      sessionId,
      userId,
      status: "starting",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastExecutionAt: null,
      executionCount: 0,
      files,
      runner,
      plots: [],
      lastResult: null,
      error: null,
      knownPaths: new Set(),
      listeners: new Set(),
    };
    this.sessions.set(sessionId, session);

    try {
      await runner.start();
      session.status = "ready";
      session.updatedAt = nowIso();
      codeLog.audit("session.create", userId, {}, { sessionId });
      return this.toSnapshot(session);
    } catch (err) {
      session.status = "error";
      session.error = err instanceof Error ? err.message : String(err);
      codeLog.error(
        "session.create_failed",
        userId,
        { error: session.error },
        { sessionId }
      );
      await this.destroySession(sessionId, userId).catch(() => undefined);
      throw err;
    }
  }

  /**
   * Get an existing session or create one. Used by agents / research.
   */
  async getOrCreate(userId: string, sessionId?: string | null): Promise<SessionSnapshot> {
    if (sessionId) {
      const existing = this.sessions.get(sessionId);
      if (existing && existing.userId === userId && existing.status !== "closed") {
        return this.toSnapshot(existing);
      }
    }
    // Prefer the most recently updated ready session
    const reusable = [...this.sessions.values()]
      .filter(
        (s) =>
          s.userId === userId &&
          (s.status === "ready" || s.status === "idle" || s.status === "interrupted")
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (reusable) return this.toSnapshot(reusable);
    return this.createSession(userId);
  }

  async execute(
    sessionId: string,
    userId: string,
    options: ExecuteOptions
  ): Promise<ExecutionResult> {
    sandboxManager.assertEnabled();
    const code = sandboxManager.validateCode(options.code);
    const s = this.getOwned(sessionId, userId);

    if (s.status === "running") {
      const err = new Error("Session is already running an execution");
      (err as Error & { status?: number }).status = 409;
      throw err;
    }

    s.status = "running";
    s.updatedAt = nowIso();
    s.error = null;

    const startedAt = nowIso();
    const startedMs = Date.now();
    let executionId = "";

    const onEvent = (event: StreamEvent) => {
      this.emit(s, event);
      options.onEvent?.(event);
    };

    codeLog.audit(
      "execution.start",
      userId,
      { codeChars: code.length },
      { sessionId }
    );

    try {
      if (!s.runner.isReady) await s.runner.start();

      const kernelResult = await s.runner.execute({
        code,
        timeoutMs: options.timeoutMs,
        onEvent,
      });
      executionId = kernelResult.executionId;

      // Discover generated files / plots
      const synced = await s.files.syncGenerated(s.knownPaths);
      const plots: PlotArtifact[] = [];

      for (const plotFile of synced.plots) {
        const artifact: PlotArtifact = {
          id: `cip_${randomUUID().replace(/-/g, "").slice(0, 10)}`,
          fileId: plotFile.id,
          mimeType: plotFile.mimeType,
          path: plotFile.path,
          createdAt: plotFile.createdAt,
        };
        plots.push(artifact);
        s.plots.push(artifact);
        onEvent({
          type: "plot",
          sessionId,
          executionId,
          plot: artifact,
          timestamp: nowIso(),
        });
      }

      for (const file of synced.files) {
        onEvent({
          type: "file",
          sessionId,
          executionId,
          file,
          timestamp: nowIso(),
        });
      }

      // Also register kernel-reported plot paths that sync might have caught
      for (const kp of kernelResult.plots) {
        if (!s.knownPaths.has(kp.path)) {
          // ensure sync on next pass
        }
      }

      let status: ExecutionResult["status"] = "completed";
      if (kernelResult.timedOut) status = "timeout";
      else if (kernelResult.interrupted) status = "interrupted";
      else if (!kernelResult.ok) status = "failed";

      const result: ExecutionResult = {
        executionId,
        sessionId,
        status,
        stdout: kernelResult.stdout,
        stderr: kernelResult.stderr,
        error: kernelResult.error,
        plots,
        files: synced.files,
        startedAt,
        finishedAt: nowIso(),
        durationMs: kernelResult.durationMs || Date.now() - startedMs,
        resultPreview: kernelResult.resultPreview,
      };

      s.lastResult = result;
      s.executionCount += 1;
      s.lastExecutionAt = result.finishedAt;
      s.status =
        status === "interrupted"
          ? "interrupted"
          : status === "failed" || status === "timeout"
            ? "ready"
            : "ready";
      s.updatedAt = nowIso();

      // If kernel died on interrupt/timeout, restart for next cell
      if (!s.runner.isAlive) {
        try {
          await s.runner.start();
          s.status = "ready";
        } catch (err) {
          s.status = "error";
          s.error = err instanceof Error ? err.message : String(err);
        }
      }

      onEvent({
        type: "done",
        sessionId,
        executionId,
        status,
        timestamp: nowIso(),
      });

      codeLog.audit(
        "execution.finish",
        userId,
        {
          status,
          durationMs: result.durationMs,
          plots: plots.length,
          files: synced.files.length,
        },
        { sessionId, executionId }
      );

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      s.status = "error";
      s.error = message;
      s.updatedAt = nowIso();
      const result: ExecutionResult = {
        executionId: executionId || id("cie"),
        sessionId,
        status: "failed",
        stdout: "",
        stderr: "",
        error: message,
        plots: [],
        files: [],
        startedAt,
        finishedAt: nowIso(),
        durationMs: Date.now() - startedMs,
      };
      s.lastResult = result;
      codeLog.error(
        "execution.error",
        userId,
        { error: message },
        { sessionId, executionId: result.executionId }
      );
      onEvent({
        type: "error",
        sessionId,
        executionId: result.executionId,
        error: message,
        timestamp: nowIso(),
      });
      return result;
    }
  }

  async interrupt(sessionId: string, userId: string): Promise<SessionSnapshot> {
    const s = this.getOwned(sessionId, userId);
    await s.runner.interrupt();
    s.status = "interrupted";
    s.updatedAt = nowIso();
    codeLog.audit("session.interrupt", userId, {}, { sessionId });
    return this.toSnapshot(s);
  }

  async restart(sessionId: string, userId: string): Promise<SessionSnapshot> {
    const s = this.getOwned(sessionId, userId);
    s.status = "starting";
    s.updatedAt = nowIso();
    try {
      await s.runner.stop();
      await s.runner.start();
      // Soft-reset namespace as well
      try {
        await s.runner.reset();
      } catch {
        // start already provides a fresh process
      }
      s.status = "ready";
      s.error = null;
      s.lastResult = null;
      codeLog.audit("session.restart", userId, {}, { sessionId });
      return this.toSnapshot(s);
    } catch (err) {
      s.status = "error";
      s.error = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  async uploadFile(
    sessionId: string,
    userId: string,
    input: UploadFileInput
  ): Promise<GeneratedFile> {
    const s = this.getOwned(sessionId, userId);
    const file = await s.files.upload(input);
    s.knownPaths.add(file.path);
    s.updatedAt = nowIso();
    codeLog.audit(
      "session.upload",
      userId,
      { name: file.name, size: file.size },
      { sessionId }
    );
    this.emit(s, {
      type: "file",
      sessionId,
      file,
      timestamp: nowIso(),
    });
    return file;
  }

  async readFile(sessionId: string, userId: string, fileId: string) {
    const s = this.getOwned(sessionId, userId);
    return s.files.readFile(fileId);
  }

  async destroySession(sessionId: string, userId: string): Promise<boolean> {
    const s = this.sessions.get(sessionId);
    if (!s || s.userId !== userId) return false;
    s.status = "closed";
    try {
      await s.runner.stop();
    } catch {
      // ignore
    }
    try {
      await s.files.destroy();
    } catch {
      // ignore
    }
    this.sessions.delete(sessionId);
    codeLog.audit("session.destroy", userId, {}, { sessionId });
    return true;
  }

  async sweepIdle(): Promise<number> {
    const limits = getLimits();
    const now = Date.now();
    let closed = 0;
    for (const s of [...this.sessions.values()]) {
      if (s.status === "running") continue;
      const updated = Date.parse(s.updatedAt) || 0;
      const created = Date.parse(s.createdAt) || 0;
      const idle = now - updated > limits.idleTtlMs;
      const expired = now - created > limits.sessionTtlMs;
      if (idle || expired) {
        await this.destroySession(s.sessionId, s.userId);
        closed += 1;
      }
    }
    if (closed) {
      codeLog.info("cleanup.sweep", "system", { closed });
    }
    return closed;
  }

  async shutdownAll(): Promise<void> {
    for (const s of [...this.sessions.values()]) {
      await this.destroySession(s.sessionId, s.userId);
    }
  }

  /**
   * Convenience for agents / research: execute Python in an isolated session.
   */
  async runPython(
    userId: string,
    code: string,
    opts: {
      sessionId?: string | null;
      timeoutMs?: number;
      onEvent?: (event: StreamEvent) => void;
    } = {}
  ): Promise<{ session: SessionSnapshot; result: ExecutionResult }> {
    const session = await this.getOrCreate(userId, opts.sessionId);
    const result = await this.execute(session.sessionId, userId, {
      code,
      timeoutMs: opts.timeoutMs,
      onEvent: opts.onEvent,
    });
    return {
      session: this.getSession(session.sessionId, userId),
      result,
    };
  }
}

export const sessionManager = new SessionManager();
