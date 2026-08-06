/**
 * PythonRunner — long-lived sandboxed Python kernel with NDJSON IPC.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  getKernelScriptPath,
  getLimits,
  getPythonBinary,
} from "./config.ts";
import { codeLog } from "./logger.ts";
import type { StreamEvent } from "./types.ts";

type Pending = {
  executionId: string;
  resolve: (value: KernelRunResult) => void;
  reject: (err: Error) => void;
  stdout: string;
  stderr: string;
  error: string | null;
  resultPreview: string | null;
  plots: Array<{ path: string; mimeType: string; name: string }>;
  files: Array<{ path: string; mimeType: string; name: string }>;
  onEvent?: (event: StreamEvent) => void;
  sessionId: string;
  userId: string;
  timer: ReturnType<typeof setTimeout> | null;
  startedAt: number;
  // When set, proc-exit due to an interrupt triggered by the JS timeout
  // should still be reported as `timedOut: true` (not just interrupted).
  timedOut?: boolean;
  timedOutError?: string;
};

export type KernelRunResult = {
  executionId: string;
  ok: boolean;
  stdout: string;
  stderr: string;
  error: string | null;
  resultPreview: string | null;
  plots: Array<{ path: string; mimeType: string; name: string }>;
  files: Array<{ path: string; mimeType: string; name: string }>;
  durationMs: number;
  timedOut: boolean;
  interrupted: boolean;
};

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 24)}\n...[truncated]...`;
}

export class PythonRunner {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  private pending: Pending | null = null;
  private ready = false;
  private closed = false;
  private starting: Promise<void> | null = null;

  private readonly userId: string;
  private readonly sessionId: string;
  private readonly workspace: string;

  constructor(userId: string, sessionId: string, workspace: string) {
    this.userId = userId;
    this.sessionId = sessionId;
    this.workspace = workspace;
  }

  get isAlive(): boolean {
    return Boolean(this.proc && !this.proc.killed && this.proc.exitCode == null);
  }

  get isReady(): boolean {
    return this.ready && this.isAlive;
  }

  async start(): Promise<void> {
    if (this.isReady) return;
    if (this.starting) return this.starting;
    this.starting = this._start().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async _start(): Promise<void> {
    const python = getPythonBinary();
    const script = getKernelScriptPath();
    if (!fs.existsSync(script)) {
      throw new Error(`Kernel script missing: ${script}`);
    }

    const limits = getLimits();
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      VANI_CI_WORKSPACE: this.workspace,
      VANI_CI_MEMORY_MB: String(limits.memoryMb),
      VANI_CI_CPU_SECONDS: String(limits.cpuSeconds),
      VANI_CI_MAX_OUTPUT_CHARS: String(limits.maxOutputChars),
      VANI_CI_MAX_PLOTS: String(limits.maxPlots),
      // Prevent user code from inheriting proxy / API keys
      HTTP_PROXY: "",
      HTTPS_PROXY: "",
      ALL_PROXY: "",
      http_proxy: "",
      https_proxy: "",
      OPENAI_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      GOOGLE_API_KEY: "",
      TAVILY_API_KEY: "",
      PYTHONNOUSERSITE: "1",
      PYTHONDONTWRITEBYTECODE: "1",
      MPLBACKEND: "Agg",
      HOME: this.workspace,
      TMPDIR: path.join(this.workspace, "tmp"),
      TMP: path.join(this.workspace, "tmp"),
      TEMP: path.join(this.workspace, "tmp"),
    };

    fs.mkdirSync(path.join(this.workspace, "tmp"), { recursive: true });

    this.closed = false;
    this.ready = false;
    this.buffer = "";

    const attempts = [
      this.tryUnshareArgs(python, script),
      { cmd: python, args: ["-u", script] },
    ].filter(Boolean) as Array<{ cmd: string; args: string[] }>;

    // Track the final spawn attempt so we can log/debug without relying on
    // loop-scoped variables (previously caused a ReferenceError).
    let selectedAttempt: { cmd: string; args: string[] } | null = null;

    let lastErr: Error | null = null;
    for (const attempt of attempts) {
      try {
        this.proc = spawn(attempt.cmd, attempt.args, {
          cwd: this.workspace,
          env,
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
        });
        selectedAttempt = attempt;
        // Surface immediate spawn failures (e.g. unshare not permitted).
        await new Promise<void>((resolve, reject) => {
          const onError = (err: Error) => {
            cleanup();
            reject(err);
          };
          const onSpawn = () => {
            cleanup();
            resolve();
          };
          const cleanup = () => {
            this.proc?.off("error", onError);
            this.proc?.off("spawn", onSpawn);
          };
          this.proc?.once("error", onError);
          this.proc?.once("spawn", onSpawn);
          // Older Node may not emit "spawn"; resolve on next tick if still alive.
          setTimeout(() => {
            if (this.proc && this.proc.exitCode == null && !this.proc.killed) {
              cleanup();
              resolve();
            }
          }, 20);
        });
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        this.proc = null;
      }
    }
    if (!this.proc) {
      throw lastErr || new Error("Unable to spawn Python kernel");
    }

    this.proc.stdout.setEncoding("utf8");
    this.proc.stderr.setEncoding("utf8");

    this.proc.stdout.on("data", (chunk: string) => this.onStdout(chunk));
    this.proc.stderr.on("data", (chunk: string) => {
      // Kernel bootstrap errors before protocol is up
      codeLog.warn(
        "kernel.stderr",
        this.userId,
        { chunk: String(chunk).slice(0, 500) },
        { sessionId: this.sessionId }
      );
      if (this.pending) {
        this.pending.stderr = truncate(
          this.pending.stderr + chunk,
          getLimits().maxOutputChars
        );
        this.pending.onEvent?.({
          type: "stderr",
          sessionId: this.sessionId,
          executionId: this.pending.executionId,
          data: chunk,
          timestamp: new Date().toISOString(),
        });
      }
    });

    this.proc.on("exit", (code, signal) => {
      this.ready = false;
      const err = new Error(
        `Kernel exited (code=${code ?? "null"}, signal=${signal ?? "null"})`
      );
      if (this.pending) {
        const p = this.pending;
        this.clearPending(true);
        p.error = p.error || p.timedOutError || err.message;
        p.resolve({
          executionId: p.executionId,
          ok: false,
          stdout: p.stdout,
          stderr: p.stderr,
          error: p.error,
          resultPreview: p.resultPreview,
          plots: p.plots,
          files: p.files,
          durationMs: Date.now() - p.startedAt,
          timedOut: Boolean(p.timedOut),
          interrupted: signal === "SIGINT" || signal === "SIGTERM",
        });
      }
    });

    // Wait for ready event (or fail)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Kernel failed to start (timeout)"));
      }, 15_000);
      const check = setInterval(() => {
        if (this.ready) {
          clearInterval(check);
          clearTimeout(timer);
          resolve();
        } else if (!this.isAlive) {
          clearInterval(check);
          clearTimeout(timer);
          reject(new Error("Kernel failed to start"));
        }
      }, 50);
    });

    codeLog.audit(
      "kernel.start",
      this.userId,
      {
        python,
        kernelCmd: selectedAttempt?.cmd || null,
        // args can be long; keep logging bounded.
        kernelArgs: selectedAttempt?.args ? selectedAttempt.args.slice(0, 5) : null,
      },
      { sessionId: this.sessionId }
    );
  }

  private tryUnshareArgs(
    python: string,
    script: string
  ): { cmd: string; args: string[] } | null {
    if (process.platform !== "linux") return null;
    if (process.env.VANI_CI_DISABLE_UNSHARE === "true") return null;
    // unshare -n isolates the network namespace (no outbound networking).
    // Requires CAP_SYS_ADMIN or unprivileged user namespaces — fall back if spawn fails.
    const unsharePath = "/usr/bin/unshare";
    if (!fs.existsSync(unsharePath)) return null;
    return {
      cmd: unsharePath,
      args: ["-n", "--", python, "-u", script],
    };
  }

  private onStdout(chunk: string) {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      this.handleMessage(msg);
    }
  }

  private handleMessage(msg: Record<string, unknown>) {
    const type = String(msg.type || "");

    if (type === "ready") {
      this.ready = true;
      return;
    }

    const p = this.pending;
    if (!p) return;

    const limits = getLimits();
    const data = typeof msg.data === "string" ? msg.data : "";

    if (type === "stdout") {
      p.stdout = truncate(p.stdout + data, limits.maxOutputChars);
      p.onEvent?.({
        type: "stdout",
        sessionId: this.sessionId,
        executionId: p.executionId,
        data,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    if (type === "stderr") {
      p.stderr = truncate(p.stderr + data, limits.maxOutputChars);
      p.onEvent?.({
        type: "stderr",
        sessionId: this.sessionId,
        executionId: p.executionId,
        data,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    if (type === "result") {
      p.resultPreview = truncate(data, 4000);
      p.onEvent?.({
        type: "result",
        sessionId: this.sessionId,
        executionId: p.executionId,
        data: p.resultPreview || undefined,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    if (type === "plot") {
      const plotPath = String(msg.path || "");
      const mimeType = String(msg.mimeType || "image/png");
      const name = String(msg.name || path.basename(plotPath));
      if (plotPath) {
        p.plots.push({ path: plotPath, mimeType, name });
      }
      return;
    }
    if (type === "file") {
      const filePath = String(msg.path || "");
      const mimeType = String(msg.mimeType || "application/octet-stream");
      const name = String(msg.name || path.basename(filePath));
      if (filePath) p.files.push({ path: filePath, mimeType, name });
      return;
    }
    if (type === "error") {
      p.error = truncate(data || "Execution error", limits.maxOutputChars);
      p.onEvent?.({
        type: "error",
        sessionId: this.sessionId,
        executionId: p.executionId,
        error: p.error,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    if (type === "done" || type === "pong") {
      if (type === "pong") return;
      const durationMs = Date.now() - p.startedAt;
      const result: KernelRunResult = {
        executionId: p.executionId,
        ok: !p.error,
        stdout: p.stdout,
        stderr: p.stderr,
        error: p.error,
        resultPreview: p.resultPreview,
        plots: p.plots,
        files: p.files,
        durationMs,
        timedOut: false,
        interrupted: false,
      };
      this.clearPending(false);
      p.resolve(result);
    }
  }

  private clearPending(fromExit: boolean) {
    if (!this.pending) return;
    if (this.pending.timer) clearTimeout(this.pending.timer);
    if (!fromExit) this.pending = null;
    else this.pending = null;
  }

  private send(payload: Record<string, unknown>) {
    if (!this.proc || !this.isAlive) throw new Error("Kernel is not running");
    this.proc.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  async execute(opts: {
    code: string;
    timeoutMs?: number;
    onEvent?: (event: StreamEvent) => void;
  }): Promise<KernelRunResult> {
    await this.start();
    if (this.pending) throw new Error("Kernel is busy");

    const limits = getLimits();
    const executionId = `cie_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
    const timeoutMs = Math.min(
      Math.max(opts.timeoutMs || limits.timeoutMs, 1000),
      limits.timeoutMs
    );

    return new Promise<KernelRunResult>((resolve, reject) => {
      const pending: Pending = {
        executionId,
        resolve,
        reject,
        stdout: "",
        stderr: "",
        error: null,
        resultPreview: null,
        plots: [],
        files: [],
        onEvent: opts.onEvent,
        sessionId: this.sessionId,
        userId: this.userId,
        timer: null,
        startedAt: Date.now(),
      };
      this.pending = pending;

      pending.timer = setTimeout(() => {
        if (this.pending !== pending) return;
        // Mark the pending execution as "timed out" before we kill the
        // kernel so whichever handler resolves the promise first (proc-exit
        // vs this timeout handler) reports consistent status.
        pending.timedOut = true;
        pending.timedOutError =
          pending.error || `Execution timed out after ${timeoutMs}ms`;
        pending.error = pending.timedOutError;
        void this.interrupt().finally(() => {
          if (this.pending !== pending) return;
          const result: KernelRunResult = {
            executionId,
            ok: false,
            stdout: pending.stdout,
            stderr: pending.stderr,
            error: pending.error || `Execution timed out after ${timeoutMs}ms`,
            resultPreview: pending.resultPreview,
            plots: pending.plots,
            files: pending.files,
            durationMs: Date.now() - pending.startedAt,
            timedOut: true,
            interrupted: true,
          };
          this.clearPending(false);
          resolve(result);
        });
      }, timeoutMs + 500);

      try {
        this.send({
          cmd: "execute",
          id: executionId,
          code: opts.code,
          timeout_ms: timeoutMs,
        });
        opts.onEvent?.({
          type: "status",
          sessionId: this.sessionId,
          executionId,
          status: "running",
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        this.clearPending(false);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  async interrupt(): Promise<void> {
    if (!this.proc || !this.isAlive) return;
    codeLog.audit("kernel.interrupt", this.userId, {}, { sessionId: this.sessionId });
    try {
      this.proc.kill("SIGINT");
    } catch {
      // ignore
    }
    // Give the kernel a moment; if still busy, escalate.
    await new Promise((r) => setTimeout(r, 200));
    if (this.pending && this.proc && this.isAlive) {
      try {
        this.proc.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
  }

  async reset(): Promise<void> {
    await this.start();
    if (this.pending) await this.interrupt();
    await new Promise<void>((resolve, reject) => {
      const executionId = `cir_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
      const timer = setTimeout(() => reject(new Error("Reset timed out")), 10_000);
      this.pending = {
        executionId,
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
        stdout: "",
        stderr: "",
        error: null,
        resultPreview: null,
        plots: [],
        files: [],
        sessionId: this.sessionId,
        userId: this.userId,
        timer: null,
        startedAt: Date.now(),
      };
      try {
        this.send({ cmd: "reset", id: executionId });
      } catch (err) {
        clearTimeout(timer);
        this.pending = null;
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    }).catch(async () => {
      // Hard restart if soft reset fails
      await this.stop();
      await this.start();
    });
  }

  async stop(): Promise<void> {
    this.closed = true;
    this.ready = false;
    if (this.pending) {
      const p = this.pending;
      this.clearPending(false);
      p.resolve({
        executionId: p.executionId,
        ok: false,
        stdout: p.stdout,
        stderr: p.stderr,
        error: p.error || "Kernel stopped",
        resultPreview: p.resultPreview,
        plots: p.plots,
        files: p.files,
        durationMs: Date.now() - p.startedAt,
        timedOut: false,
        interrupted: true,
      });
    }
    if (!this.proc) return;
    const proc = this.proc;
    this.proc = null;
    try {
      proc.stdin.write(`${JSON.stringify({ cmd: "shutdown", id: "shutdown" })}\n`);
    } catch {
      // ignore
    }
    try {
      proc.kill("SIGTERM");
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 150));
    try {
      if (proc.exitCode == null) proc.kill("SIGKILL");
    } catch {
      // ignore
    }
  }
}
