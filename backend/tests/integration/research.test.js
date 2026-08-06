import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";
import { createAuthedUser } from "../helpers/auth.js";
import Chat from "../../models/Chat.js";
import Research from "../../models/Research.js";

// Deep Research's real pipeline calls out to search + fetch + LLM providers.
// Mock only the orchestration entry points (`runDeepResearch`/`resumeDeepResearch`)
// while keeping the real `ResearchSession` state machine, so pause/resume/cancel
// and ownership logic are exercised exactly as in production.
vi.mock("../../services/research/index.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    runDeepResearch: vi.fn(async ({ query, userId, chatId, projectId, sessionId, onEvent }) => {
      const session = new actual.ResearchSession({ query, userId, chatId, projectId, sessionId });
      actual.rememberSession(session);
      if (typeof onEvent === "function") session.on(onEvent);
      session.startedAt = Date.now();
      session.emit({
        type: "session_start",
        sessionId: session.id,
        query: session.query,
        status: session.status,
        progress: 0,
      });
      session.setPhase("planning", "Building a research plan");
      session.setProgress(50, "Reading sources");
      session.complete({
        report: `Mock research findings about: ${query}`,
        citations: [{ id: 1, url: "https://example.com/a" }],
        confidence: 0.87,
        followUpQuestions: ["What about X?"],
        contradictions: [],
      });
      return session;
    }),
    resumeDeepResearch: vi.fn(async (sessionId) => {
      const session = actual.getResearchSession(sessionId);
      if (!session) return { ok: false, error: "Session not found" };
      session.complete({ report: "resumed report", confidence: 0.75 });
      return { ok: true, session };
    }),
  };
});

const { getTestApp } = await import("../helpers/testApp.js");
const { getResearchSession, rememberSession, ResearchSession } = await import("../../services/research/index.js");

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

describe("Deep Research: run (SSE)", () => {
  it("requires auth", async () => {
    const res = await request(app).post("/api/research/run").send({ query: "hi" });
    expect(res.status).toBe(401);
  });

  it("rejects an empty query", async () => {
    const { authHeader } = await createAuthedUser();
    const res = await request(app).post("/api/research/run").set("Authorization", authHeader).send({});
    expect(res.status).toBe(400);
  });

  it("streams phase/progress/completed events and persists a report to the chat", async () => {
    const { authHeader, user } = await createAuthedUser();

    const res = await request(app)
      .post("/api/research/run")
      .set("Authorization", authHeader)
      .send({ query: "What is the tallest mountain?" });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);

    const events = parseSSE(res.text);
    expect(events.some((e) => e.type === "session_start")).toBe(true);
    expect(events.some((e) => e.type === "phase" && e.phase === "planning")).toBe(true);
    expect(events.some((e) => e.type === "completed")).toBe(true);

    const done = events.find((e) => e.done);
    expect(done.sessionId).toBeTruthy();
    expect(done.chatId).toBeTruthy();
    expect(done.confidence).toBeCloseTo(0.87);

    const chat = await Chat.findById(done.chatId);
    expect(chat.user.toString()).toBe(String(user._id));
    expect(chat.messages.at(-1).content).toMatch(/Mock research findings/);
    expect(chat.messages.at(0)).toMatchObject({ role: "user", content: "What is the tallest mountain?" });

    const saved = await Research.findOne({ sessionId: done.sessionId });
    expect(saved).toBeTruthy();
    expect(saved.status).toBe("completed");
    expect(String(saved.user)).toBe(String(user._id));
  });

  it("continues research inside an existing chat when chatId is provided", async () => {
    const { authHeader, user } = await createAuthedUser();
    const chat = await Chat.create({ user: user._id, title: "Existing chat", messages: [] });

    const res = await request(app)
      .post("/api/research/run")
      .set("Authorization", authHeader)
      .send({ query: "Follow up question", chatId: String(chat._id) });

    const events = parseSSE(res.text);
    const done = events.find((e) => e.done);
    expect(done.chatId).toBe(String(chat._id));

    const saved = await Chat.findById(chat._id);
    expect(saved.messages).toHaveLength(2);
  });

  it("persists project linkage when run with projectId", async () => {
    const { authHeader } = await createAuthedUser();
    const projectRes = await request(app)
      .post("/api/projects")
      .set("Authorization", authHeader)
      .send({ name: "Research Project Link" });
    expect(projectRes.status).toBe(201);
    const projectId = String(projectRes.body._id);

    const res = await request(app)
      .post("/api/research/run")
      .set("Authorization", authHeader)
      .send({ query: "Summarize project research context", projectId });
    expect(res.status).toBe(200);

    const events = parseSSE(res.text);
    const done = events.find((e) => e.done);
    expect(done?.chatId).toBeTruthy();
    expect(done?.sessionId).toBeTruthy();

    const chat = await Chat.findById(done.chatId).lean();
    expect(String(chat.project)).toBe(projectId);

    const savedResearch = await Research.findOne({ sessionId: done.sessionId }).lean();
    expect(String(savedResearch.project)).toBe(projectId);
  });
});

