import Organization, { ORG_ROLES } from "../models/Organization.js";

export class OrgValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "OrgValidationError";
    this.code = "VALIDATION";
    this.status = 400;
  }
}

export class OrgForbiddenError extends Error {
  constructor(message = "Insufficient organization permissions") {
    super(message);
    this.name = "OrgForbiddenError";
    this.code = "FORBIDDEN";
    this.status = 403;
  }
}

const SETTINGS_KEYS = [
  "displayName",
  "defaultTimezone",
  "allowMemberInvites",
  "requireAdminForSharedProjects",
];

/** Default seat caps by plan — Enterprise unlimited; Business soft cap. */
export function defaultSeatLimitForPlan(planId) {
  const id = String(planId || "business").toLowerCase();
  if (id === "enterprise") {
    const raw = process.env.VANI_ORG_DEFAULT_SEATS_ENTERPRISE;
    if (raw != null && raw !== "") {
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
    return -1;
  }
  const raw = process.env.VANI_ORG_DEFAULT_SEATS_BUSINESS;
  if (raw != null && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 1) return n;
  }
  return 10;
}

function memberForUser(doc, userId) {
  const uid = String(userId);
  return (doc.members || []).find((m) => String(m.user) === uid) || null;
}

function activeMemberCount(doc) {
  return (doc.members || []).filter((m) => m.status === "active").length;
}

function serializeSettings(settings = {}) {
  const s = settings?.toObject?.() ?? settings ?? {};
  return {
    displayName: String(s.displayName || ""),
    defaultTimezone: String(s.defaultTimezone || ""),
    allowMemberInvites: s.allowMemberInvites !== false,
    requireAdminForSharedProjects: Boolean(s.requireAdminForSharedProjects),
  };
}

export function serializeMember(m) {
  return {
    userId: String(m.user),
    email: m.email,
    name: m.name || "",
    role: m.role,
    status: m.status,
    joinedAt: m.joinedAt ? new Date(m.joinedAt).toISOString() : null,
  };
}

export function serializeSeats(doc) {
  const limit = Number(doc.seatLimit);
  const used = activeMemberCount(doc);
  const unlimited = limit < 0;
  return {
    limit: unlimited ? null : limit,
    used,
    remaining: unlimited ? null : Math.max(0, limit - used),
    unlimited,
  };
}

export function serializeOrganization(doc, userId) {
  if (!doc) return null;
  const membership = memberForUser(doc, userId);
  const settings = serializeSettings(doc.settings);
  return {
    id: String(doc._id),
    name: doc.name,
    ownerId: String(doc.owner),
    seats: serializeSeats(doc),
    memberCount: Array.isArray(doc.members) ? doc.members.length : 0,
    roles: ORG_ROLES.slice(),
    callerRole: membership?.role || null,
    settings,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  };
}

function defaultOrgName(user) {
  const base = String(user.name || "")
    .trim()
    .slice(0, 80);
  if (base) return `${base}'s Organization`.slice(0, 120);
  const email = String(user.email || "")
    .trim()
    .split("@")[0]
    .slice(0, 60);
  return `${email || "VANI"} Organization`.slice(0, 120);
}

/**
 * Resolve the caller's organization, creating one if they are a Business+ billing owner.
 * One org per owner (unique). Membership lookup covers the owner after create.
 *
 * @param {{ _id: import("mongoose").Types.ObjectId, email?: string, name?: string }} user
 * @param {{ planId?: string | null }} opts
 */
export async function getOrCreateOrganization(user, { planId = "business" } = {}) {
  const existing = await Organization.findOne({
    "members.user": user._id,
  }).lean();
  if (existing) return existing;

  const email = String(user.email || "")
    .trim()
    .toLowerCase();
  if (!email) {
    throw new OrgValidationError("Authenticated user email is required");
  }

  const now = new Date();
  const name = defaultOrgName(user);
  try {
    const created = await Organization.create({
      name,
      owner: user._id,
      seatLimit: defaultSeatLimitForPlan(planId),
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
      settings: {
        displayName: name,
        defaultTimezone: "",
        allowMemberInvites: true,
        requireAdminForSharedProjects: false,
      },
    });
    return created.toObject();
  } catch (err) {
    // Race: another request created the owner org first.
    if (err?.code === 11000) {
      const raced = await Organization.findOne({ owner: user._id }).lean();
      if (raced) return raced;
      const asMember = await Organization.findOne({
        "members.user": user._id,
      }).lean();
      if (asMember) return asMember;
    }
    throw err;
  }
}

export async function getAdminOverview(user, { planId = null } = {}) {
  const doc = await getOrCreateOrganization(user, { planId });
  const org = serializeOrganization(doc, user._id);
  return {
    orgId: org.id,
    name: org.name,
    planId: planId || null,
    seats: org.seats,
    members: org.memberCount,
    roles: org.roles,
    callerRole: org.callerRole,
    settings: org.settings,
  };
}

export async function listOrgMembers(user, { planId = null } = {}) {
  const doc = await getOrCreateOrganization(user, { planId });
  return {
    orgId: String(doc._id),
    members: (doc.members || []).map(serializeMember),
  };
}

function normalizeSettingsPatch(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new OrgValidationError("Settings body must be an object");
  }

  const patch = {};
  for (const key of SETTINGS_KEYS) {
    if (body[key] === undefined) continue;
    if (key === "displayName" || key === "defaultTimezone") {
      patch[key] = String(body[key] ?? "")
        .trim()
        .slice(0, key === "displayName" ? 120 : 80);
    } else if (
      key === "allowMemberInvites" ||
      key === "requireAdminForSharedProjects"
    ) {
      patch[key] = Boolean(body[key]);
    }
  }

  // Reject unknown keys so clients cannot silently dump arbitrary fields.
  const unknown = Object.keys(body).filter((k) => !SETTINGS_KEYS.includes(k));
  if (unknown.length) {
    throw new OrgValidationError(
      `Unknown settings fields: ${unknown.join(", ")}`
    );
  }
  if (!Object.keys(patch).length) {
    throw new OrgValidationError("No valid settings fields to update");
  }
  return patch;
}

/**
 * Persist org settings. Owner or admin only.
 * Optionally syncs `name` when `displayName` is patched.
 */
export async function updateOrgSettings(user, body, { planId = null } = {}) {
  const doc = await getOrCreateOrganization(user, { planId });
  const membership = memberForUser(doc, user._id);
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new OrgForbiddenError(
      "Only organization owners and admins can update settings"
    );
  }

  const patch = normalizeSettingsPatch(body);
  const $set = {};
  for (const [key, value] of Object.entries(patch)) {
    $set[`settings.${key}`] = value;
  }
  if (patch.displayName) {
    $set.name = patch.displayName.slice(0, 120);
  }

  const updated = await Organization.findOneAndUpdate(
    { _id: doc._id },
    { $set },
    { returnDocument: "after" }
  ).lean();

  return {
    orgId: String(updated._id),
    settings: serializeSettings(updated.settings),
    name: updated.name,
  };
}
