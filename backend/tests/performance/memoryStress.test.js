import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";
import { createAuthedUser } from "../helpers/auth.js";
import Memory from "../../models/Memory.js";

// Deterministic, content-derived embedding so semantic retrieval over a
// large corpus produces a stable, non-degenerate ranking (see memory.test.js
// for why a fixed constant vector would be a poor stress fixture).
function fakeEmbedding(text) {
  const s = String(text || "");
  const hashes = [31, 37, 41, 43, 47, 53, 59, 61].map((seed) => {
    let h = 0;
    for (let i = 0; i < s.length; i += 1) {
      h = (h * seed + s.charCodeAt(i)) % 1_000_003;
    }
    return h / 1_000_003;
  });
  return hashes;
}

const embedContent = vi.fn(async ({ contents }) => ({
  embeddings: (contents || []).map((text) => ({ values: fakeEmbedding(text) })),
}));
vi.mock("../../services/geminiClient.js", () => ({
  CHAT_MODEL: "gemini-2.5-flash",
  getGeminiClient: () => ({ models: { embedContent, generateContent: vi.fn() } }),
}));

const { getTestApp } = await import("../helpers/testApp.js");

let app;

beforeAll(() => {
  app = getTestApp();
});

const CATEGORIES = ["profile", "preference", "fact", "project", "goal", "task", "tool", "conversation"];
const TOPICS = [
  "prefers dark mode",
  "works as a backend engineer",
  "is building a voice assistant",
  "likes concise code reviews",
  "uses TypeScript and Node.js",
  "wants weekly progress summaries",
  "is allergic to shellfish",
  "lives in Bengaluru",
];

describe("Performance: memory stress", () => {
  it("seeds a user up to the memory cap (200) and lists/searches within budget", async () => {
    const { authHeader, user } = await createAuthedUser();
    const total = 200;

    const seedStart = performance.now();
    const docs = Array.from({ length: total }, (_, i) => {
      const content = `Memory #${i}: user ${TOPICS[i % TOPICS.length]} (entry ${i}).`;
      return {
        user: user._id,
        category: CATEGORIES[i % CATEGORIES.length],
        content,
        importance: 0.3 + (i % 10) / 20,
        source: "manual",
        embedding: fakeEmbedding(content),
      };
    });
    await Memory.insertMany(docs);
    const seedMs = performance.now() - seedStart;

    const listStart = performance.now();
    const listRes = await request(app)
      .get("/api/memory")
      .query({ limit: 50 })
      .set("Authorization", authHeader);
    const listMs = performance.now() - listStart;
    expect(listRes.status).toBe(200);
    expect(listRes.body.total ?? listRes.body.memories?.length).toBeTruthy();

    const searchStart = performance.now();
    const searchRes = await request(app)
      .get("/api/memory")
      .query({ q: "backend engineer", limit: 20 })
      .set("Authorization", authHeader);
    const searchMs = performance.now() - searchStart;
    expect(searchRes.status).toBe(200);

    const retrieveStart = performance.now();
    const retrieveRes = await request(app)
      .post("/api/memory/retrieve")
      .set("Authorization", authHeader)
      .send({ query: "What does the user prefer for code review style?" });
    const retrieveMs = performance.now() - retrieveStart;
    expect(retrieveRes.status).toBe(200);
    expect(Array.isArray(retrieveRes.body.memories)).toBe(true);

    console.log(
      `[perf] memory stress (${total} memories): seed=${seedMs.toFixed(1)}ms list=${listMs.toFixed(1)}ms ` +
        `search=${searchMs.toFixed(1)}ms semantic-retrieve=${retrieveMs.toFixed(1)}ms`
    );

    expect(listMs).toBeLessThan(2_000);
    expect(searchMs).toBeLessThan(2_000);
    expect(retrieveMs).toBeLessThan(3_000);
  }, 30_000);
});
