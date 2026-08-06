/**
 * Teams (Business+) — durable workspaces with membership.
 * Plan gating is enforced at the router (`usageGuardFeature("teams")`).
 */

import {
  TeamNotFoundError,
  TeamValidationError,
  createTeam as createTeamRecord,
  getTeamForUser,
  listTeamsForUser,
} from "../services/teamService.js";

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
  if (err instanceof TeamValidationError) {
    return res.status(400).json({ error: err.message, code: err.code });
  }
  if (err instanceof TeamNotFoundError) {
    return res.status(404).json({
      error: err.message,
      code: err.code,
    });
  }
  if (err.status === 401) {
    return res.status(401).json({ error: err.message || "Authentication required" });
  }
  console.error("[teams]", err);
  return res.status(500).json({ error: err.message || "Teams request failed" });
}

export const listTeams = async (req, res) => {
  try {
    const user = resolveUser(req);
    const teams = await listTeamsForUser(user._id, {
      includeArchived: req.query.includeArchived === "true",
      limit: req.query.limit,
    });
    return res.json({
      ok: true,
      teams,
      planId: planIdFromReq(req),
    });
  } catch (err) {
    return handleError(res, err);
  }
};

export const createTeam = async (req, res) => {
  try {
    const user = resolveUser(req);
    const team = await createTeamRecord(user, req.body || {});
    return res.status(201).json({
      ok: true,
      team,
      planId: planIdFromReq(req),
    });
  } catch (err) {
    return handleError(res, err);
  }
};

export const getTeam = async (req, res) => {
  try {
    const user = resolveUser(req);
    const team = await getTeamForUser(req.params.id, user._id);
    return res.json({
      ok: true,
      team,
      planId: planIdFromReq(req),
    });
  } catch (err) {
    if (err instanceof TeamNotFoundError) {
      return res.status(404).json({
        error: err.message,
        code: err.code,
        teamId: req.params.id,
      });
    }
    return handleError(res, err);
  }
};
