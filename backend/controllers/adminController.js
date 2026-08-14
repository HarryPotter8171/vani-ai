import { toPublicErrorMessage } from "../utils/errors.js";
/**
 * Org Admin (Business+) — durable seats, members, and settings.
 * Plan gating is enforced at the router (`usageGuardFeature("admin")`).
 * Distinct from platform analytics admin (`User.role === "admin"`).
 */

import {
  OrgForbiddenError,
  OrgValidationError,
  getAdminOverview as loadOverview,
  listOrgMembers,
  updateOrgSettings as persistOrgSettings,
} from "../services/orgAdminService.js";

/** Authenticated user from requireAuth — never trust client identity. */
function resolveUser(req) {
  if (!req.user?._id) {
    const err = new Error("Authentication required");
    err.status = 401;
    throw err;
  }
  return {
    _id: req.user._id,
    id: req.user.id,
    email: req.user.email,
    name: req.user.name,
  };
}

function planIdFromReq(req) {
  return req.plan?.planId || req.entitlements?.planId || null;
}

function handleError(res, err) {
  if (err instanceof OrgValidationError) {
    return res.status(400).json({ error: toPublicErrorMessage(err), code: err.code });
  }
  if (err instanceof OrgForbiddenError) {
    return res.status(403).json({ error: toPublicErrorMessage(err), code: err.code });
  }
  if (err.status === 401) {
    return res.status(401).json({ error: toPublicErrorMessage(err, "Authentication required") });
  }
  console.error("[admin]", err);
  return res.status(500).json({ error: toPublicErrorMessage(err, "Admin request failed") });
}

export const getAdminOverview = async (req, res) => {
  try {
    const user = resolveUser(req);
    const planId = planIdFromReq(req);
    const admin = await loadOverview(user, { planId });
    return res.json({
      ok: true,
      admin,
      planId,
    });
  } catch (err) {
    return handleError(res, err);
  }
};

export const listMembers = async (req, res) => {
  try {
    const user = resolveUser(req);
    const planId = planIdFromReq(req);
    const result = await listOrgMembers(user, { planId });
    return res.json({
      ok: true,
      orgId: result.orgId,
      members: result.members,
      planId,
    });
  } catch (err) {
    return handleError(res, err);
  }
};

export const updateOrgSettings = async (req, res) => {
  try {
    const user = resolveUser(req);
    const planId = planIdFromReq(req);
    const result = await persistOrgSettings(user, req.body || {}, { planId });
    return res.json({
      ok: true,
      orgId: result.orgId,
      name: result.name,
      settings: result.settings,
      planId,
    });
  } catch (err) {
    return handleError(res, err);
  }
};
