import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createAuthedUser } from "../helpers/auth.js";
import { subscriptionService } from "../../billing/SubscriptionService.ts";

const { getTestApp } = await import("../helpers/testApp.js");

let app;

beforeAll(() => {
  app = getTestApp();
});

/** Browser automation is Pro+ gated on POST /runs. */
async function proUser(overrides = {}) {
  const authed = await createAuthedUser(overrides);
  await subscriptionService.changePlan(String(authed.user._id), "pro");
  return authed;
}

describe("Browser: health", () => {
  it("exposes the health probe without auth", async () => {
    const res = await request(app).get("/api/browser/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.engines).toContain("chromium");
  });
});

describe("Browser: auth gate", () => {
  it("requires auth for run endpoints", async () => {
    const res = await request(app).get("/api/browser/runs");
    expect(res.status).toBe(401);
  });

  it("rejects Free-plan users on POST /runs (Pro+ required)", async () => {
    const { authHeader } = await createAuthedUser();
    const res = await request(app)
      .post("/api/browser/runs")
      .set("Authorization", authHeader)
      .send({ goal: "Look up weather", url: "https://example.com" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PLAN_REQUIRED");
  });
});

describe("Browser: run lifecycle (permission gated, no real browser launch)", () => {
  it("starting a run for a new origin requires user approval (202)", async () => {
    const { authHeader } = await proUser();

    const res = await request(app)
      .post("/api/browser/runs")
      .set("Authorization", authHeader)
      .send({ goal: "Look up today's weather", url: "https://example.com" });

    expect(res.status).toBe(202);
    expect(res.body.needsApproval).toBe(true);
    expect(res.body.approval.origin).toBe("https://example.com");
    expect(res.body.snapshot.status).toBe("awaiting_approval");

    // Deny to release the pending in-memory approval promptly.
    await request(app)
      .post(`/api/browser/approvals/${res.body.approval.approvalId}`)
      .set("Authorization", authHeader)
      .send({ choice: "deny" });
  });

  it("never accepts a client-supplied autoApprove to bypass permission checks", async () => {
    const { authHeader } = await proUser();
    const res = await request(app)
      .post("/api/browser/runs")
      .set("Authorization", authHeader)
      .send({ goal: "test", url: "https://example.org", autoApprove: "always_allow" });

    // Controller hard-codes autoApprove: null — client input must be ignored.
    expect(res.status).toBe(202);
    expect(res.body.needsApproval).toBe(true);

    await request(app)
      .post(`/api/browser/approvals/${res.body.approval.approvalId}`)
      .set("Authorization", authHeader)
      .send({ choice: "deny" });
  });

  it("rejects an invalid approval choice", async () => {
    const { authHeader } = await proUser();
    const started = await request(app)
      .post("/api/browser/runs")
      .set("Authorization", authHeader)
      .send({ goal: "test", url: "https://example.net" });

    const res = await request(app)
      .post(`/api/browser/approvals/${started.body.approval.approvalId}`)
      .set("Authorization", authHeader)
      .send({ choice: "yolo" });
    expect(res.status).toBe(400);

    await request(app)
      .post(`/api/browser/approvals/${started.body.approval.approvalId}`)
      .set("Authorization", authHeader)
      .send({ choice: "deny" });
  });

  it("lists only the caller's own runs and pending approvals (IDOR)", async () => {
    const owner = await proUser();
    const attacker = await proUser();

    const started = await request(app)
      .post("/api/browser/runs")
      .set("Authorization", owner.authHeader)
      .send({ goal: "test", url: "https://owned.example" });
    const { runId } = started.body;

    const attackerRuns = await request(app).get("/api/browser/runs").set("Authorization", attacker.authHeader);
    expect(attackerRuns.body.runs.find((r) => r.runId === runId)).toBeUndefined();

    const attackerGet = await request(app).get(`/api/browser/runs/${runId}`).set("Authorization", attacker.authHeader);
    expect(attackerGet.status).toBe(404);

    const attackerApprovals = await request(app)
      .get("/api/browser/approvals")
      .set("Authorization", attacker.authHeader);
    expect(attackerApprovals.body.approvals).toHaveLength(0);

    const ownerApprovals = await request(app).get("/api/browser/approvals").set("Authorization", owner.authHeader);
    expect(ownerApprovals.body.approvals.length).toBeGreaterThan(0);

    await request(app)
      .post(`/api/browser/approvals/${started.body.approval.approvalId}`)
      .set("Authorization", owner.authHeader)
      .send({ choice: "deny" });
  });

  it("a denied approval eventually cancels the run", async () => {
    const { authHeader } = await proUser();
    const started = await request(app)
      .post("/api/browser/runs")
      .set("Authorization", authHeader)
      .send({ goal: "test", url: "https://deny-me.example" });

    await request(app)
      .post(`/api/browser/approvals/${started.body.approval.approvalId}`)
      .set("Authorization", authHeader)
      .send({ choice: "deny" });

    await new Promise((r) => setTimeout(r, 50));

    const run = await request(app).get(`/api/browser/runs/${started.body.runId}`).set("Authorization", authHeader);
    expect(run.body.run.status).toBe("cancelled");
  });

  it("resolving an unknown approval id fails cleanly", async () => {
    const { authHeader } = await proUser();
    const res = await request(app)
      .post("/api/browser/approvals/appr_does_not_exist")
      .set("Authorization", authHeader)
      .send({ choice: "deny" });
    expect(res.status).toBe(400);
  });

  it("pause/resume/stop 404 for a run that doesn't belong to the caller", async () => {
    const owner = await proUser();
    const attacker = await proUser();
    const started = await request(app)
      .post("/api/browser/runs")
      .set("Authorization", owner.authHeader)
      .send({ goal: "test", url: "https://another.example" });

    const pause = await request(app)
      .post(`/api/browser/runs/${started.body.runId}/pause`)
      .set("Authorization", attacker.authHeader);
    expect(pause.status).toBe(404);

    const stop = await request(app)
      .post(`/api/browser/runs/${started.body.runId}/stop`)
      .set("Authorization", attacker.authHeader);
    expect(stop.status).toBe(404);

    await request(app)
      .post(`/api/browser/approvals/${started.body.approval.approvalId}`)
      .set("Authorization", owner.authHeader)
      .send({ choice: "deny" });
  });
});

describe("Browser: permissions", () => {
  it("lists no permissions for a fresh user", async () => {
    const { authHeader } = await createAuthedUser();
    const res = await request(app).get("/api/browser/permissions").set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(res.body.permissions).toEqual([]);
  });

  it("requires an origin to revoke", async () => {
    const { authHeader } = await createAuthedUser();
    const res = await request(app)
      .post("/api/browser/permissions/revoke")
      .set("Authorization", authHeader)
      .send({});
    expect(res.status).toBe(400);
  });

  it("revoking a non-existent permission is a safe no-op", async () => {
    const { authHeader } = await createAuthedUser();
    const res = await request(app)
      .post("/api/browser/permissions/revoke")
      .set("Authorization", authHeader)
      .send({ origin: "https://never-granted.example" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
