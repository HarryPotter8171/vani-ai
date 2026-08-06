import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { getTestApp } from "../helpers/testApp.js";
import { createAuthedUser } from "../helpers/auth.js";
import { signAccessToken } from "../../utils/jwt.js";
import User from "../../models/User.js";

let app;

beforeAll(() => {
  app = getTestApp();
});

describe("POST /api/auth/sync", () => {
  it("requires a bearer token", async () => {
    const res = await request(app).post("/api/auth/sync");
    expect(res.status).toBe(401);
  });

  it("provisions a new Mongo user from verified JWT claims (never from body)", async () => {
    const token = await signAccessToken({ email: "new.user@vani.test", name: "New User" });
    const res = await request(app)
      .post("/api/auth/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "attacker@evil.com", name: "Attacker" }); // body identity must be ignored

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("new.user@vani.test");
    expect(res.body.user.name).toBe("New User");

    const stored = await User.findOne({ email: "new.user@vani.test" });
    expect(stored).toBeTruthy();
  });

  it("is idempotent — re-syncing the same email does not create a duplicate", async () => {
    const token = await signAccessToken({ email: "repeat@vani.test", name: "Repeat" });
    await request(app).post("/api/auth/sync").set("Authorization", `Bearer ${token}`);
    await request(app).post("/api/auth/sync").set("Authorization", `Bearer ${token}`);
    const count = await User.countDocuments({ email: "repeat@vani.test" });
    expect(count).toBe(1);
  });

  it("rejects a file-scoped token used as a session token", async () => {
    const { signFileAccessToken } = await import("../../utils/jwt.js");
    const fileToken = await signFileAccessToken({ fileId: "f1", userId: "u1" });
    const res = await request(app)
      .post("/api/auth/sync")
      .set("Authorization", `Bearer ${fileToken}`);
    expect(res.status).toBe(401);
  });

  it("rejects a tampered token", async () => {
    const token = await signAccessToken({ email: "x@vani.test" });
    const tampered = token.slice(0, -3) + "xyz";
    const res = await request(app).post("/api/auth/sync").set("Authorization", `Bearer ${tampered}`);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/auth/me", () => {
  it("requires auth", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns 401 with USER_NOT_SYNCED when the JWT is valid but no Mongo user exists yet", async () => {
    const token = await signAccessToken({ email: "ghost@vani.test" });
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("USER_NOT_SYNCED");
  });

  it("returns the authenticated user's profile once synced", async () => {
    const { user, authHeader } = await createAuthedUser({ email: "me@vani.test", name: "Me" });
    const res = await request(app).get("/api/auth/me").set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: String(user._id), email: "me@vani.test", name: "Me" });
  });
});

describe("POST /api/auth/logout", () => {
  it("always returns success, even with no token", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it("revokes the access token so it can no longer authenticate", async () => {
    const { authHeader } = await createAuthedUser({ email: "logout-me@vani.test" });

    // Token still works before logout.
    const before = await request(app).get("/api/auth/me").set("Authorization", authHeader);
    expect(before.status).toBe(200);

    const logoutRes = await request(app).post("/api/auth/logout").set("Authorization", authHeader);
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body).toEqual({ success: true });

    // Same token is now rejected — this is the "session expiry via logout" contract.
    const after = await request(app).get("/api/auth/me").set("Authorization", authHeader);
    expect(after.status).toBe(401);
  });

  it("clears auth cookies", async () => {
    const res = await request(app).post("/api/auth/logout");
    const cookies = res.headers["set-cookie"] || [];
    // clearCookie sets an expired cookie header for each known auth cookie name.
    expect(cookies.some((c) => c.startsWith("token="))).toBe(true);
  });
});

describe("POST /api/auth/revoke", () => {
  it("revokes a bearer token without requiring prior auth state", async () => {
    const { authHeader } = await createAuthedUser({ email: "revoke-me@vani.test" });
    const res = await request(app).post("/api/auth/revoke").set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    const after = await request(app).get("/api/auth/me").set("Authorization", authHeader);
    expect(after.status).toBe(401);
  });
});

describe("Unauthorized access to protected routes", () => {
  it("rejects requests with no Authorization header", async () => {
    const res = await request(app).get("/api/chat/list");
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Authentication required/);
  });

  it("rejects requests with a malformed Authorization header", async () => {
    const res = await request(app).get("/api/chat/list").set("Authorization", "Basic abc123");
    expect(res.status).toBe(401);
  });

  it("rejects an expired session token", async () => {
    const token = await signAccessToken({ email: "expired@vani.test" }, "-10s");
    const res = await request(app).get("/api/chat/list").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it("accepts a token passed via query string for file-style access patterns", async () => {
    const { authHeader } = await createAuthedUser({ email: "query-token@vani.test" });
    const token = authHeader.replace(/^Bearer\s+/, "");
    const res = await request(app).get(`/api/chat/list?access_token=${token}`);
    expect(res.status).toBe(200);
  });
});
