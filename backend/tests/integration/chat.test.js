import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";
import { createAuthedUser } from "../helpers/auth.js";
import Chat from "../../models/Chat.js";

// Mock the LLM boundary so chat streaming tests are deterministic and make
// no network calls. `prepareMessages` and `streamAgentReply` are the exact
// seam `chatController.createOrUpdateChat` calls through.
vi.mock("../../services/geminiService.js", () => ({
  prepareMessages: vi.fn(async (messages) => ({
    contents: [{ role: "user", parts: [{ text: "mock" }] }],
    persistedMessages: messages,
  })),
  streamAgentReply: vi.fn(async function* () {
    yield { type: "delta", text: "Hello " };
    yield { type: "delta", text: "from mock VANI." };
  }),
}));

// Auto-memory-capture and retrieval hit Gemini in the background; stub them
// out so chat tests stay fast, deterministic, and network-free.
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

describe("Chat CRUD", () => {
  it("requires auth", async () => {
    const res = await request(app).get("/api/chat/list");
    expect(res.status).toBe(401);
  });

  it("creates an empty chat", async () => {
    const { authHeader, user } = await createAuthedUser();
    const res = await request(app)
      .post("/api/chat/new")
      .set("Authorization", authHeader)
      .send({ title: "My New Chat" });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe("My New Chat");
    expect(String(res.body.user)).toBe(String(user._id));
  });

  it("lists only the caller's own chats, pinned first", async () => {
    const alice = await createAuthedUser();
    const bob = await createAuthedUser();
    await Chat.create({ user: alice.user._id, title: "Alice 1" });
    const pinned = await Chat.create({ user: alice.user._id, title: "Alice Pinned", pinned: true });
    await Chat.create({ user: bob.user._id, title: "Bob 1" });

    const res = await request(app).get("/api/chat/list").set("Authorization", alice.authHeader);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].id ?? res.body[0]._id).toBe(String(pinned._id));
  });

  it("filters chats by search query", async () => {
    const { authHeader, user } = await createAuthedUser();
    await Chat.create({ user: user._id, title: "Trip to Japan" });
    await Chat.create({ user: user._id, title: "Cooking recipes" });

    const res = await request(app).get("/api/chat/list?q=japan").set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe("Trip to Japan");
  });

  it("renames a chat via PATCH /:id/title", async () => {
    const { authHeader, user } = await createAuthedUser();
    const chat = await Chat.create({ user: user._id, title: "Old Title" });

    const res = await request(app)
      .patch(`/api/chat/${chat._id}/title`)
      .set("Authorization", authHeader)
      .send({ title: "New Title" });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("New Title");
  });

  it("rejects an empty title", async () => {
    const { authHeader, user } = await createAuthedUser();
    const chat = await Chat.create({ user: user._id, title: "Keep me" });
    const res = await request(app)
      .patch(`/api/chat/${chat._id}/title`)
      .set("Authorization", authHeader)
      .send({ title: "   " });
    expect(res.status).toBe(400);
  });

  it("pins and unpins a chat", async () => {
    const { authHeader, user } = await createAuthedUser();
    const chat = await Chat.create({ user: user._id, title: "Pin me" });

    const pinned = await request(app)
      .post(`/api/chat/${chat._id}/pin`)
      .set("Authorization", authHeader)
      .send({ pinned: true });
    expect(pinned.body.pinned).toBe(true);

    const unpinned = await request(app)
      .post(`/api/chat/${chat._id}/unpin`)
      .set("Authorization", authHeader)
      .send({ pinned: false });
    expect(unpinned.body.pinned).toBe(false);
  });

  it("deletes an owned chat", async () => {
    const { authHeader, user } = await createAuthedUser();
    const chat = await Chat.create({ user: user._id, title: "Delete me" });

    const res = await request(app).delete(`/api/chat/${chat._id}`).set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(await Chat.findById(chat._id)).toBeNull();
  });
});

