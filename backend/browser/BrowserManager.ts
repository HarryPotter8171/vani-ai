/**
 * BrowserManager — agent/tool entry point for production browser automation.
 * Permission checks are mandatory and never bypassed.
 */

import { randomUUID } from "node:crypto";
import type { Browser } from "playwright";
import {
  BrowserSession,
  launchSharedBrowser,
} from "./BrowserSession.ts";
import { BrowserExecutor, buildBrowserPlan } from "./BrowserExecutor.ts";
import { BrowserRecorder } from "./BrowserRecorder.ts";
import { browserPermissions } from "./BrowserPermissions.ts";
import type {
  BrowserEngine,
  BrowserPlan,
  BrowserRunSnapshot,
  BrowserSessionMode,
  PermissionChoice,
  RunBrowserRequest,
} from "./types.ts";
import { browserLog } from "./logger.ts";
import {
  DEFAULT_APPROVAL_TIMEOUT_MS,
  MAX_SESSIONS_PER_USER,
} from "./safety.ts";

type ActiveRun = {
  runId: string;
  userId: string;
  session: BrowserSession | null;
  executor: BrowserExecutor | null;
  recorder: BrowserRecorder;
  engine: BrowserEngine;
  mode: BrowserSessionMode;
  headless: boolean;
  persistCookies: boolean;
  goal: string;
  plan: BrowserPlan | null;
  createdAt: string;
  updatedAt: string;
  error: string | null;
  report: Record<string, unknown> | null;
  approvalId: string | null;
  cleanupAfter: boolean;
  statusOverride:
    | "awaiting_approval"
    | "planning"
    | "running"
    | "completed"
    | "failed"
    | "cancelled"
    | null;
};

function id(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
}

export class BrowserManager {
  private runs = new Map<string, ActiveRun>();
  private pools = new Map<BrowserEngine, Browser>();
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

  private async getSharedBrowser(engine: BrowserEngine, headless: boolean) {
    let browser = this.pools.get(engine);
    if (browser && browser.isConnected()) return browser;
    browser = await launchSharedBrowser(engine, headless);
    this.pools.set(engine, browser);
    browserLog.info("manager", "Launched shared browser pool", { engine });
    return browser;
  }

  private countUserSessions(userId: string): number {
    let n = 0;
    for (const run of this.runs.values()) {
      if (run.userId === userId && run.session && !run.session.isClosed()) n++;
    }
    return n;
  }

  listRuns(userId: string): BrowserRunSnapshot[] {
    return [...this.runs.values()]
      .filter((r) => r.userId === userId)
      .map((r) => this.toSnapshot(r));
  }

  getRun(runId: string, userId?: string): BrowserRunSnapshot | null {
    const run = this.runs.get(runId);
    if (!run) return null;
    if (userId && run.userId !== userId) return null;
    return this.toSnapshot(run);
  }

  getScreenshot(runId: string, screenshotId: string, userId?: string) {
    const run = this.runs.get(runId);
    if (!run) return null;
    if (userId && run.userId !== userId) return null;
    return run.recorder.getScreenshot(screenshotId);
  }

  /**
   * Primary API used by tools and AI agents.
   * Blocks until approval (if required) and execution finish.
   */
  async runAutomation(req: RunBrowserRequest): Promise<{
    ok: boolean;
    runId: string;
    needsApproval?: boolean;
    approval?: ReturnType<typeof browserPermissions.getPendingApproval>;
    snapshot: BrowserRunSnapshot;
    report?: Record<string, unknown>;
    error?: string;
  }> {
    const run = this.createRunShell(req);
    this.runs.set(run.runId, run);

    try {
      const plan = this.planFor(run, req);
      const origin = plan.origin || "about:blank";

      const allowed = await this.ensureApproved(run, plan, origin, req);
      if (!allowed.ok) {
        return {
          ok: false,
          runId: run.runId,
          needsApproval: allowed.needsApproval,
          approval: allowed.approval,
          error: allowed.error,
          snapshot: this.toSnapshot(run),
        };
      }

      const outcome = await this.executePlan(run, plan);
      return {
        ok: outcome.ok,
        runId: run.runId,
        snapshot: this.toSnapshot(run),
        report: outcome.report,
        error: outcome.error,
      };
    } catch (err) {
      return this.failRun(run, err);
    }
  }

