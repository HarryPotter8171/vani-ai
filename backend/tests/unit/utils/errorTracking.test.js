import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("utils/errorTracking", () => {
  const ENV_KEYS = ["SENTRY_DSN", "SENTRY_RELEASE", "NODE_ENV", "SENTRY_TRACES_SAMPLE_RATE"];
  let snapshot;
  let initCalls;

  beforeEach(() => {
    snapshot = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const key of ENV_KEYS) delete process.env[key];
    initCalls = [];
    vi.resetModules();
    vi.doMock("@sentry/node", () => ({
      init: (opts) => {
        initCalls.push(opts);
      },
      withScope: (fn) =>
        fn({
          setTag: () => {},
          setExtras: () => {},
        }),
      captureException: vi.fn(),
      captureMessage: vi.fn(),
      close: vi.fn(async () => {}),
    }));
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (snapshot[key] === undefined) delete process.env[key];
      else process.env[key] = snapshot[key];
    }
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("is a no-op when SENTRY_DSN is unset", async () => {
    const mod = await import("../../../utils/errorTracking.js");
    mod.initErrorTracking();
    expect(mod.isErrorTrackingEnabled()).toBe(false);
    expect(initCalls).toHaveLength(0);
  });

  it("initializes Sentry when SENTRY_DSN is set", async () => {
    process.env.SENTRY_DSN = "https://example@sentry.io/1";
    process.env.SENTRY_RELEASE = "rc2-3-test";
    process.env.NODE_ENV = "production";
    const mod = await import("../../../utils/errorTracking.js");
    mod.initErrorTracking();
    expect(mod.isErrorTrackingEnabled()).toBe(true);
    expect(initCalls).toHaveLength(1);
    expect(initCalls[0].dsn).toBe("https://example@sentry.io/1");
    expect(initCalls[0].release).toBe("rc2-3-test");
    expect(initCalls[0].environment).toBe("production");
  });

  it("does not double-init on repeated calls", async () => {
    process.env.SENTRY_DSN = "https://example@sentry.io/1";
    const mod = await import("../../../utils/errorTracking.js");
    mod.initErrorTracking();
    mod.initErrorTracking();
    expect(initCalls).toHaveLength(1);
  });
});