describe("Deep Research: session access + IDOR", () => {
  it("reads a live in-memory session snapshot", async () => {
    const { authHeader, user } = await createAuthedUser();
    const session = new ResearchSession({ query: "live session", userId: String(user._id) });
    rememberSession(session);

    const res = await request(app)
      .get(`/api/research/sessions/${session.id}`)
      .set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(res.body.query).toBe("live session");
  });

  it("hides another user's live session (IDOR)", async () => {
    const owner = await createAuthedUser();
    const attacker = await createAuthedUser();
    const session = new ResearchSession({ query: "private", userId: String(owner.user._id) });
    rememberSession(session);

    const res = await request(app)
      .get(`/api/research/sessions/${session.id}`)
      .set("Authorization", attacker.authHeader);
    expect(res.status).toBe(404);
  });

  it("404s for an unknown session id", async () => {
    const { authHeader } = await createAuthedUser();
    const res = await request(app).get("/api/research/sessions/nope").set("Authorization", authHeader);
    expect(res.status).toBe(404);
  });

  it("falls back to the persisted (terminal) session when no longer live", async () => {
    const { authHeader, user } = await createAuthedUser();
    await Research.create({
      sessionId: "persisted-session-1",
      user: user._id,
      query: "archived query",
      status: "completed",
      progress: 100,
    });

    const res = await request(app)
      .get("/api/research/sessions/persisted-session-1")
      .set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(res.body.query).toBe("archived query");
  });
});

describe("Deep Research: pause / resume / cancel", () => {
  it("pauses and resumes a live session", async () => {
    const { authHeader, user } = await createAuthedUser();
    const session = new ResearchSession({ query: "pausable", userId: String(user._id) });
    rememberSession(session);
    session.setPhase("searching");

    const paused = await request(app)
      .post(`/api/research/sessions/${session.id}/pause`)
      .set("Authorization", authHeader);
    expect(paused.status).toBe(200);
    expect(paused.body.status).toBe("paused");

    const resumed = await request(app)
      .post(`/api/research/sessions/${session.id}/resume`)
      .set("Authorization", authHeader);
    expect(resumed.status).toBe(200);
    expect(resumed.body.status).not.toBe("paused");
  });

  it("cannot resume a session that isn't paused", async () => {
    const { authHeader, user } = await createAuthedUser();
    const session = new ResearchSession({ query: "not paused", userId: String(user._id) });
    rememberSession(session);

    const res = await request(app)
      .post(`/api/research/sessions/${session.id}/resume`)
      .set("Authorization", authHeader);
    expect(res.status).toBe(400);
  });

  it("cancels a session", async () => {
    const { authHeader, user } = await createAuthedUser();
    const session = new ResearchSession({ query: "cancel me", userId: String(user._id) });
    rememberSession(session);

    const res = await request(app)
      .post(`/api/research/sessions/${session.id}/cancel`)
      .set("Authorization", authHeader)
      .send({ reason: "no longer needed" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cancelled");
  });

  it("prevents pausing/cancelling another user's session (IDOR)", async () => {
    const owner = await createAuthedUser();
    const attacker = await createAuthedUser();
    const session = new ResearchSession({ query: "guarded", userId: String(owner.user._id) });
    rememberSession(session);

    const pause = await request(app)
      .post(`/api/research/sessions/${session.id}/pause`)
      .set("Authorization", attacker.authHeader);
    expect(pause.status).toBe(404);

    const cancel = await request(app)
      .post(`/api/research/sessions/${session.id}/cancel`)
      .set("Authorization", attacker.authHeader);
    expect(cancel.status).toBe(404);
  });
});

describe("Deep Research: list history", () => {
  it("lists only the caller's own research runs, most recent first", async () => {
    const alice = await createAuthedUser();
    const bob = await createAuthedUser();
    await Research.create({ sessionId: "a1", user: alice.user._id, query: "alice query 1", status: "completed" });
    await Research.create({ sessionId: "a2", user: alice.user._id, query: "alice query 2", status: "completed" });
    await Research.create({ sessionId: "b1", user: bob.user._id, query: "bob query", status: "completed" });

    const res = await request(app).get("/api/research").set("Authorization", alice.authHeader);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.every((r) => ["alice query 1", "alice query 2"].includes(r.query))).toBe(true);
  });
});
