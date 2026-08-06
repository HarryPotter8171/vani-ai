import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";
import { createAuthedUser } from "../helpers/auth.js";

// Simulate realistic per-token latency so "concurrency" is actually
// exercised (sequential execution would take N * totalDelay).
const STREAM_CHUNKS = ["Hello ", "from ", "mock ", "VANI ", "AI."];
const CHUNK_DELAY_MS = 15;

vi.mock("../../services/geminiService.js", () => ({
  prepareMessages: vi.fn(async (messages) => ({
    contents: [{ role: "user", parts: [{ text: "mock" }] }],
    persistedMessages: messages,
  })),
  streamAgentReply: vi.fn(async function* () {
    for (const text of STREAM_CHUNKS) {
      await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY_MS));
      yield { type: "delta", text };
    }
  }),
}));

vi.mock("../../services/memory/index.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    autoCaptureFromChat: vi.fn(async () => {}),
    buildMemoryPromptExtras: vi.fn(async () => ({ extras: "", memories: [] })),
  };
});

const { getTestApp } = await import("../helpers/testApp.js");

let app;

beforeAll(() => {
  app = getTestApp();
});

function parseSSE(text) {
  return text
    .split("\n\n")
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => JSON.parse(chunk.slice("data: ".length)));
}

async function sendOne(authHeader, ip) {
  const res = await request(app)
    .post("/api/chat")
    .set("Authorization", authHeader)
    .set("X-Forwarded-For", ip)
    .send({ message: "What is the capital of France?" });
  return res;
}

describe("Performance: concurrent streaming", () => {
  it("serves 20 concurrent streaming chat requests correctly and faster than sequential execution", async () => {
    const CONCURRENCY = 20;
    const users = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) =>
        createAuthedUser({ email: `concurrent-${i}@vani.test` })
      )
    );

    const singleStart = performance.now();
    await sendOne(users[0].authHeader, users[0].ip);
    const singleMs = performance.now() - singleStart;

    const concurrentStart = performance.now();
    const results = await Promise.all(users.map((u) => sendOne(u.authHeader, u.ip)));
    const concurrentMs = performance.now() - concurrentStart;

    for (const res of results) {
      expect(res.status).toBe(200);
      const events = parseSSE(res.text);
      const deltas = events.filter((e) => e.delta).map((e) => e.delta).join("");
      expect(deltas).toBe(STREAM_CHUNKS.join(""));
      expect(events.some((e) => e.done)).toBe(true);
    }

    const sequentialEstimateMs = singleMs * CONCURRENCY;
    console.log(
      `[perf] concurrent streaming: 1x=${singleMs.toFixed(1)}ms ${CONCURRENCY}x-concurrent=${concurrentMs.toFixed(1)}ms ` +
        `(sequential estimate ${sequentialEstimateMs.toFixed(1)}ms)`
    );

    // True concurrency should comfortably beat naive sequential execution.
    expect(concurrentMs).toBeLessThan(sequentialEstimateMs * 0.85);
  }, 60_000);
});
