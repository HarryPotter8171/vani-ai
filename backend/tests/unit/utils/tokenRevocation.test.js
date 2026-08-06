import { describe, it, expect, beforeEach, vi } from "vitest";
import { signAccessToken, verifyAccessToken } from "../../../utils/jwt.js";
import {
  revokeAccessToken,
  isAccessTokenRevoked,
  isAccessTokenRevokedLocal,
  __resetTokenRevocationForTests,
} from "../../../utils/tokenRevocation.js";

describe("utils/tokenRevocation", () => {
  beforeEach(() => {
    __resetTokenRevocationForTests();
  });

  it("reports a fresh token as not revoked", async () => {
    const token = await signAccessToken({ email: "fresh@example.com" });
    expect(await isAccessTokenRevoked(token)).toBe(false);
  });

  it("marks a token revoked after revokeAccessToken", async () => {
    const token = await signAccessToken({ email: "revoke-me@example.com" });
    expect(await isAccessTokenRevoked(token)).toBe(false);
    await revokeAccessToken(token);
    expect(await isAccessTokenRevoked(token)).toBe(true);
    expect(isAccessTokenRevokedLocal(token)).toBe(true);
  });

  it("is a no-op for empty/undefined tokens", async () => {
    await expect(revokeAccessToken(null)).resolves.toBeUndefined();
    await expect(revokeAccessToken(undefined)).resolves.toBeUndefined();
    expect(await isAccessTokenRevoked(null)).toBe(false);
    expect(await isAccessTokenRevoked("")).toBe(false);
  });

  it("does not falsely revoke a different valid token (multi-session)", async () => {
    const tokenA = await signAccessToken({ email: "a@example.com" });
    const tokenB = await signAccessToken({ email: "b@example.com" });
    await revokeAccessToken(tokenA);
    expect(await isAccessTokenRevoked(tokenA)).toBe(true);
    expect(await isAccessTokenRevoked(tokenB)).toBe(false);
    await expect(verifyAccessToken(tokenB)).resolves.toMatchObject({
      email: "b@example.com",
    });
  });

  it("revokes by raw token hash even for malformed JWTs", async () => {
    const fake = "not-a-real-jwt-but-still-a-string";
    await expect(revokeAccessToken(fake)).resolves.toBeUndefined();
    expect(await isAccessTokenRevoked(fake)).toBe(true);
  });

  it("verifyAccessToken rejects revoked tokens", async () => {
    const token = await signAccessToken({ email: "gone@example.com" });
    await revokeAccessToken(token);
    await expect(verifyAccessToken(token)).rejects.toMatchObject({
      code: "TOKEN_REVOKED",
    });
  });

  it("expired tokens fail verification independently of denylist", async () => {
    const token = await signAccessToken({ email: "old@example.com" }, "-10s");
    await expect(verifyAccessToken(token)).rejects.toBeTruthy();
  });

  it("uses Redis denylist when Redis client is ready (cross-replica)", async () => {
    const store = new Map();
    const redis = {
      status: "ready",
      pipeline() {
        const ops = [];
        return {
          set(key, _v, _ex, ttl) {
            ops.push(() => store.set(key, { ttl }));
            return this;
          },
          async exec() {
            for (const op of ops) op();
            return ops.map(() => [null, "OK"]);
          },
        };
      },
      async get(key) {
        return store.has(key) ? "1" : null;
      },
    };

    vi.resetModules();
    vi.doMock("../../../config/redis.js", () => ({
      isRedisConfigured: () => true,
      getRedisClient: () => redis,
    }));

    const mod = await import("../../../utils/tokenRevocation.js");
    mod.__resetTokenRevocationForTests();

    const { signAccessToken: sign } = await import("../../../utils/jwt.js");
    const token = await sign({ email: "redis-revoke@example.com" });
    await mod.revokeAccessToken(token);

    // Clear local Map to simulate another replica that only has Redis.
    mod.__resetTokenRevocationForTests();
    expect(mod.isAccessTokenRevokedLocal(token)).toBe(false);
    expect(await mod.isAccessTokenRevoked(token)).toBe(true);

    vi.doUnmock("../../../config/redis.js");
    vi.resetModules();
  });
});
