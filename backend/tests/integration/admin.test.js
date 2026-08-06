import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { getTestApp } from "../helpers/testApp.js";
import { createAuthedUser } from "../helpers/auth.js";
import { subscriptionService } from "../../billing/SubscriptionService.ts";
import Organization from "../../models/Organization.js";

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
    patch: (url) => withHeaders(request(app).patch(url)),
  };
}

describe("Org Admin API", () => {
  it("requires auth", async () => {
    const res = await request(app).get("/api/admin");
    expect(res.status).toBe(401);
  });

  it("rejects Free-plan users (Business+ required)", async () => {
    const { authHeader, ip } = await createAuthedUser();
    const res = await client({ authHeader, ip }).get("/api/admin");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PLAN_REQUIRED");
  });

  it("auto-provisions an organization on overview", async () => {
    const authed = await businessUser({ name: "Ada Lovelace" });
    const res = await client(authed).get("/api/admin");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.admin).toMatchObject({
      planId: "business",
      members: 1,
      callerRole: "owner",
      roles: ["owner", "admin", "member"],
    });
    expect(res.body.admin.orgId).toBeTruthy();
    expect(res.body.admin.name).toContain("Ada");
    expect(res.body.admin.seats).toMatchObject({
      used: 1,
      unlimited: false,
    });
    expect(res.body.admin.seats.limit).toBe(10);
    expect(res.body.admin.seats.remaining).toBe(9);
    expect(res.body.admin.settings).toMatchObject({
      allowMemberInvites: true,
      requireAdminForSharedProjects: false,
    });

    const stored = await Organization.findById(res.body.admin.orgId).lean();
    expect(stored).toBeTruthy();
    expect(String(stored.owner)).toBe(String(authed.user._id));
  });

  it("lists durable members (owner)", async () => {
    const authed = await businessUser();
    await client(authed).get("/api/admin");

    const res = await client(authed).get("/api/admin/members");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0]).toMatchObject({
      userId: String(authed.user._id),
      email: authed.user.email,
      role: "owner",
      status: "active",
    });
  });

  it("persists org settings for owners", async () => {
    const authed = await businessUser();
    await client(authed).get("/api/admin");

    const res = await client(authed)
      .patch("/api/admin/settings")
      .send({
        displayName: "VANI Labs",
        defaultTimezone: "Asia/Kolkata",
        allowMemberInvites: false,
        requireAdminForSharedProjects: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.name).toBe("VANI Labs");
    expect(res.body.settings).toMatchObject({
      displayName: "VANI Labs",
      defaultTimezone: "Asia/Kolkata",
      allowMemberInvites: false,
      requireAdminForSharedProjects: true,
    });

    const overview = await client(authed).get("/api/admin");
    expect(overview.body.admin.name).toBe("VANI Labs");
    expect(overview.body.admin.settings.defaultTimezone).toBe("Asia/Kolkata");
  });

  it("rejects unknown settings fields", async () => {
    const authed = await businessUser();
    const res = await client(authed)
      .patch("/api/admin/settings")
      .send({ displayName: "Ok", evil: true });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION");
  });

  it("reuses the same organization across calls", async () => {
    const authed = await businessUser();
    const a = (await client(authed).get("/api/admin")).body.admin.orgId;
    const b = (await client(authed).get("/api/admin")).body.admin.orgId;
    expect(a).toBe(b);
    expect(await Organization.countDocuments({ owner: authed.user._id })).toBe(1);
  });

  it("isolates organizations per owner", async () => {
    const alice = await businessUser();
    const bob = await businessUser();
    const aliceOrg = (await client(alice).get("/api/admin")).body.admin.orgId;
    const bobOrg = (await client(bob).get("/api/admin")).body.admin.orgId;
    expect(aliceOrg).not.toBe(bobOrg);

    const aliceMembers = await client(alice).get("/api/admin/members");
    expect(aliceMembers.body.members.every((m) => m.userId === String(alice.user._id))).toBe(
      true
    );
  });

  it("uses unlimited seats for Enterprise", async () => {
    const authed = await createAuthedUser();
    await subscriptionService.changePlan(String(authed.user._id), "enterprise");
    const res = await client(authed).get("/api/admin");
    expect(res.status).toBe(200);
    expect(res.body.admin.seats).toMatchObject({
      used: 1,
      limit: null,
      remaining: null,
      unlimited: true,
    });
  });
});
