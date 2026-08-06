/**
 * BrowserExecutor — Planner → Steps → Execute → Verify → Report
 */

import { randomUUID } from "node:crypto";
import type {
  BrowserActionInput,
  BrowserPlan,
  BrowserRunStatus,
  BrowserStep,
  BrowserStepAction,
} from "./types.ts";
import { BrowserSession } from "./BrowserSession.ts";
import { BrowserRecorder } from "./BrowserRecorder.ts";
import { markDangerousSteps, MAX_STEPS_PER_RUN } from "./safety.ts";
import { browserLog } from "./logger.ts";

/** Only extract may run in parallel — screenshot/wait serialize for stability. */
const PARALLEL_SAFE = new Set<BrowserStepAction>(["extract"]);

function stepId(): string {
  return `st_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

function planId(): string {
  return `plan_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function labelFor(action: BrowserStepAction, input: BrowserActionInput): string {
  if (input.label?.trim()) return input.label.trim();
  switch (action) {
    case "open":
    case "navigate":
      return `Open ${input.url || "page"}`;
    case "click":
      return `Click ${input.selector || "element"}`;
    case "fill":
      return `Fill ${input.selector || "field"}`;
    case "type":
      return `Type into ${input.selector || "field"}`;
    case "upload":
      return `Upload file`;
    case "download":
      return `Download file`;
    case "screenshot":
      return `Take screenshot`;
    case "extract":
      return `Read page content`;
    case "wait":
      return input.selector
        ? `Wait for ${input.selector}`
        : `Wait ${input.value || "500"}ms`;
    case "scroll":
      return `Scroll ${input.value || "down"}`;
    case "switch_tab":
      return `Switch tab`;
    case "handle_dialog":
      return `Handle dialog (${input.value || "dismiss"})`;
    case "press":
      return `Press ${input.value || "Enter"}`;
    case "hover":
      return `Hover ${input.selector || "element"}`;
    case "select":
      return `Select option`;
    default:
      return action;
  }
}

function timelineKind(action: BrowserStepAction) {
  switch (action) {
    case "open":
    case "navigate":
      return "loading" as const;
    case "click":
    case "hover":
    case "press":
    case "select":
      return "clicking" as const;
    case "fill":
    case "type":
      return "typing" as const;
    case "extract":
      return "reading" as const;
    case "upload":
      return "uploading" as const;
    case "download":
      return "downloading" as const;
    case "scroll":
      return "scrolling" as const;
    case "wait":
      return "waiting" as const;
    case "screenshot":
      return "screenshot" as const;
    default:
      return "info" as const;
  }
}

/**
 * Build a structured plan from explicit steps and/or a natural-language goal.
 */
export function buildBrowserPlan(input: {
  goal?: string;
  steps?: BrowserActionInput[];
  url?: string;
}): BrowserPlan {
  const goal = String(input.goal || "").trim() || "Browser automation task";
  const rawSteps: BrowserActionInput[] = [];

  if (Array.isArray(input.steps) && input.steps.length) {
    for (const step of input.steps.slice(0, MAX_STEPS_PER_RUN)) {
      rawSteps.push(step);
    }
  } else if (input.url) {
    rawSteps.push({ action: "open", url: input.url });
    rawSteps.push({ action: "extract" });
    rawSteps.push({ action: "screenshot" });
  } else {
    // Lightweight goal → steps planner (deterministic, safe defaults).
    rawSteps.push(...planFromGoal(goal));
  }

  // Ensure we always capture evidence at the end for verification.
  const hasExtract = rawSteps.some((s) => s.action === "extract");
  const hasShot = rawSteps.some((s) => s.action === "screenshot");
  if (!hasExtract) rawSteps.push({ action: "extract" });
  if (!hasShot) rawSteps.push({ action: "screenshot" });

  const steps: BrowserStep[] = markDangerousSteps(
    rawSteps.slice(0, MAX_STEPS_PER_RUN).map((s) => ({
      id: stepId(),
      action: s.action,
      label: labelFor(s.action, s),
      url: s.url,
      selector: s.selector,
      value: s.value,
      filePath: s.filePath,
      timeoutMs: s.timeoutMs,
      status: "pending" as const,
    }))
  );

  return {
    id: planId(),
    goal,
    origin: undefined,
    steps,
    createdAt: new Date().toISOString(),
  };
}

function planFromGoal(goal: string): BrowserActionInput[] {
  const urlMatch = goal.match(/https?:\/\/[^\s)]+/i);
  const steps: BrowserActionInput[] = [];

  if (urlMatch) {
    steps.push({ action: "open", url: urlMatch[0] });
  } else if (/google/i.test(goal) && /search/i.test(goal)) {
    const q =
      goal.replace(/.*search(?:\s+for)?\s+/i, "").replace(/["']/g, "").trim() ||
      goal;
    const query = encodeURIComponent(q.slice(0, 200));
    steps.push({
      action: "open",
      url: `https://www.google.com/search?q=${query}`,
    });
  } else if (/demo\s+form|form\s+demo|httpbin|the-internet/i.test(goal)) {
    steps.push({
      action: "open",
      url: "https://the-internet.herokuapp.com/login",
    });
    steps.push({
      action: "fill",
      selector: "#username",
      value: "tomsmith",
    });
    steps.push({
      action: "fill",
      selector: "#password",
      value: "SuperSecretPassword!",
    });
  }

  if (!steps.length) {
    // Without a concrete URL/steps, refuse to invent navigation.
    throw new Error(
      "Browser plan requires an explicit url, steps[], or a goal containing a URL"
    );
  }

  return steps;
}

export class BrowserExecutor {
  private session: BrowserSession;
  private recorder: BrowserRecorder;
  private status: BrowserRunStatus = "idle";
  private pauseGate: Promise<void> | null = null;
  private pauseResolve: (() => void) | null = null;
  private abortRequested = false;
  private plan: BrowserPlan | null = null;

  constructor(session: BrowserSession, recorder: BrowserRecorder) {
    this.session = session;
    this.recorder = recorder;
  }

  getStatus(): BrowserRunStatus {
    return this.status;
  }

  getPlan(): BrowserPlan | null {
    return this.plan;
  }

  setStatus(status: BrowserRunStatus): void {
    this.status = status;
  }

  pause(): void {
    if (this.status !== "running") return;
    this.status = "paused";
    this.pauseGate = new Promise((resolve) => {
      this.pauseResolve = resolve;
    });
    this.recorder.push("paused", "Execution paused");
  }

  resume(): void {
    if (this.status !== "paused") return;
    this.status = "running";
    this.pauseResolve?.();
    this.pauseResolve = null;
    this.pauseGate = null;
    this.recorder.push("resumed", "Execution resumed");
  }

  stop(): void {
    this.abortRequested = true;
    this.pauseResolve?.();
    this.pauseResolve = null;
    this.pauseGate = null;
    if (this.status === "running" || this.status === "paused") {
      this.status = "cancelled";
    }
    this.recorder.push("warning", "Stop requested");
  }

  private async awaitIfPaused(): Promise<void> {
    if (this.pauseGate) await this.pauseGate;
    if (this.abortRequested) {
      throw new Error("Browser run cancelled");
    }
  }

  async run(plan: BrowserPlan): Promise<{
    ok: boolean;
    report: Record<string, unknown>;
    error?: string;
  }> {
    this.plan = plan;
    this.abortRequested = false;
    this.status = "running";
    this.recorder.push("opening", "Opening browser...");

    await this.session.start();
    this.recorder.push("info", `Browser ready (${this.session.engine})`);

    const results: Array<Record<string, unknown>> = [];
    let lastExtract: Record<string, unknown> | null = null;
    let failedError: string | null = null;

    try {
      // Group consecutive read-only steps for limited parallel execution.
      let i = 0;
      while (i < plan.steps.length) {
        await this.awaitIfPaused();

        const step = plan.steps[i];
        if (PARALLEL_SAFE.has(step.action)) {
          const batch: BrowserStep[] = [];
          while (
            i < plan.steps.length &&
            PARALLEL_SAFE.has(plan.steps[i].action) &&
            batch.length < 3
          ) {
            batch.push(plan.steps[i]);
            i++;
          }
          const batchResults = await Promise.all(
            batch.map((s) => this.executeStep(s))
          );
          for (const r of batchResults) {
            results.push(r.result);
            if (r.extract) lastExtract = r.extract;
            if (!r.ok && !failedError) failedError = r.error || "Step failed";
          }
          continue;
        }

        const r = await this.executeStep(step);
        results.push(r.result);
        if (r.extract) lastExtract = r.extract;
        if (!r.ok) {
          failedError = r.error || "Step failed";
          break;
        }
        i++;
      }

      if (this.abortRequested) {
        this.status = "cancelled";
        this.recorder.push("warning", "Execution cancelled");
        return {
          ok: false,
          error: "cancelled",
          report: { results, extract: lastExtract, status: this.status },
        };
      }

      // Prefer the real step failure over a misleading "no page loaded" verify miss.
      if (failedError) {
        this.status = "failed";
        this.recorder.push("failed", failedError);
        return {
          ok: false,
          error: failedError,
          report: { results, extract: lastExtract },
        };
      }

      // Verify: page reachable + extract present when expected.
      const verified = await this.verify(lastExtract);
      if (!verified.ok) {
        this.status = "failed";
        this.recorder.push("failed", verified.error || "Verification failed");
        return {
          ok: false,
          error: verified.error,
          report: { results, extract: lastExtract, verification: verified },
        };
      }

      this.status = "completed";
      this.recorder.push("completed", "Completed");
      return {
        ok: true,
        report: {
          results,
          extract: lastExtract,
          verification: verified,
          url: await this.session.currentUrl(),
          title: lastExtract?.title || null,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.status = this.abortRequested ? "cancelled" : "failed";
      this.recorder.push(
        this.status === "cancelled" ? "warning" : "failed",
        message
      );
      browserLog.error("executor", "Run failed", { error: message });
      return {
        ok: false,
        error: message,
        report: { results, extract: lastExtract },
      };
    }
  }

  private async executeStep(step: BrowserStep): Promise<{
    ok: boolean;
    result: Record<string, unknown>;
    extract?: Record<string, unknown>;
    error?: string;
  }> {
    await this.awaitIfPaused();
    step.status = "running";
    step.startedAt = new Date().toISOString();
    this.recorder.push(timelineKind(step.action), `${step.label}...`, {
      stepId: step.id,
    });

    try {
      const ctrl = this.session.getController();

      // Auto-adopt popups before interactive steps when one appears quickly.
      if (step.action === "click") {
        void ctrl.adoptPopup(3_000).catch(() => null);
      }

      const result = await ctrl.execute({
        action: step.action,
        url: step.url,
        selector: step.selector,
        value: step.value,
        filePath: step.filePath,
        timeoutMs: step.timeoutMs,
      });

      if (step.action === "screenshot" && result.data) {
        this.recorder.addScreenshot({
          url: String(result.url || (await this.session.currentUrl())),
          data: String(result.data),
          mimeType: String(result.mimeType || "image/jpeg"),
          stepId: step.id,
        });
      } else if (step.action !== "screenshot") {
        // Periodic live preview after mutating steps.
        try {
          const shot = await this.session.screenshotJpeg();
          this.recorder.addScreenshot({
            url: shot.url,
            data: shot.data,
            mimeType: shot.mimeType,
            stepId: step.id,
          });
        } catch {
          // Preview failures must not fail the run.
        }
      }

      step.status = "completed";
      step.finishedAt = new Date().toISOString();
      step.result = sanitizeResult(result);

      return {
        ok: true,
        result: step.result,
        extract: step.action === "extract" ? step.result : undefined,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      step.status = "failed";
      step.error = message;
      step.finishedAt = new Date().toISOString();
      this.recorder.push("failed", message, { stepId: step.id });
      return { ok: false, result: {}, error: message };
    }
  }

  private async verify(
    extract: Record<string, unknown> | null
  ): Promise<{ ok: boolean; error?: string; checks: Record<string, unknown> }> {
    const url = await this.session.currentUrl();
    const checks: Record<string, unknown> = {
      hasUrl: Boolean(url && url !== "about:blank"),
      url,
      hasExtract: Boolean(extract && (extract.text || extract.title)),
      screenshotCount: this.recorder.getScreenshots().length,
    };

    if (!checks.hasUrl) {
      return { ok: false, error: "Verification failed: no page loaded", checks };
    }

    return { ok: true, checks };
  }
}

function sanitizeResult(result: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...result };
  if (typeof copy.data === "string" && copy.data.length > 200) {
    copy.data = `[base64 ${copy.data.length} chars]`;
  }
  if (typeof copy.text === "string" && copy.text.length > 4000) {
    copy.text = copy.text.slice(0, 4000) + "…";
  }
  return copy;
}
