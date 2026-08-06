import { describe, it, expect, beforeEach } from "vitest";
import {
  increment,
  timing,
  startTimer,
  getMetricsSnapshot,
  resetMetrics,
  setMetricsSink,
} from "../../../utils/metrics.js";

describe("utils/metrics", () => {
  beforeEach(() => {
    resetMetrics();
    setMetricsSink(null);
  });

  it("increments counters and records timings", () => {
    increment("http.requests", { statusClass: "2xx" });
    increment("http.requests", { statusClass: "2xx" });
    timing("http.request.duration", 12.5, { method: "GET" });
    timing("http.request.duration", 7.5, { method: "GET" });

    const snap = getMetricsSnapshot();
    expect(snap.counters["http.requests|statusClass=2xx"].count).toBe(2);
    expect(snap.timings["http.request.duration|method=GET"].count).toBe(2);
    expect(snap.timings["http.request.duration|method=GET"].avgMs).toBe(10);
  });

  it("startTimer records elapsed duration", async () => {
    const end = startTimer("work");
    await new Promise((r) => setTimeout(r, 5));
    const elapsed = end();
    expect(elapsed).toBeGreaterThan(0);
    expect(getMetricsSnapshot().timings.work.count).toBe(1);
  });

  it("forwards events to an external sink", () => {
    const events = [];
    setMetricsSink((e) => events.push(e));
    increment("custom", { a: "1" }, 2);
    timing("lat", 3, { b: "2" });
    expect(events).toEqual([
      { type: "counter", name: "custom", value: 2, tags: { a: "1" } },
      { type: "timing", name: "lat", value: 3, tags: { b: "2" } },
    ]);
  });
});
