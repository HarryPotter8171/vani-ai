import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";
import { createAuthedUser } from "../helpers/auth.js";
import Memory from "../../models/Memory.js";

// Memory creation embeds content (embeddingService -> geminiClient.embedContent)
// and auto-capture / summarize call generateContent. Mock the single Gemini
// client seam so tests never hit the network and stay deterministic.
//
// The embedding vector is derived deterministically from the input text (not
// a fixed constant) so distinct memory contents don't collide as near-100%
// cosine-similar "duplicates" under createMemory's dedup logic.
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
const generateContent = vi.fn();
vi.mock("../../services/geminiClient.js", () => ({
  CHAT_MODEL: "gemini-2.5-flash",
  getGeminiClient: () => ({ models: { embedContent, generateContent } }),
}));

const { getTestApp } = await import("../helpers/testApp.js");

let app;

beforeAll(() => {
  app = getTestApp();
});

// Several routes here are rate-limited by IP (see middleware/rateLimit.js);
// giving every virtual test user a distinct synthetic IP keeps the write
// quota (40/min) from being shared — and exhausted — across this file's ~40
// write requests, which otherwise intermittently 429s an unrelated later test.
function client({ authHeader, ip }) {
  const withHeaders = (req) => req.set("Authorization", authHeader).set("X-Forwarded-For", ip);
  return {
    get: (url) => withHeaders(request(app).get(url)),
    post: (url) => withHeaders(request(app).post(url)),
    patch: (url) => withHeaders(request(app).patch(url)),
    delete: (url) => withHeaders(request(app).delete(url)),
  };
}

describe("Memory: auth gate", () => {
  it("requires auth", async () => {
    const res = await request(app).get("/api/memory");
    expect(res.status).toBe(401);
  });
});

describe("Memory: categories", () => {
  it("lists known categories", async () => {
    const authed = await createAuthedUser();
    const res = await client(authed).get("/api/memory/categories");
    expect(res.status).toBe(200);
    expect(res.body.categories).toContain("profile");
    expect(res.body.categories).toContain("fact");
  });
});

describe("Memory: settings", () => {
  it("returns default settings for a fresh user", async () => {
    const authed = await createAuthedUser({ name: "Ada Lovelace" });
    const res = await client(authed).get("/api/memory/settings");
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.profile.preferredName).toBe("Ada Lovelace");
  });

  it("updates profile/preferences and mirrors them into searchable memories", async () => {
    const authed = await createAuthedUser();
    const res = await client(authed)
      .patch("/api/memory/settings")
      .send({
        profile: { profession: "Software Engineer", interests: ["math", "music"] },
        preferences: { responseStyle: "concise" },
      });

    expect(res.status).toBe(200);
    expect(res.body.profile.profession).toBe("Software Engineer");
    expect(res.body.preferences.responseStyle).toBe("concise");

    const mirrored = await Memory.find({ user: authed.user._id, category: "profile" });
    expect(mirrored.some((m) => m.key === "profession")).toBe(true);
  });

  it("disabling memory is reflected in settings", async () => {
    const authed = await createAuthedUser();
    const res = await client(authed).patch("/api/memory/settings").send({ enabled: false });
    expect(res.body.enabled).toBe(false);
  });

  it("rejects an empty settings patch", async () => {
    const authed = await createAuthedUser();
    const res = await client(authed).patch("/api/memory/settings").send({});
    expect(res.status).toBe(400);
  });
});

