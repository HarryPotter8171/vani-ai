import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { getTestApp } from "../helpers/testApp.js";
import { createAuthedUser } from "../helpers/auth.js";
import { subscriptionService } from "../../billing/SubscriptionService.ts";

let app;

beforeAll(() => {
  app = getTestApp();
});

async function businessUser(overrides = {}) {
  const authed = await createAuthedUser(overrides);
  await subscriptionService.changePlan(String(authed.user._id), "business");
  return authed;
}

function client({ authHeader, ip }) {
  const withHeaders = (req) =>
    req.set("Authorization", authHeader).set("X-Forwarded-For", ip);
  return {
    get: (url) => withHeaders(request(app).get(url)),
    post: (url) => withHeaders(request(app).post(url)),
  };
}

describe("Teams API", () => {
  it("requires auth", async () => {
    const res = await request(app).get("/api/teams");
    expect(res.status).toBe(401);
  });

  it("rejects Free-plan users (Business+ required)", async () => {
    const { authHeader, ip } = await createAuthedUser();
    const res = await client({ authHeader, ip }).get("/api/teams");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PLAN_REQUIRED");
  });

  it("creates a durable team with the caller as owner", async () => {
    const authed = await businessUser();
    const res = await client(authed)
      .post("/api/teams")
      .send({ name: "Design", description: "Product design workspace" });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.team).toMatchObject({
      name: "Design",
      description: "Product design workspace",
      role: "owner",
      status: "active",
      ownerId: String(authed.user._id),
      memberCount: 1,
    });
    expect(res.body.team.id).toBeTruthy();
    expect(res.body.team.members).toHaveLength(1);
    expect(res.body.team.members[0]).toMatchObject({
      userId: String(authed.user._id),
      email: authed.user.email,
      role: "owner",
      status: "active",
    });
  });

  it("rejects create without a name", async () => {
    const authed = await businessUser();
    const res = await client(authed).post("/api/teams").send({ name: "  " });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION");
  });

  it("lists only teams the caller belongs to", async () => {
    const alice = await businessUser();
    const bob = await businessUser();

    await client(alice).post("/api/teams").send({ name: "Alice Team" });
    await client(alice).post("/api/teams").send({ name: "Alice Team 2" });
    await client(bob).post("/api/teams").send({ name: "Bob Team" });

    const res = await client(alice).get("/api/teams");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.teams).toHaveLength(2);
    expect(res.body.teams.every((t) => t.ownerId === String(alice.user._id))).toBe(
      true
    );
    expect(res.body.planId).toBe("business");
  });

  it("gets a team by id for members", async () => {
    const authed = await businessUser();
    const created = (
      await client(authed).post("/api/teams").send({ name: "Ops" })
    ).body.team;

    const res = await client(authed).get(`/api/teams/${created.id}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.team.id).toBe(created.id);
    expect(res.body.team.name).toBe("Ops");
    expect(res.body.team.role).toBe("owner");
  });

  it("returns 404 for non-members and unknown ids", async () => {
    const alice = await businessUser();
    const bob = await businessUser();
    const created = (
      await client(alice).post("/api/teams").send({ name: "Private" })
    ).body.team;

    const forbidden = await client(bob).get(`/api/teams/${created.id}`);
    expect(forbidden.status).toBe(404);
    expect(forbidden.body.code).toBe("NOT_FOUND");

    const missing = await client(alice).get(
      "/api/teams/000000000000000000000000"
    );
    expect(missing.status).toBe(404);
  });

  it("persists across list after create", async () => {
    const authed = await businessUser();
    const created = (
      await client(authed)
        .post("/api/teams")
        .send({ name: "Persist Me" })
    ).body.team;

    const listed = await client(authed).get("/api/teams");
    expect(listed.body.teams.some((t) => t.id === created.id)).toBe(true);
  });
});
