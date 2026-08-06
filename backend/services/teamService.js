import mongoose from "mongoose";
import Team from "../models/Team.js";

const MAX_LIST_LIMIT = 100;
const DEFAULT_LIST_LIMIT = 50;

export class TeamValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "TeamValidationError";
    this.code = "VALIDATION";
    this.status = 400;
  }
}

export class TeamNotFoundError extends Error {
  constructor(message = "Team not found") {
    super(message);
    this.name = "TeamNotFoundError";
    this.code = "NOT_FOUND";
    this.status = 404;
  }
}

function assertObjectId(id, label = "id") {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new TeamValidationError(`Invalid ${label}`);
  }
}

function normalizeName(name) {
  const trimmed = String(name || "").trim().slice(0, 120);
  if (!trimmed) {
    throw new TeamValidationError("name is required");
  }
  return trimmed;
}

function normalizeDescription(description) {
  return String(description || "")
    .trim()
    .slice(0, 2000);
}

function memberForUser(doc, userId) {
  const uid = String(userId);
  return (doc.members || []).find((m) => String(m.user) === uid) || null;
}

/** Public list/detail shape — includes caller's membership role. */
export function serializeTeam(doc, userId) {
  if (!doc) return null;
  const membership = memberForUser(doc, userId);
  return {
    id: String(doc._id),
    name: doc.name,
    description: doc.description || "",
    role: membership?.role || null,
    status: membership?.status || null,
    ownerId: String(doc.owner),
    memberCount: Array.isArray(doc.members) ? doc.members.length : 0,
    members: (doc.members || []).map((m) => ({
      userId: String(m.user),
      email: m.email,
      name: m.name || "",
      role: m.role,
      status: m.status,
      joinedAt: m.joinedAt ? new Date(m.joinedAt).toISOString() : null,
    })),
    archived: Boolean(doc.archived),
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  };
}

/**
 * Create a team workspace. Caller becomes owner + active member.
 * @param {{ _id: import("mongoose").Types.ObjectId, email?: string, name?: string }} user
 * @param {{ name?: string, description?: string }} payload
 */
export async function createTeam(user, payload = {}) {
  const name = normalizeName(payload.name);
  const description = normalizeDescription(payload.description);
  const email = String(user.email || "")
    .trim()
    .toLowerCase();
  if (!email) {
    throw new TeamValidationError("Authenticated user email is required");
  }

  const now = new Date();
  const team = await Team.create({
    name,
    description,
    owner: user._id,
    members: [
      {
        user: user._id,
        email,
        name: String(user.name || "").trim().slice(0, 160),
        role: "owner",
        status: "active",
        joinedAt: now,
      },
    ],
    archived: false,
  });

  return serializeTeam(team.toObject(), user._id);
}

/**
 * List teams where the user is an active (or invited) member.
 */
export async function listTeamsForUser(userId, { limit = DEFAULT_LIST_LIMIT, includeArchived = false } = {}) {
  const filter = {
    "members.user": userId,
  };
  if (!includeArchived) filter.archived = false;

  const teams = await Team.find(filter)
    .sort({ updatedAt: -1 })
    .limit(Math.min(Math.max(Number(limit) || DEFAULT_LIST_LIMIT, 1), MAX_LIST_LIMIT))
    .lean();

  return teams.map((doc) => serializeTeam(doc, userId));
}

/**
 * Get a single team if the caller is a member.
 */
export async function getTeamForUser(teamId, userId) {
  assertObjectId(teamId, "team id");

  const team = await Team.findOne({
    _id: teamId,
    "members.user": userId,
  }).lean();

  if (!team) {
    throw new TeamNotFoundError();
  }

  return serializeTeam(team, userId);
}
