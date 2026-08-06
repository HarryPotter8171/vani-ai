import { describe, it, expect, beforeEach } from "vitest";
import {
  signAccessToken,
  verifyAccessToken,
  signFileAccessToken,
  getAuthSecretKey,
} from "../../../utils/jwt.js";

describe("utils/jwt", () => {
  describe("getAuthSecretKey", () => {
    it("returns an encoded key when AUTH_JWT_SECRET is set", () => {
      const key = getAuthSecretKey();
      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBeGreaterThan(0);
    });

    it("throws AUTH_SECRET_MISSING when no secret is configured", () => {
      const prevAuth = process.env.AUTH_JWT_SECRET;
      const prevNextAuth = process.env.NEXTAUTH_SECRET;
      delete process.env.AUTH_JWT_SECRET;
      delete process.env.NEXTAUTH_SECRET;
      try {
        expect(() => getAuthSecretKey()).toThrowError();
        try {
          getAuthSecretKey();
        } catch (err) {
          expect(err.code).toBe("AUTH_SECRET_MISSING");
        }
      } finally {
        process.env.AUTH_JWT_SECRET = prevAuth;
        process.env.NEXTAUTH_SECRET = prevNextAuth;
      }
    });
  });

  describe("signAccessToken / verifyAccessToken", () => {
    it("round-trips claims through sign and verify", async () => {
      const token = await signAccessToken({
        email: "Alice@Example.com ",
        name: "Alice",
        provider: "google",
      });
      expect(typeof token).toBe("string");

      const claims = await verifyAccessToken(token);
      expect(claims.email).toBe("alice@example.com"); // lowercased + trimmed
      expect(claims.name).toBe("Alice");
      expect(claims.provider).toBe("google");
      expect(claims.purpose).toBeUndefined();
    });

    it("rejects tokens missing an email claim", async () => {
      await expect(signAccessToken({ email: "" })).rejects.toMatchObject({
        code: "INVALID_CLAIMS",
      });
    });

    it("rejects a malformed / tampered token", async () => {
      const token = await signAccessToken({ email: "bob@example.com" });
      const tampered = token.slice(0, -2) + (token.slice(-2) === "aa" ? "bb" : "aa");
      await expect(verifyAccessToken(tampered)).rejects.toBeTruthy();
    });

    it("rejects an expired token", async () => {
      const token = await signAccessToken({ email: "carol@example.com" }, "-1s");
      await expect(verifyAccessToken(token)).rejects.toBeTruthy();
    });

    it("defaults provider to google and sub to email when omitted", async () => {
      const token = await signAccessToken({ email: "dan@example.com" });
      const claims = await verifyAccessToken(token);
      expect(claims.provider).toBe("google");
      expect(claims.sub).toBe("dan@example.com");
    });
  });

  describe("signFileAccessToken", () => {
    it("produces a token carrying purpose=file, fileId, userId", async () => {
      const token = await signFileAccessToken({ fileId: "file123", userId: "user456" });
      const claims = await verifyAccessToken(token);
      expect(claims.purpose).toBe("file");
      expect(claims.fileId).toBe("file123");
      expect(claims.userId).toBe("user456");
    });

    it("requires both fileId and userId", async () => {
      await expect(signFileAccessToken({ fileId: "only-file" })).rejects.toMatchObject({
        code: "INVALID_CLAIMS",
      });
      await expect(signFileAccessToken({ userId: "only-user" })).rejects.toMatchObject({
        code: "INVALID_CLAIMS",
      });
    });
  });
});
