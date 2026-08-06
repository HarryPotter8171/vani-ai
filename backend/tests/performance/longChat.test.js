import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createAuthedUser } from "../helpers/auth.js";
import Chat from "../../models/Chat.js";

const { getTestApp } = await import("../helpers/testApp.js");

let app;

beforeAll(() => {
  app = getTestApp();
});

function buildMessages(count) {
  const messages = [];
  for (let i = 0; i < count; i += 1) {
    messages.push({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Message #${i} — ${"lorem ipsum dolor sit amet ".repeat(6)}`,
    });
  }
  return messages;
}

describe("Performance: long chats (10k+ messages)", () => {
  it("persists a 10,000-message chat directly and retrieves it via the API within budget", async () => {
    const { authHeader, user } = await createAuthedUser();
    const messages = buildMessages(10_000);

    const writeStart = performance.now();
    const chat = await Chat.create({
      user: user._id,
      title: "Marathon conversation",
      messages,
      lastMessage: messages.at(-1).content,
    });
    const writeMs = performance.now() - writeStart;

    const readStart = performance.now();
    const res = await request(app).get(`/api/chat/${chat._id}`).set("Authorization", authHeader);
    const readMs = performance.now() - readStart;

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(10_000);
    expect(res.body.messages[0].content).toContain("Message #0");
    expect(res.body.messages[9999].content).toContain("Message #9999");

    console.log(
      `[perf] long chat (10k msgs): write=${writeMs.toFixed(1)}ms read=${readMs.toFixed(1)}ms`
    );

    // Generous ceilings — this guards against pathological regressions
    // (e.g. an accidental O(n^2) serialization path), not micro-benchmarking.
    expect(writeMs).toBeLessThan(5_000);
    expect(readMs).toBeLessThan(5_000);
  }, 30_000);

  it("lists chats for a user with many large conversations within budget", async () => {
    const { authHeader, user } = await createAuthedUser();
    const chatCount = 30;
    const messagesPerChat = 200;

    const seedStart = performance.now();
    await Chat.insertMany(
      Array.from({ length: chatCount }, (_, i) => ({
        user: user._id,
        title: `Conversation ${i}`,
        messages: buildMessages(messagesPerChat),
        lastMessage: `Last message of conversation ${i}`,
      }))
    );
    const seedMs = performance.now() - seedStart;

    const listStart = performance.now();
    const res = await request(app).get("/api/chat/list").set("Authorization", authHeader);
    const listMs = performance.now() - listStart;

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(chatCount);

    console.log(
      `[perf] list ${chatCount} chats (${messagesPerChat} msgs each): seed=${seedMs.toFixed(1)}ms list=${listMs.toFixed(1)}ms`
    );
    expect(listMs).toBeLessThan(3_000);
  }, 30_000);

  it("appends a new message to an already-huge chat without a full-document rewrite penalty", async () => {
    const { authHeader, user } = await createAuthedUser();
    const chat = await Chat.create({
      user: user._id,
      title: "Already huge",
      messages: buildMessages(10_000),
    });

    const renameStart = performance.now();
    const res = await request(app)
      .patch(`/api/chat/${chat._id}/title`)
      .set("Authorization", authHeader)
      .send({ title: "Renamed while huge" });
    const renameMs = performance.now() - renameStart;

    expect(res.status).toBe(200);
    console.log(`[perf] rename a 10k-message chat: ${renameMs.toFixed(1)}ms`);
    expect(renameMs).toBeLessThan(3_000);
  }, 30_000);
});