describe("Chat sharing", () => {
  it("share is idempotent and returns a stable shareId across toggles", async () => {
    const { authHeader, user } = await createAuthedUser();
    const chat = await Chat.create({ user: user._id, title: "Shared chat", messages: [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ] });

    const first = await request(app).post(`/api/chat/${chat._id}/share`).set("Authorization", authHeader);
    expect(first.body.isShared).toBe(true);
    const shareId = first.body.shareId;
    expect(shareId).toBeTruthy();

    await request(app).post(`/api/chat/${chat._id}/unshare`).set("Authorization", authHeader);
    const second = await request(app).post(`/api/chat/${chat._id}/share`).set("Authorization", authHeader);
    expect(second.body.shareId).toBe(shareId);
  });

  it("exposes a shared chat publicly without auth, stripped of private fields", async () => {
    const { authHeader, user } = await createAuthedUser();
    const chat = await Chat.create({
      user: user._id,
      title: "Public chat",
      messages: [
        { role: "system", content: "internal instructions" },
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello there" },
      ],
    });
    const share = await request(app).post(`/api/chat/${chat._id}/share`).set("Authorization", authHeader);

    const res = await request(app).get(`/api/chat/shared/${share.body.shareId}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Public chat");
    expect(res.body.messages.some((m) => m.role === "system")).toBe(false);
    expect(res.body).not.toHaveProperty("user");
  });

  it("returns 404 for an unshared or unknown shareId", async () => {
    const res = await request(app).get("/api/chat/shared/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("un-sharing hides the chat from the public endpoint again", async () => {
    const { authHeader, user } = await createAuthedUser();
    const chat = await Chat.create({ user: user._id, title: "Toggle chat" });
    const share = await request(app).post(`/api/chat/${chat._id}/share`).set("Authorization", authHeader);
    await request(app).post(`/api/chat/${chat._id}/unshare`).set("Authorization", authHeader);

    const res = await request(app).get(`/api/chat/shared/${share.body.shareId}`);
    expect(res.status).toBe(404);
  });
});

describe("Chat ownership / IDOR protection", () => {
  it("returns 404 when reading another user's chat", async () => {
    const owner = await createAuthedUser();
    const attacker = await createAuthedUser();
    const chat = await Chat.create({ user: owner.user._id, title: "Private" });

    const res = await request(app).get(`/api/chat/${chat._id}`).set("Authorization", attacker.authHeader);
    expect(res.status).toBe(404);
  });

  it("returns 404 when deleting another user's chat, and it survives", async () => {
    const owner = await createAuthedUser();
    const attacker = await createAuthedUser();
    const chat = await Chat.create({ user: owner.user._id, title: "Survive" });

    const res = await request(app).delete(`/api/chat/${chat._id}`).set("Authorization", attacker.authHeader);
    expect(res.status).toBe(404);
    expect(await Chat.findById(chat._id)).not.toBeNull();
  });

  it("returns 404 (not 500) for a malformed chat id", async () => {
    const { authHeader } = await createAuthedUser();
    const res = await request(app).get("/api/chat/not-a-valid-object-id").set("Authorization", authHeader);
    expect(res.status).toBe(404);
  });
});

describe("Streaming chat send (SSE) — POST /api/chat", () => {
  it("streams mocked deltas and persists the assistant reply", async () => {
    const { authHeader, user } = await createAuthedUser();

    const res = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader)
      .send({ message: "Hello VANI" });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);

    const events = parseSSE(res.text);
    const deltas = events.filter((e) => e.delta).map((e) => e.delta).join("");
    expect(deltas).toBe("Hello from mock VANI.");

    const done = events.find((e) => e.done);
    expect(done).toBeTruthy();
    expect(done.chatId).toBeTruthy();

    const saved = await Chat.findById(done.chatId);
    expect(saved.user.toString()).toBe(String(user._id));
    expect(saved.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: "Hello from mock VANI.",
    });
    expect(saved.messages.at(-2)).toMatchObject({ role: "user", content: "Hello VANI" });
  });

  it("continues an existing chat when chatId is provided", async () => {
    const { authHeader, user } = await createAuthedUser();
    const chat = await Chat.create({ user: user._id, title: "Existing" });

    const res = await request(app)
      .post("/api/chat")
      .set("Authorization", authHeader)
      .send({ chatId: String(chat._id), message: "Second message" });

    const events = parseSSE(res.text);
    const done = events.find((e) => e.done);
    expect(done.chatId).toBe(String(chat._id));

    const saved = await Chat.findById(chat._id);
    expect(saved.messages).toHaveLength(2);
  });

  it("rejects streaming into another user's chat (IDOR)", async () => {
    const owner = await createAuthedUser();
    const attacker = await createAuthedUser();
    const chat = await Chat.create({ user: owner.user._id, title: "Not yours" });

    const res = await request(app)
      .post("/api/chat")
      .set("Authorization", attacker.authHeader)
      .send({ chatId: String(chat._id), message: "hacked message" });

    const events = parseSSE(res.text);
    expect(events.some((e) => e.error === "Chat not found")).toBe(true);

    const saved = await Chat.findById(chat._id);
    expect(saved.messages).toHaveLength(0);
  });

  it("requires auth for streaming send", async () => {
    const res = await request(app).post("/api/chat").send({ message: "hi" });
    expect(res.status).toBe(401);
  });

  it("rejects a request with no message/messages", async () => {
    const { authHeader } = await createAuthedUser();
    const res = await request(app).post("/api/chat").set("Authorization", authHeader).send({});
    expect(res.status).toBe(400);
  });
});