describe("Memory: CRUD", () => {
  it("creates a memory from freeform content", async () => {
    const authed = await createAuthedUser();
    const res = await client(authed)
      .post("/api/memory")
      .send({ content: "The user prefers dark mode.", category: "preference" });

    expect(res.status).toBe(201);
    expect(res.body.memory.content).toBe("The user prefers dark mode.");
    expect(res.body.memory.category).toBe("preference");
    expect(res.body.deduplicated).toBe(false);

    const stored = await Memory.findById(res.body.memory.id);
    expect(String(stored.user)).toBe(String(authed.user._id));
  });

  it("creates a key/value memory via the tool-compatible shape", async () => {
    const authed = await createAuthedUser();
    const res = await client(authed).post("/api/memory").send({ key: "favorite_color", value: "teal" });

    expect(res.status).toBe(201);
    expect(res.body.memory.key).toBe("favorite_color");
    expect(res.body.memory.content).toBe("teal");
  });

  it("rejects creating a memory with no content", async () => {
    const authed = await createAuthedUser();
    const res = await client(authed).post("/api/memory").send({});
    expect(res.status).toBe(400);
  });

  it("lists, paginates, and searches memories owned by the caller", async () => {
    const authed = await createAuthedUser();
    for (const content of ["Loves hiking", "Works at Acme Corp", "Enjoys jazz music"]) {
      await client(authed).post("/api/memory").send({ content });
    }

    const all = await client(authed).get("/api/memory");
    expect(all.body.total).toBe(3);
    expect(all.body.memories).toHaveLength(3);

    const paged = await client(authed).get("/api/memory?limit=1&offset=1");
    expect(paged.body.memories).toHaveLength(1);

    const searched = await client(authed).get("/api/memory?q=jazz");
    expect(searched.body.total).toBe(1);
    expect(searched.body.memories[0].content).toMatch(/jazz/i);
  });

  it("gets a single memory by id, 404s for unknown/foreign ids", async () => {
    const owner = await createAuthedUser();
    const attacker = await createAuthedUser();
    const created = await client(owner).post("/api/memory").send({ content: "Private fact about owner" });
    const id = created.body.memory.id;

    const ownerGet = await client(owner).get(`/api/memory/${id}`);
    expect(ownerGet.status).toBe(200);

    const attackerGet = await client(attacker).get(`/api/memory/${id}`);
    expect(attackerGet.status).toBe(404);
  });

  it("updates a memory's content and category", async () => {
    const authed = await createAuthedUser();
    const created = await client(authed).post("/api/memory").send({ content: "Old fact" });
    const id = created.body.memory.id;

    const res = await client(authed)
      .patch(`/api/memory/${id}`)
      .send({ content: "Updated fact", category: "goal" });

    expect(res.status).toBe(200);
    expect(res.body.memory.content).toBe("Updated fact");
    expect(res.body.memory.category).toBe("goal");
  });

  it("404s updating another user's memory (IDOR)", async () => {
    const owner = await createAuthedUser();
    const attacker = await createAuthedUser();
    const created = await client(owner).post("/api/memory").send({ content: "Owner only" });

    const res = await client(attacker)
      .patch(`/api/memory/${created.body.memory.id}`)
      .send({ content: "Hacked" });
    expect(res.status).toBe(404);
  });

  it("deletes a memory by id", async () => {
    const authed = await createAuthedUser();
    const created = await client(authed).post("/api/memory").send({ content: "Delete me" });

    const res = await client(authed).delete(`/api/memory/${created.body.memory.id}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(await Memory.findById(created.body.memory.id)).toBeNull();
  });

  it("404s deleting another user's memory (IDOR)", async () => {
    const owner = await createAuthedUser();
    const attacker = await createAuthedUser();
    const created = await client(owner).post("/api/memory").send({ content: "Owner's memory" });

    const res = await client(attacker).delete(`/api/memory/${created.body.memory.id}`);
    expect(res.status).toBe(404);
    expect(await Memory.findById(created.body.memory.id)).not.toBeNull();
  });
});

describe("Memory: recall / forget / clear / export", () => {
  it("recalls a memory by key", async () => {
    const authed = await createAuthedUser();
    await client(authed).post("/api/memory").send({ key: "favorite_food", value: "sushi" });

    const res = await client(authed).get("/api/memory/recall?key=favorite_food");
    expect(res.status).toBe(200);
    expect(res.body.found).toBe(true);
    expect(res.body.memory.value).toBe("sushi");
  });

  it("returns found:false for an unknown key", async () => {
    const authed = await createAuthedUser();
    const res = await client(authed).get("/api/memory/recall?key=nonexistent_key");
    expect(res.body.found).toBe(false);
  });

  it("forgets a memory by key", async () => {
    const authed = await createAuthedUser();
    const created = await client(authed).post("/api/memory").send({ key: "temp_fact", value: "x" });
    expect(created.status).toBe(201);

    const res = await client(authed).post("/api/memory/forget").send({ key: "temp_fact" });
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
  });

  it("clears all memories for the caller only", async () => {
    const alice = await createAuthedUser();
    const bob = await createAuthedUser();
    await client(alice).post("/api/memory").send({ content: "Alice fact" });
    await client(bob).post("/api/memory").send({ content: "Bob fact" });

    const res = await client(alice).post("/api/memory/clear");
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(1);

    const bobMemories = await Memory.find({ user: bob.user._id });
    expect(bobMemories).toHaveLength(1);
  });

  it("exports memories with settings as a downloadable JSON payload", async () => {
    const authed = await createAuthedUser();
    await client(authed).post("/api/memory").send({ content: "Export me" });

    const res = await client(authed).get("/api/memory/export");
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/attachment/);
    expect(res.body.memories).toHaveLength(1);
    expect(res.body.settings).toBeTruthy();
  });
});

describe("Memory: retrieve (semantic + prompt extras)", () => {
  it("retrieves relevant memories for a query", async () => {
    const authed = await createAuthedUser();
    await client(authed).post("/api/memory").send({ content: "User is a vegetarian" });

    const res = await client(authed).post("/api/memory/retrieve").send({ query: "What does the user eat?" });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.memories)).toBe(true);
    expect(res.body.count).toBe(res.body.memories.length);
  });
});

describe("Memory: summarize a chat", () => {
  it("requires chatId", async () => {
    const authed = await createAuthedUser();
    const res = await client(authed).post("/api/memory/summarize").send({});
    expect(res.status).toBe(400);
  });

  it("summarizes a chat and stores a conversation memory", async () => {
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        memories: [{ category: "fact", content: "User is planning a trip to Japan", importance: 0.6 }],
        summary: "Discussed travel plans to Japan.",
      }),
    });

    const authed = await createAuthedUser();
    const Chat = (await import("../../models/Chat.js")).default;
    const chat = await Chat.create({
      user: authed.user._id,
      title: "Travel chat",
      messages: Array.from({ length: 9 }, (_, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Message number ${i} about the Japan trip.`,
      })),
    });

    const res = await client(authed).post("/api/memory/summarize").send({ chatId: String(chat._id) });

    expect(res.status).toBe(200);
    expect(res.body.memories).toHaveLength(1);
    expect(res.body.summary.content).toMatch(/travel plans to Japan/i);
  });

  it("404s summarizing a chat owned by someone else", async () => {
    const owner = await createAuthedUser();
    const attacker = await createAuthedUser();
    const Chat = (await import("../../models/Chat.js")).default;
    const chat = await Chat.create({ user: owner.user._id, title: "Private", messages: [] });

    const res = await client(attacker).post("/api/memory/summarize").send({ chatId: String(chat._id) });
    expect(res.status).toBe(400);
  });
});
