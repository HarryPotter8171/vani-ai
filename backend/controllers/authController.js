import User from "../models/User.js";
import { decodeJwt } from "jose";
import { verifyAccessToken } from "../utils/jwt.js";
import { extractAccessToken } from "../middleware/auth.js";
import { revokeAccessToken } from "../utils/tokenRevocation.js";
import { mcpRegistry } from "../mcp/MCPRegistry.ts";
import { syncAdminRoleFromEnv } from "../middleware/requirePlatformAdmin.js";
import { subscriptionService } from "../billing/SubscriptionService.ts";
import {
  ensureMongoReady,
  isMongoUnavailableError,
  sendDatabaseUnavailable,
} from "../config/mongoReady.js";

/** Cookie names that may carry auth material on the API host (not NextAuth). */
const AUTH_COOKIE_NAMES = ["token", "access_token", "auth_token", "session"];

function clearAuthCookies(res) {
  for (const name of AUTH_COOKIE_NAMES) {
    res.clearCookie(name, { path: "/" });
    res.clearCookie(name, { path: "/", httpOnly: true, sameSite: "lax" });
  }
}

/**
 * POST /api/auth/sync
 * Provision the Mongo user from a verified access JWT (issued by the Next.js app).
 * Creates the user only when the JWT is valid — never from client email fields.
 * Never continues when Mongo is not ready (HTTP 503 within ~1s).
 */
export async function syncUser(req, res) {
  try {
    try {
      await ensureMongoReady();
    } catch {
      return sendDatabaseUnavailable(res);
    }

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

    if (claims.purpose === "file") {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const email = claims.email;
    // Name comes only from verified JWT claims (NextAuth → backend-token mint).
    const name =
      (claims.name || "").trim() || email.split("@")[0] || email;
    const provider =
      claims.provider === "email" || claims.provider === "google"
        ? claims.provider
        : "google";

    let user = await User.findOne({ email });
    if (!user) {
      try {
        user = await User.create({
          name,
          email,
          provider,
        });
      } catch (createErr) {
        // Concurrent syncs can both miss then race on the unique email index.
        if (createErr?.code === 11000) {
          user = await User.findOne({ email });
        }
        if (!user) throw createErr;
      }
    } else if (name && user.name !== name) {
      // Keep Mongo user.name aligned with the authenticated session profile.
      user.name = name;
      await user.save();
    }

    // Bootstrap platform admins from VANI_ADMIN_EMAILS (promote only).
    user = (await syncAdminRoleFromEnv(user)) || user;

    // Playwright E2E needs Pro+ for MCP / browser feature gates (VANI_E2E_MODE only).
    if (process.env.VANI_E2E_MODE === "true") {
      try {
        await subscriptionService.changePlan(String(user._id), "pro");
      } catch (planErr) {
        console.warn("[auth/sync] E2E Pro plan bootstrap failed", planErr?.message || planErr);
      }
    }

    return res.json({
      user: {
        id: String(user._id),
        email: user.email,
        name: user.name,
        provider: user.provider,
        role: user.role === "admin" ? "admin" : "user",
      },
    });
  } catch (err) {
    if (isMongoUnavailableError(err)) {
      return sendDatabaseUnavailable(res);
    }
    if (err.code === "AUTH_SECRET_MISSING") {
      console.error("[auth/sync]", err.message);
      return res.status(500).json({ error: "Unable to sign in right now. Please try again." });
    }
    console.error("[auth/sync]", err);
    return res.status(500).json({ error: "Unable to sync user" });
  }
}

/**
 * GET /api/auth/me
 * Return the Mongo account for the verified access JWT.
 * Not the UI identity source of truth — that is the NextAuth session.
 */
export async function getMe(req, res) {
  return res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role === "admin" ? "admin" : "user",
    },
  });
}

/**
 * POST /api/auth/revoke
 * Invalidate a JWT without ending the broader logout cleanup (no MCP wipe).
 * Used when rotating access tokens so replaced tokens cannot linger.
 */
export async function revokeToken(req, res) {
  try {
    const token = extractAccessToken(req);
    if (token) await revokeAccessToken(token);
    return res.json({ success: true });
  } catch (err) {
    console.error("[auth/revoke]", err);
    return res.json({ success: true });
  }
}

/**
 * POST /api/auth/logout
 * Invalidate the current access JWT, drop auth cookies, and clear per-user
 * in-memory MCP state. Always returns success so clients can finish cleanup
 * even when the token is already gone.
 */
export async function logout(req, res) {
  try {
    const token = extractAccessToken(req);
    let userId = null;

    if (token) {
      try {
        const payload = decodeJwt(String(token));
        const email = String(payload.email || "")
          .toLowerCase()
          .trim();
        if (email && payload.purpose !== "file") {
          try {
            await ensureMongoReady();
            const user = await User.findOne({ email }).select("_id");
            if (user) userId = String(user._id);
          } catch {
            /* DB down — still revoke token + clear cookies */
          }
        }
      } catch {
        /* token may already be invalid — still revoke + clear cookies */
      }
      await revokeAccessToken(token);
    }

    if (userId) {
      try {
        mcpRegistry.clearUser(userId);
      } catch (err) {
        console.warn("[auth/logout] MCP clear failed:", err?.message || err);
      }
    }

    clearAuthCookies(res);
    return res.json({ success: true });
  } catch (err) {
    console.error("[auth/logout]", err);
    clearAuthCookies(res);
    return res.json({ success: true });
  }
}
