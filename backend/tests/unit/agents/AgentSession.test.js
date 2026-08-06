import { describe, it, expect, vi } from "vitest";
import { AgentSession, SESSION_STATUS, isSessionExpired } from "../../../agents/AgentSession.js";
import { AGENT_CONFIG } from "../../../agents/config.js";

describe("agents/AgentSession", () => {
  it("initializes with sane defaults", () => {
    const session = new AgentSession({ agentType: "coding", userMessage: "fix this bug" });
    expect(session.agentType).toBe("coding");
    expect(session.status).toBe(SESSION_STATUS.IDLE);
    expect(session.progress).toBe(0);
    expect(session.isTerminal).toBe(false);
    expect(typeof session.id).toBe("string");
  });

  it("falls back to the general agent type for unknown ids", () => {
    const session = new AgentSession({ agentType: "does-not-exist" });
    expect(session.agentType).toBe("general");
  });

  it("setPlan seeds steps and bumps progress", () => {
    const session = new AgentSession({ agentType: "general" });
    session.setPlan([
      { title: "Search", tool: "web_search", args: { query: "x" } },
      { title: "Answer", tool: null },
    ]);
    expect(session.plan).toHaveLength(2);
    expect(session.steps).toHaveLength(2);
    expect(session.plan[0].status).toBe("pending");
    expect(session.progress).toBe(5);
  });

  it("tracks step lifecycle: start -> done", () => {
    const session = new AgentSession({ agentType: "general" });
    session.setPlan([{ title: "Step 1" }, { title: "Step 2" }]);

    session.markStepStart(0);
    expect(session.steps[0].status).toBe("running");
    expect(session.currentStepIndex).toBe(0);

    session.markStepDone(0, { ok: true });
    expect(session.steps[0].status).toBe("completed");
    expect(session.steps[0].result).toEqual({ ok: true });
    expect(session.progress).toBeGreaterThan(5);
  });

  it("tracks step failure", () => {
    const session = new AgentSession({ agentType: "general" });
    session.setPlan([{ title: "Step 1" }]);
    session.markStepStart(0);
    session.markStepFailed(0, "boom");
    expect(session.steps[0].status).toBe("failed");
    expect(session.steps[0].error).toBe("boom");
  });

  it("pause / resume toggles isPaused and status", () => {
    const session = new AgentSession({ agentType: "general" });
    session.status = SESSION_STATUS.RUNNING;

    expect(session.requestPause()).toBe(true);
    expect(session.isPaused).toBe(true);
    expect(session.status).toBe(SESSION_STATUS.PAUSED);

    expect(session.resume()).toBe(true);
    expect(session.isPaused).toBe(false);
    expect(session.status).toBe(SESSION_STATUS.RUNNING);
  });

  it("cannot pause a terminal session", () => {
    const session = new AgentSession({ agentType: "general" });
    session.status = SESSION_STATUS.COMPLETED;
    expect(session.requestPause()).toBe(false);
  });

  it("cancel marks terminal state and unblocks waiters", async () => {
    const session = new AgentSession({ agentType: "general" });
    session.status = SESSION_STATUS.RUNNING;
    session.requestPause();

    const waitPromise = session.waitIfPaused();
    session.cancel("stop it");

    expect(session.isCancelled).toBe(true);
    expect(session.status).toBe(SESSION_STATUS.CANCELLED);
    expect(session.isTerminal).toBe(true);
    await expect(waitPromise).resolves.toBe(false);
  });

  it("cannot cancel an already-terminal session", () => {
    const session = new AgentSession({ agentType: "general" });
    session.cancel();
    expect(session.cancel()).toBe(false);
  });

  it("waitIfPaused resolves immediately when not paused", async () => {
    const session = new AgentSession({ agentType: "general" });
    await expect(session.waitIfPaused()).resolves.toBe(true);
  });

  it("emits events to registered listeners and supports unsubscribe", () => {
    const session = new AgentSession({ agentType: "general" });
    const events = [];
    const unsubscribe = session.on((e) => events.push(e));

    session.setStatus(SESSION_STATUS.PLANNING);
    expect(events.some((e) => e.type === "status")).toBe(true);

    unsubscribe();
    session.setStatus(SESSION_STATUS.RUNNING);
    expect(events.filter((e) => e.type === "status")).toHaveLength(1);
  });

  it("a listener throwing does not break emission to other listeners", () => {
    const session = new AgentSession({ agentType: "general" });
    const spy = vi.fn();
    session.on(() => {
      throw new Error("bad listener");
    });
    session.on(spy);
    expect(() => session.setStatus(SESSION_STATUS.RUNNING)).not.toThrow();
    expect(spy).toHaveBeenCalled();
  });

  it("toJSON returns a plain serializable snapshot", () => {
    const session = new AgentSession({ agentType: "general", userMessage: "hi" });
    const json = session.toJSON();
    expect(json).toMatchObject({
      agentType: "general",
      userMessage: "hi",
      status: SESSION_STATUS.IDLE,
    });
    expect(json).not.toHaveProperty("_listeners");
  });

  describe("isSessionExpired", () => {
    it("is false right after creation", () => {
      const session = new AgentSession({ agentType: "general" });
      expect(isSessionExpired(session)).toBe(false);
    });

    it("is true once sessionTtlMs has elapsed", () => {
      const session = new AgentSession({ agentType: "general" });
      const future = session.updatedAt + AGENT_CONFIG.sessionTtlMs + 1;
      expect(isSessionExpired(session, future)).toBe(true);
    });
  });
});