  /**
   * Non-blocking start for the Browser Panel UI.
   * Returns immediately when approval is required; call resolveApproval to continue.
   */
  async startAutomation(req: RunBrowserRequest): Promise<{
    ok: boolean;
    runId: string;
    needsApproval?: boolean;
    approval?: ReturnType<typeof browserPermissions.getPendingApproval>;
    snapshot: BrowserRunSnapshot;
    error?: string;
  }> {
    const run = this.createRunShell(req);
    this.runs.set(run.runId, run);

    try {
      const plan = this.planFor(run, req);
      const origin = plan.origin || "about:blank";

      const decision = await browserPermissions.checkSitePermission(
        req.userId,
        origin,
        plan.steps
      );

      if (req.autoApprove === "deny") {
        run.statusOverride = "cancelled";
        run.error = "Denied by autoApprove";
        return {
          ok: false,
          runId: run.runId,
          error: run.error,
          snapshot: this.toSnapshot(run),
        };
      }

      if (req.autoApprove === "always_allow") {
        await browserPermissions.alwaysAllow(req.userId, origin);
      } else if (req.autoApprove === "allow_once") {
        // proceed
      } else if (!decision.allowed) {
        if (decision.reason === "always_deny") {
          run.statusOverride = "failed";
          run.error = decision.message;
          return {
            ok: false,
            runId: run.runId,
            error: run.error,
            snapshot: this.toSnapshot(run),
          };
        }

        const approvalId = id("appr");
        run.approvalId = approvalId;
        run.statusOverride = "awaiting_approval";
        run.recorder.push("approval", "Waiting for user approval", {
          meta: { origin, approvalId },
        });

        void browserPermissions
          .waitForApproval({
            approvalId,
            runId: run.runId,
            userId: req.userId,
            origin,
            goal: plan.goal,
            steps: plan.steps,
            timeoutMs: req.approvalTimeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS,
          })
          .then(async (choice) => {
            if (choice === "deny") {
              run.statusOverride = "cancelled";
              run.error = "User denied browser automation";
              run.recorder.push("warning", run.error);
              return;
            }
            run.approvalId = null;
            run.statusOverride = null;
            await this.executePlan(run, plan);
          })
          .catch((err) => {
            run.statusOverride = "failed";
            run.error = err instanceof Error ? err.message : String(err);
            run.recorder.push("failed", run.error);
          });

        return {
          ok: false,
          runId: run.runId,
          needsApproval: true,
          approval: browserPermissions.getPendingApproval(approvalId),
          error: "User approval required",
          snapshot: this.toSnapshot(run),
        };
      }

      // Approved via always_allow or autoApprove — execute in background.
      void this.executePlan(run, plan).catch((err) => this.failRun(run, err));

      return {
        ok: true,
        runId: run.runId,
        snapshot: this.toSnapshot(run),
      };
    } catch (err) {
      return this.failRun(run, err);
    }
  }

  async resolveApproval(
    approvalId: string,
    userId: string,
    choice: PermissionChoice
  ) {
    return browserPermissions.resolveApproval(approvalId, userId, choice);
  }

  pause(runId: string, userId: string): BrowserRunSnapshot {
    const run = this.requireRun(runId, userId);
    run.executor?.pause();
    run.updatedAt = new Date().toISOString();
    return this.toSnapshot(run);
  }

  resume(runId: string, userId: string): BrowserRunSnapshot {
    const run = this.requireRun(runId, userId);
    run.executor?.resume();
    run.updatedAt = new Date().toISOString();
    return this.toSnapshot(run);
  }

  async stop(runId: string, userId: string): Promise<BrowserRunSnapshot> {
    const run = this.requireRun(runId, userId);
    run.executor?.stop();
    run.statusOverride = "cancelled";
    if (run.approvalId) {
      browserPermissions.cancelApproval(run.approvalId, "cancelled by user");
      run.approvalId = null;
    }
    if (run.session) {
      await run.session.close({ persist: false }).catch(() => undefined);
      run.session = null;
    }
    run.updatedAt = new Date().toISOString();
    return this.toSnapshot(run);
  }

  async cleanupRun(runId: string, userId: string): Promise<boolean> {
    const run = this.runs.get(runId);
    if (!run || run.userId !== userId) return false;
    if (run.session) {
      await run.session.close({ persist: run.mode === "persistent" });
    }
    this.runs.delete(runId);
    return true;
  }

