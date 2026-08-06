/**
 * BrowserRecorder — live timeline + screenshot history for a run.
 */

import { randomUUID } from "node:crypto";
import type {
  ScreenshotRecord,
  TimelineEvent,
  TimelineEventKind,
} from "./types.ts";
import { MAX_SCREENSHOTS_PER_RUN } from "./safety.ts";

export class BrowserRecorder {
  private timeline: TimelineEvent[] = [];
  private screenshots: ScreenshotRecord[] = [];
  private listeners = new Set<(event: TimelineEvent) => void>();

  reset(): void {
    this.timeline = [];
    this.screenshots = [];
  }

  onEvent(listener: (event: TimelineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  push(
    kind: TimelineEventKind,
    message: string,
    meta?: { stepId?: string; meta?: Record<string, unknown> }
  ): TimelineEvent {
    const event: TimelineEvent = {
      id: `evt_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      kind,
      message,
      at: new Date().toISOString(),
      stepId: meta?.stepId,
      meta: meta?.meta,
    };
    this.timeline.push(event);
    // Cap timeline growth for long runs.
    if (this.timeline.length > 200) {
      this.timeline = this.timeline.slice(-160);
    }
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // ignore
      }
    }
    return event;
  }

  addScreenshot(input: {
    url: string;
    data: string;
    mimeType?: string;
    stepId?: string;
  }): ScreenshotRecord {
    const record: ScreenshotRecord = {
      id: `shot_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      at: new Date().toISOString(),
      url: input.url || "",
      stepId: input.stepId,
      mimeType: input.mimeType || "image/jpeg",
      data: input.data,
    };
    this.screenshots.push(record);
    while (this.screenshots.length > MAX_SCREENSHOTS_PER_RUN) {
      this.screenshots.shift();
    }
    this.push("screenshot", "Captured screenshot", {
      stepId: input.stepId,
      meta: { screenshotId: record.id, url: record.url },
    });
    return record;
  }

  getTimeline(): TimelineEvent[] {
    return [...this.timeline];
  }

  getScreenshots(): ScreenshotRecord[] {
    return [...this.screenshots];
  }

  getScreenshot(id: string): ScreenshotRecord | null {
    return this.screenshots.find((s) => s.id === id) || null;
  }

  latestScreenshot(): ScreenshotRecord | null {
    return this.screenshots[this.screenshots.length - 1] || null;
  }

  /** Public snapshot without heavy base64 payloads. */
  screenshotSummaries(runId: string): Array<
    Omit<ScreenshotRecord, "data"> & { previewUrl: string }
  > {
    return this.screenshots.map((s) => ({
      id: s.id,
      at: s.at,
      url: s.url,
      stepId: s.stepId,
      mimeType: s.mimeType,
      previewUrl: `/api/browser/runs/${runId}/screenshots/${s.id}`,
    }));
  }
}
