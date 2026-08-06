import crypto from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { isAccessTokenRevoked } from "./tokenRevocation.js";

const encoder = new TextEncoder();

/**
 * Shared secret for access tokens (backend) and Next.js token minting.
 * Prefer AUTH_JWT_SECRET; fall back to NEXTAUTH_SECRET so one secret works in both apps.
 */
export function getAuthSecretKey() {
  const secret = process.env.AUTH_JWT_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret || !String(secret).trim()) {
    const err = new Error(
      "AUTH_JWT_SECRET or NEXTAUTH_SECRET must be set for authentication."
    );
    err.code = "AUTH_SECRET_MISSING";
    throw err;
  }
  return encoder.encode(String(secret));
}

/**
 * @param {{ sub?: string, email: string, name?: string, provider?: string }} claims
 * @param {string} [expiresIn]
 */
export async function signAccessToken(claims, expiresIn = "1h") {
  const email = String(claims.email || "")
    .toLowerCase()
    .trim();
  if (!email) {
    const err = new Error("email claim is required");
    err.code = "INVALID_CLAIMS";
    throw err;
  }

  return new SignJWT({
    email,
    name: claims.name || "",
    provider: claims.provider || "google",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(String(claims.sub || email))
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getAuthSecretKey());
}

/**
 * @param {string} token
 * @returns {Promise<{ sub: string, email: string, name?: string, provider?: string, purpose?: string, fileId?: string, userId?: string }>}
 */
export async function verifyAccessToken(token) {
  if (await isAccessTokenRevoked(token)) {
    const err = new Error("Token has been revoked");
    err.code = "TOKEN_REVOKED";
    throw err;
  }

  const { payload } = await jwtVerify(String(token), getAuthSecretKey(), {
    algorithms: ["HS256"],
  });

  const purpose =
    typeof payload.purpose === "string" ? payload.purpose : undefined;

  if (purpose === "file") {
    if (!payload.fileId || !payload.userId) {
      const err = new Error("Invalid file access token");
      err.code = "INVALID_TOKEN";
      throw err;
    }
    return {
      sub: String(payload.sub || payload.userId),
      email: "",
      name: "",
      provider: "google",
      purpose: "file",
      fileId: String(payload.fileId),
      userId: String(payload.userId),
    };
  }

  const email = String(payload.email || "")
    .toLowerCase()
    .trim();
  if (!email) {
    const err = new Error("Token missing email claim");
    err.code = "INVALID_TOKEN";
    throw err;
  }

  return {
    sub: String(payload.sub || email),
    email,
    name: typeof payload.name === "string" ? payload.name : "",
    provider: typeof payload.provider === "string" ? payload.provider : "google",
    purpose,
    fileId: undefined,
    userId: undefined,
  };
}

/**
 * Short-lived token scoped to a single file download/preview.
 * @param {{ fileId: string, userId: string }} claims
 */
export async function signFileAccessToken(claims, expiresIn = "15m") {
  if (!claims?.fileId || !claims?.userId) {
    const err = new Error("fileId and userId are required");
    err.code = "INVALID_CLAIMS";
    throw err;
  }

  return new SignJWT({
    purpose: "file",
    fileId: String(claims.fileId),
    userId: String(claims.userId),
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(String(claims.userId))
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getAuthSecretKey());
}
