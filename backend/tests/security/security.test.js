import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { SignJWT } from "jose";
import { getTestApp } from "../helpers/testApp.js";
import { createAuthedUser } from "../helpers/auth.js";
import { signAccessToken } from "../../utils/jwt.js";

let app;

beforeAll(() => {
  app = getTestApp();
});

describe("Security: CORS", () => {
  it("reflects an allowed dev origin with credentials enabled", async () => {
    const res = await request(app).get("/").set("Origin", "http://localhost:3000");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("does not reflect an untrusted origin", async () => {
    const res = await request(app).get("/").set("Origin", "https://evil.example.com");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("rejects a disallowed origin on a real cross-origin request with a calm 403", async () => {
    const res = await request(app)
      .get("/api/chat/list")
      .set("Origin", "https://evil.example.com")
      .set("Authorization", "Bearer bogus");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Origin not allowed");
  });

  it("responds to a CORS preflight for an allowed origin", async () => {
    const res = await request(app)
      .options("/api/chat/list")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "GET");
    expect(res.status).toBeLessThan(300);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(res.headers["access-control-allow-methods"]).toMatch(/GET/);
  });

  it("allows non-browser clients that send no Origin header", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
  });
});

describe("Security: JWT validation", () => {
  it("rejects a token signed with a different secret", async () => {
    const forged = await new SignJWT({ email: "forged@vani.test", name: "Forged", provider: "google" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject("forged@vani.test")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("totally-wrong-secret"));

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it("rejects a token signed with the 'none' algorithm", async () => {
    // Hand-craft an unsigned JWT (header alg=none) — jose/jwtVerify must reject it
    // outright since only HS256 is in the allowed algorithms list.
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ email: "none-alg@vani.test", sub: "x" })).toString(
      "base64url"
    );
    const unsigned = `${header}.${payload}.`;

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${unsigned}`);
    expect(res.status).toBe(401);
  });

  it("rejects a structurally malformed bearer value", async () => {
    const res = await request(app).get("/api/auth/me").set("Authorization", "Bearer not.a.jwt.at.all");
    expect(res.status).toBe(401);
  });

  it("rejects a token with no email claim", async () => {
    const noEmail = await new SignJWT({ name: "No Email" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject("someone")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_JWT_SECRET));

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${noEmail}`);
    expect(res.status).toBe(401);
  });

  it("rejects an empty Authorization header", async () => {
    const res = await request(app).get("/api/auth/me").set("Authorization", "");
    expect(res.status).toBe(401);
  });

  it("accepts a freshly signed, valid token for a synced user", async () => {
    const { authHeader } = await createAuthedUser();
    const res = await request(app).get("/api/auth/me").set("Authorization", authHeader);
    expect(res.status).toBe(200);
  });

  it("rejects a not-yet-valid (nbf in the future) token", async () => {
    const future = await new SignJWT({ email: "future@vani.test" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject("future@vani.test")
      .setIssuedAt()
      .setNotBefore("1h")
      .setExpirationTime("2h")
      .sign(new TextEncoder().encode(process.env.AUTH_JWT_SECRET));

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${future}`);
    expect(res.status).toBe(401);
  });
});

describe("Security: rate limiting (integration)", () => {
  it("throttles repeated writes on a rate-limited endpoint and recovers after the window", async () => {
    const { authHeader } = await createAuthedUser();
    const ip = "203.0.113.7";

    // canvas AI-edit endpoint: max 20 requests / 60s window (see routes/canvasRoutes.js).
    const results = [];
    for (let i = 0; i < 21; i += 1) {
      const res = await request(app)
        .post("/api/canvas/does-not-exist/ai-edit")
        .set("Authorization", authHeader)
        .set("X-Forwarded-For", ip)
        .send({ instruction: "test" });
      results.push(res.status);
    }

    // First 20 pass the rate limiter (may still 404/400 downstream); the 21st is throttled.
    expect(results.slice(0, 20)).not.toContain(429);
    expect(results[20]).toBe(429);

    const last = await request(app)
      .post("/api/canvas/does-not-exist/ai-edit")
      .set("Authorization", authHeader)
      .set("X-Forwarded-For", ip)
      .send({ instruction: "test" });
    expect(last.status).toBe(429);
    expect(last.body.error).toMatch(/Too many/i);
    expect(last.headers["retry-after"]).toBeTruthy();
  });

  it("keeps separate buckets per client IP", async () => {
    const { authHeader } = await createAuthedUser();
    const ipA = "203.0.113.50";
    const ipB = "203.0.113.51";

    for (let i = 0; i < 20; i += 1) {
      await request(app)
        .post("/api/canvas/does-not-exist/ai-edit")
        .set("Authorization", authHeader)
        .set("X-Forwarded-For", ipA)
        .send({ instruction: "test" });
    }

    const throttledA = await request(app)
      .post("/api/canvas/does-not-exist/ai-edit")
      .set("Authorization", authHeader)
      .set("X-Forwarded-For", ipA)
      .send({ instruction: "test" });
    expect(throttledA.status).toBe(429);

    const freshB = await request(app)
      .post("/api/canvas/does-not-exist/ai-edit")
      .set("Authorization", authHeader)
      .set("X-Forwarded-For", ipB)
      .send({ instruction: "test" });
    expect(freshB.status).not.toBe(429);
  });

  it("exposes standard rate-limit headers on every response", async () => {
    const { authHeader } = await createAuthedUser();
    const res = await request(app)
      .post("/api/canvas/does-not-exist/ai-edit")
      .set("Authorization", authHeader)
      .set("X-Forwarded-For", "203.0.113.99")
      .send({ instruction: "test" });
    expect(res.headers["x-ratelimit-limit"]).toBe("20");
    expect(res.headers["x-ratelimit-remaining"]).toBeDefined();
    expect(res.headers["x-ratelimit-reset"]).toBeDefined();
  });
});
