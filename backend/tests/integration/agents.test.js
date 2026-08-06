import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";
import { createAuthedUser } from "../helpers/auth.js";
import { subscriptionService } from "../../billing/SubscriptionService.ts";
import Chat from "../../models/Chat.js";

// Agent planning/verification/final-answer all go through getGeminiClient().
// The calculator tool step is real (pure, local, no network) so this test
// exercises the full plan -> execute -> verify -> stream pipeline end to end,
// only replacing the LLM boundary.
const generateContent = vi.fn(async ({ contents }) => {
  const prompt = contents?.[0]?.parts?.[0]?.text || "";
  if (prompt.includes("planning module for VANI AI")) {
    return {
      text: JSON.stringify({
        goal: "Do the math",
        steps: [
          {
            title: "Calculating...",
            description: "Evaluate the expression",
            tool: "calculator",
            args: { expression: "2+2" },
            parallelGroup: null,
          },
          {
            title: "Generating answer...",
            description: "Synthesize the result",
            tool: null,
            args: {},
          },
        ],
      }),
    };
  }
  if (prompt.includes("You verify agent execution results")) {
    return { text: JSON.stringify({ sufficient: true, notes: "Looks good", missing: [] }) };
  }
  return { text: "{}" };
});

const generateContentStream = vi.fn(async function* () {
  yield { text: "The answer is " };
  yield { text: "4." };
});

vi.mock("../../services/geminiClient.js", () => ({
  CHAT_MODEL: "gemini-2.5-flash",
  getGeminiClient: () => ({
    models: {
      generateContent,
      generateContentStream: async (...args) => generateContentStream(...args),
    },
  }),
}));

const { getTestApp } = await import("../helpers/testApp.js");

let app;

beforeAll(() => {
  app = getTestApp();
});

/** Agents are Pro+ gated — provision an entitled test user. */
async function proUser(overrides = {}) {
  const authed = await createAuthedUser(overrides);
  await subscriptionService.changePlan(String(authed.user._id), "pro");
  return authed;
}

function parseSSE(text) {
  return text
    .split("\n\n")
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => JSON.parse(chunk.slice("data: ".length)));
}

describe("Agents: listing", () => {
  it("requires auth", async () => {
    const res = await request(app).get("/api/agents");
    expect(res.status).toBe(401);
  });

  it("rejects Free-plan users (Pro+ required)", async () => {
    const { authHeader } = await createAuthedUser();
    const res = await request(app).get("/api/agents").set("Authorization", authHeader);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PLAN_REQUIRED");
  });

  it("lists the built-in agent types", async () => {
    const { authHeader } = await proUser();
    const res = await request(app).get("/api/agents").set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(res.body.agents.map((a) => a.id)).toEqual(
      expect.arrayContaining(["general", "coding", "research", "writing", "data_analysis", "web"])
    );
  });
});

describe("Agents: run (SSE, full plan -> execute -> verify -> answer)", () => {
  it("rejects an empty message", async () => {
    const { authHeader } = await proUser();
    const res = await request(app).post("/api/agents/run").set("Authorization", authHeader).send({});
    expect(res.status).toBe(400);
  });

  it("runs the general agent end to end and persists the reply to a chat", async () => {
    const { authHeader, user } = await proUser();

    const res = await request(app)
      .post("/api/agents/run")
      .set("Authorization", authHeader)
      .send({ agentType: "general", message: "What is 2+2?" });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);

    const events = parseSSE(res.text);
    expect(events.some((e) => e.type === "session_start")).toBe(true);
    expect(events.some((e) => e.type === "plan")).toBe(true);
    expect(events.some((e) => e.type === "tool_start" && e.name === "calculator")).toBe(true);
    expect(events.some((e) => e.type === "tool_done" && e.name === "calculator" && e.ok)).toBe(true);

    const deltas = events.filter((e) => e.type === "delta").map((e) => e.delta).join("");
    expect(deltas).toBe("The answer is 4.");

    const completed = events.find((e) => e.type === "completed");
    expect(completed.answer).toBe("The answer is 4.");

    const done = events.find((e) => e.done);
    expect(done.chatId).toBeTruthy();

    const chat = await Chat.findById(done.chatId);
    expect(chat.user.toString()).toBe(String(user._id));
    expect(chat.messages.at(-1)).toMatchObject({ role: "assistant", content: "The answer is 4." });
  });

  it("continues an existing chat when chatId is provided", async () => {
    const { authHeader, user } = await proUser();
    const chat = await Chat.create({ user: user._id, title: "Math help", messages: [] });

    const res = await request(app)
      .post("/api/agents/run")
      .set("Authorization", authHeader)
      .send({ message: "What is 2+2?", chatId: String(chat._id) });

    const events = parseSSE(res.text);
    const done = events.find((e) => e.done);
    expect(done.chatId).toBe(String(chat._id));

    const saved = await Chat.findById(chat._id);
    expect(saved.messages.length).toBeGreaterThan(0);
  });

  it("rejects running an agent into another user's chat (IDOR)", async () => {
    const owner = await proUser();
    const attacker = await proUser();
    const chat = await Chat.create({ user: owner.user._id, title: "Not yours", messages: [] });

    const res = await request(app)
      .post("/api/agents/run")
      .set("Authorization", attacker.authHeader)
      .send({ message: "What is 2+2?", chatId: String(chat._id) });

    const events = parseSSE(res.text);
    expect(events.some((e) => e.error === "Chat not found")).toBe(true);

    const saved = await Chat.findById(chat._id);
    expect(saved.messages).toHaveLength(0);
  });

  it("requires auth", async () => {
    const res = await request(app).post("/api/agents/run").send({ message: "hi" });
    expect(res.status).toBe(401);
  });
});

describe("Agents: session lifecycle + IDOR", () => {
  async function startSession(authHeader) {
    const res = await request(app)
      .post("/api/agents/run")
      .set("Authorization", authHeader)
      .send({ message: "What is 2+2?" });
    const events = parseSSE(res.text);
    return events.find((e) => e.type === "session_start").sessionId;
  }

  it("reads a completed session's final state", async () => {
    const { authHeader } = await proUser();
    const sessionId = await startSession(authHeader);

    const res = await request(app).get(`/api/agents/sessions/${sessionId}`).set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");
  });

  it("hides another user's session (IDOR)", async () => {
    const owner = await proUser();
    const attacker = await proUser();
    const sessionId = await startSession(owner.authHeader);

    const res = await request(app)
      .get(`/api/agents/sessions/${sessionId}`)
      .set("Authorization", attacker.authHeader);
    expect(res.status).toBe(404);
  });

  it("404s for an unknown session", async () => {
    const { authHeader } = await proUser();
    const res = await request(app).get("/api/agents/sessions/does-not-exist").set("Authorization", authHeader);
    expect(res.status).toBe(404);
  });

  it("cannot pause/resume/cancel a session that already completed and belongs to someone else", async () => {
    const owner = await proUser();
    const attacker = await proUser();
    const sessionId = await startSession(owner.authHeader);

    const pause = await request(app)
      .post(`/api/agents/sessions/${sessionId}/pause`)
      .set("Authorization", attacker.authHeader);
    expect(pause.status).toBe(404);

    const cancel = await request(app)
      .post(`/api/agents/sessions/${sessionId}/cancel`)
      .set("Authorization", attacker.authHeader);
    expect(cancel.status).toBe(404);
  });
});