  async getLiveSnapshot(
    runId: string,
    userId: string
  ): Promise<BrowserRunSnapshot | null> {
    const run = this.runs.get(runId);
    if (!run || run.userId !== userId) return null;
    const snap = this.toSnapshot(run);
    if (run.session && !run.session.isClosed()) {
      snap.currentUrl = await run.session
        .currentUrl()
        .catch(() => "about:blank");
    } else if (run.report && typeof run.report.url === "string") {
      snap.currentUrl = run.report.url;
    } else if (run.plan?.steps?.find((s) => s.url)?.url) {
      snap.currentUrl = run.plan.steps.find((s) => s.url)!.url!;
    }
    return snap;
  }

  private createRunShell(req: RunBrowserRequest): ActiveRun {
    const engine: BrowserEngine = req.engine || "chromium";
    const mode: BrowserSessionMode =
      req.mode || (req.persistCookies ? "persistent" : "isolated");
    const recorder = new BrowserRecorder();
    recorder.push("info", "Planning browser steps...");

    return {
      runId: id("run"),
      userId: req.userId,
      session: null,
      executor: null,
      recorder,
      engine,
      mode,
      headless: req.headless !== false,
      persistCookies: Boolean(req.persistCookies),
      goal: String(req.goal || req.url || "Browser task"),
      plan: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: null,
      report: null,
      approvalId: null,
      cleanupAfter: mode !== "persistent",
      statusOverride: "planning",
    };
  }

  private planFor(run: ActiveRun, req: RunBrowserRequest): BrowserPlan {
    const plan = buildBrowserPlan({
      goal: req.goal,
      steps: req.steps,
      url: req.url,
    });
    plan.origin = browserPermissions.resolveOriginFromPlan(
      plan.goal,
      plan.steps,
      req.url
    );
    run.plan = plan;
    run.goal = plan.goal;
    run.updatedAt = new Date().toISOString();
    return plan;
  }

  private async ensureApproved(
    run: ActiveRun,
    plan: BrowserPlan,
    origin: string,
    req: RunBrowserRequest
  ): Promise<{
    ok: boolean;
    needsApproval?: boolean;
    approval?: ReturnType<typeof browserPermissions.getPendingApproval>;
    error?: string;
  }> {
    const decision = await browserPermissions.checkSitePermission(
      req.userId,
      origin,
      plan.steps
    );

    if (req.autoApprove === "deny") {
      run.statusOverride = "cancelled";
      run.error = "Denied by autoApprove";
      return { ok: false, error: run.error };
    }

    if (req.autoApprove === "always_allow") {
      await browserPermissions.alwaysAllow(req.userId, origin);
      return { ok: true };
    }
    if (req.autoApprove === "allow_once") {
      return { ok: true };
    }

    if (decision.allowed) return { ok: true };

    if (decision.reason === "always_deny") {
      run.statusOverride = "failed";
      run.error = decision.message;
      run.recorder.push("failed", decision.message);
      return { ok: false, error: decision.message };
    }

    if (req.dryRun) {
      const approvalId = id("appr");
      run.approvalId = approvalId;
      run.statusOverride = "awaiting_approval";
      run.recorder.push("approval", "Waiting for user approval", {
        meta: { origin, approvalId },
      });
      void browserPermissions
        .waitForApproval({
          approvalId,
          runId: run.runId,
          userId: req.userId,
          origin,
          goal: plan.goal,
          steps: plan.steps,
          timeoutMs: req.approvalTimeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS,
        })
        .catch(() => undefined);

      return {
        ok: false,
        needsApproval: true,
        approval: browserPermissions.getPendingApproval(approvalId),
        error: "User approval required",
      };
    }

    const approvalId = id("appr");
    run.approvalId = approvalId;
    run.statusOverride = "awaiting_approval";
    run.recorder.push("approval", "Waiting for user approval", {
      meta: { origin, approvalId },
    });

    try {
      const choice = await browserPermissions.waitForApproval({
        approvalId,
        runId: run.runId,
        userId: req.userId,
        origin,
        goal: plan.goal,
        steps: plan.steps,
        timeoutMs: req.approvalTimeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS,
      });
      run.approvalId = null;
      if (choice === "deny") {
        run.statusOverride = "cancelled";
        run.error = "User denied browser automation";
        run.recorder.push("warning", run.error);
        return { ok: false, error: run.error };
      }
      run.statusOverride = null;
      return { ok: true };
    } catch (err) {
      run.statusOverride = "failed";
      run.error = err instanceof Error ? err.message : String(err);
      run.recorder.push("failed", run.error);
      return { ok: false, error: run.error };
    }
  }

