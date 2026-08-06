import User from "../models/User.js";
import { verifyAccessToken } from "../utils/jwt.js";

/**
 * Extract bearer token from Authorization header, or access_token query
 * (for <img src> / download links that cannot set headers).
 */
export function extractAccessToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (typeof header === "string") {
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) return match[1].trim();
  }

  const queryToken = req.query?.access_token || req.query?.token;
  if (typeof queryToken === "string" && queryToken.trim()) {
    return queryToken.trim();
  }

  return null;
}

/**
 * Resolve the Mongo user for verified JWT claims.
 * Does NOT create users — identity must already exist (see POST /api/auth/sync).
 */
async function loadUserFromClaims(claims) {
  const user = await User.findOne({ email: claims.email });
  if (!user) return null;
  return {
    id: String(user._id),
    _id: user._id,
    email: user.email,
    name: user.name || "",
    provider: user.provider,
    role: user.role === "admin" ? "admin" : "user",
  };
}

/**
 * Require a valid access JWT and attach req.user.
 * Never trusts x-user-email, body.userEmail, or query.email.
 */
export async function requireAuth(req, res, next) {
  try {
    const token = extractAccessToken(req);
    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }

    let claims;
    try {
      claims = await verifyAccessToken(token);
    } catch {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // File-scoped tokens are not session credentials.
    if (claims.purpose === "file") {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const user = await loadUserFromClaims(claims);
    if (!user) {
      return res.status(401).json({
        error: "User not provisioned. Sign in again to sync your account.",
        code: "USER_NOT_SYNCED",
      });
    }

    req.user = user;
    return next();
  } catch (err) {
    if (err.code === "AUTH_SECRET_MISSING") {
      console.error("[auth]", err.message);
      return res.status(500).json({ error: "Authentication is not configured" });
    }
    console.error("[auth]", err);
    return res.status(401).json({ error: "Authentication required" });
  }
}

/**
 * Auth for file download/preview: full session JWT OR short-lived file token.
 * Sets req.user when a session token is used; sets req.fileAccess when a
 * file-scoped token matches the :id route param.
 */
export async function requireFileAccess(req, res, next) {
  try {
    const token = extractAccessToken(req);
    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }

    let claims;
    try {
      claims = await verifyAccessToken(token);
    } catch {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const fileId = req.params?.id;

    if (claims.purpose === "file") {
      if (!fileId || claims.fileId !== fileId) {
        return res.status(404).json({ error: "File not found." });
      }
      req.fileAccess = {
        fileId: claims.fileId,
        userId: claims.userId,
      };
      req.user = {
        id: claims.userId,
        _id: claims.userId,
        email: null,
        name: "",
      };
      return next();
    }

    const user = await loadUserFromClaims(claims);
    if (!user) {
      return res.status(401).json({
        error: "User not provisioned. Sign in again to sync your account.",
        code: "USER_NOT_SYNCED",
      });
    }

    req.user = user;
    return next();
  } catch (err) {
    if (err.code === "AUTH_SECRET_MISSING") {
      console.error("[auth]", err.message);
      return res.status(500).json({ error: "Authentication is not configured" });
    }
    console.error("[auth]", err);
    return res.status(401).json({ error: "Authentication required" });
  }
}

/** Convenience: authenticated user's Mongo ObjectId. */
export function userIdFromReq(req) {
  return req.user?._id || req.user?.id || null;
}
