/**
 * Platform admin gate — distinct from Business plan "admin" feature.
 * Requires requireAuth first; checks User.role === 'admin'.
 */

import User from "../models/User.js";

/**
 * Parse VANI_ADMIN_EMAILS (comma-separated) into a lowercase Set.
 */
export function getAdminEmailSet() {
  const raw = process.env.VANI_ADMIN_EMAILS || "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

/** Promote / demote role from env allow-list (idempotent). */
export async function syncAdminRoleFromEnv(userDoc) {
  if (!userDoc?.email) return userDoc;
  const emails = getAdminEmailSet();
  if (!emails.size) return userDoc;
  const shouldBeAdmin = emails.has(String(userDoc.email).toLowerCase());
  // Only auto-promote from env; never auto-demote (manual DB grants stick).
  if (shouldBeAdmin && userDoc.role !== "admin") {
    userDoc.role = "admin";
    await userDoc.save();
  }
  return userDoc;
}

export function isPlatformAdmin(user) {
  return user?.role === "admin";
}

/**
 * Express middleware — 403 unless authenticated platform admin.
 */
export async function requirePlatformAdmin(req, res, next) {
  try {
    if (!req.user?._id && !req.user?.id) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Prefer role already attached by auth; re-fetch if missing.
    let role = req.user.role;
    if (role !== "admin") {
      const doc = await User.findById(req.user._id || req.user.id)
        .select("role email")
        .lean();
      role = doc?.role;
      // Env allow-list fallback for freshly configured admins mid-session.
      if (role !== "admin" && doc?.email) {
        const emails = getAdminEmailSet();
        if (emails.has(String(doc.email).toLowerCase())) {
          await User.updateOne(
            { _id: doc._id || req.user._id || req.user.id },
            { $set: { role: "admin" } }
          );
          role = "admin";
        }
      }
    }

    if (role !== "admin") {
      return res.status(403).json({
        error: "Platform admin access required",
        code: "ADMIN_REQUIRED",
      });
    }

    req.user.role = "admin";
    return next();
  } catch (err) {
    console.error("[requirePlatformAdmin]", err);
    return res.status(500).json({ error: "Unable to verify admin access" });
  }
}