  private async executePlan(run: ActiveRun, plan: BrowserPlan) {
    if (this.countUserSessions(run.userId) >= MAX_SESSIONS_PER_USER) {
      await this.sweepIdle(run.userId);
    }
    if (this.countUserSessions(run.userId) >= MAX_SESSIONS_PER_USER) {
      throw new Error("Too many active browser sessions for this user");
    }

    run.statusOverride = "running";
    const shared = await this.getSharedBrowser(run.engine, run.headless);
    const session = new BrowserSession(
      {
        userId: run.userId,
        engine: run.engine,
        mode: run.mode,
        persistCookies: run.persistCookies,
        headless: run.headless,
      },
      shared
    );
    run.session = session;

    const executor = new BrowserExecutor(session, run.recorder);
    run.executor = executor;
    run.updatedAt = new Date().toISOString();

    const outcome = await executor.run(plan);
    run.report = outcome.report;
    run.error = outcome.error || null;
    run.statusOverride = outcome.ok
      ? "completed"
      : outcome.error === "cancelled"
        ? "cancelled"
        : "failed";
    run.updatedAt = new Date().toISOString();

    if (run.cleanupAfter) {
      await session.close({ persist: false });
      run.session = null;
      run.executor = null;
    } else {
      await session.persistStorage().catch(() => undefined);
    }

    return outcome;
  }

  private failRun(run: ActiveRun, err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    run.error = message;
    run.statusOverride = "failed";
    run.updatedAt = new Date().toISOString();
    run.recorder.push("failed", message);
    browserLog.error("manager", "Automation failed", {
      runId: run.runId,
      error: message,
    });
    if (run.session) {
      void run.session.close({ persist: false }).catch(() => undefined);
      run.session = null;
    }
    return {
      ok: false as const,
      runId: run.runId,
      error: message,
      snapshot: this.toSnapshot(run),
    };
  }

  private requireRun(runId: string, userId: string): ActiveRun {
    const run = this.runs.get(runId);
    if (!run || run.userId !== userId) {
      throw new Error("Browser run not found");
    }
    return run;
  }

  private toSnapshot(run: ActiveRun): BrowserRunSnapshot {
    const executorStatus = run.executor?.getStatus();
    const status =
      run.statusOverride ||
      executorStatus ||
      (run.error ? "failed" : run.report ? "completed" : "idle");

    const pending =
      (run.approvalId
        ? browserPermissions.getPendingApproval(run.approvalId)
        : null) ||
      browserPermissions
        .listPendingApprovals(run.userId)
        .find((a) => a.runId === run.runId) ||
      null;

    return {
      runId: run.runId,
      sessionId: run.session?.id || null,
      userId: run.userId,
      status,
      goal: run.goal,
      engine: run.engine,
      mode: run.mode,
      currentUrl: "about:blank",
      plan: run.plan || run.executor?.getPlan() || null,
      timeline: run.recorder.getTimeline(),
      screenshots: run.recorder.screenshotSummaries(run.runId),
      latestScreenshotId: run.recorder.latestScreenshot()?.id || null,
      error: run.error,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      canPause: status === "running",
      canResume: status === "paused",
      canStop:
        status === "running" ||
        status === "paused" ||
        status === "awaiting_approval" ||
        status === "planning",
      pendingApproval: pending,
    };
  }

  private async sweepIdle(userId?: string): Promise<void> {
    for (const [runId, run] of this.runs) {
      if (userId && run.userId !== userId) continue;
      const session = run.session;
      if (!session) {
        const age = Date.now() - new Date(run.updatedAt).getTime();
        if (
          age > 30 * 60_000 &&
          (run.statusOverride === "completed" ||
            run.statusOverride === "failed" ||
            run.statusOverride === "cancelled")
        ) {
          this.runs.delete(runId);
        }
        continue;
      }
      if (session.isClosed() || session.isIdle()) {
        await session
          .close({ persist: run.mode === "persistent" })
          .catch(() => undefined);
        run.session = null;
        run.executor = null;
      }
    }
  }

  async shutdown(): Promise<void> {
    this.stopCleanupMonitor();
    for (const run of this.runs.values()) {
      if (run.session) {
        await run.session.close({ persist: false }).catch(() => undefined);
      }
    }
    this.runs.clear();
    for (const browser of this.pools.values()) {
      await browser.close().catch(() => undefined);
    }
    this.pools.clear();
  }
}

export const browserManager = new BrowserManager();
