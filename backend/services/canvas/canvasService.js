import mongoose from "mongoose";
import Canvas, { CANVAS_TYPES } from "../../models/Canvas.js";
import CanvasVersion from "../../models/CanvasVersion.js";
import {
  createVersion,
  getVersion,
  listVersions,
} from "./canvasVersionService.js";

const MAX_CONTENT_LENGTH = 2_000_000;
const MAX_TITLE_LENGTH = 200;
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;

export class CanvasConflictError extends Error {
  constructor(current) {
    super("Canvas was modified elsewhere. Reload or overwrite to continue.");
    this.name = "CanvasConflictError";
    this.code = "CONFLICT";
    this.current = current;
  }
}

export class CanvasValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "CanvasValidationError";
    this.code = "VALIDATION";
  }
}

export class CanvasNotFoundError extends Error {
  constructor(message = "Canvas not found") {
    super(message);
    this.name = "CanvasNotFoundError";
    this.code = "NOT_FOUND";
  }
}

function assertObjectId(id, label = "id") {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new CanvasValidationError(`Invalid ${label}`);
  }
}

function normalizeType(type) {
  const value = String(type || "").toLowerCase().trim();
  if (!CANVAS_TYPES.includes(value)) {
    throw new CanvasValidationError(
      `Invalid canvas type. Expected one of: ${CANVAS_TYPES.join(", ")}`
    );
  }
  return value;
}

function normalizeTitle(title) {
  const trimmed = String(title ?? "Untitled").trim().slice(0, MAX_TITLE_LENGTH);
  return trimmed || "Untitled";
}

function normalizeContent(content) {
  if (content == null) return "";
  if (typeof content !== "string") {
    throw new CanvasValidationError("Content must be a string");
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    throw new CanvasValidationError(
      `Content exceeds maximum length of ${MAX_CONTENT_LENGTH} characters`
    );
  }
  return content;
}

export function serializeCanvas(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    userId: String(doc.user),
    chatId: doc.chat ? String(doc.chat) : null,
    title: doc.title,
    type: doc.type,
    language: doc.language ?? null,
    content: doc.content ?? "",
    pinned: Boolean(doc.pinned),
    revision: doc.revision ?? 1,
    sourceArtifactId: doc.sourceArtifactId ?? null,
    closedAt: doc.closedAt?.toISOString?.() ?? doc.closedAt ?? null,
    createdAt: doc.createdAt?.toISOString?.() ?? doc.createdAt,
    updatedAt: doc.updatedAt?.toISOString?.() ?? doc.updatedAt,
  };
}

/**
 * Create a canvas owned by userId. Always scoped to that user.
 */
export async function createCanvas(userId, input = {}) {
  if (!userId) throw new CanvasValidationError("User required");

  const type = normalizeType(input.type || "markdown");
  const title = normalizeTitle(input.title);
  const content = normalizeContent(input.content);
  const language =
    input.language != null ? String(input.language).trim().slice(0, 40) || null : null;

  let chat = null;
  if (input.chatId) {
    assertObjectId(input.chatId, "chatId");
    chat = input.chatId;
  }

  const doc = await Canvas.create({
    user: userId,
    chat,
    title,
    type,
    language,
    content,
    pinned: Boolean(input.pinned),
    revision: 1,
    sourceArtifactId: input.sourceArtifactId
      ? String(input.sourceArtifactId).slice(0, 120)
      : null,
    closedAt: null,
  });

  await createVersion(doc, { source: "create", note: "Initial version" });
  return serializeCanvas(doc);
}

/**
 * List open (or all) canvases for a user, optionally filtered by chat.
 */
export async function listCanvases(
  userId,
  { chatId, includeClosed = false, limit = DEFAULT_LIST_LIMIT, offset = 0 } = {}
) {
  if (!userId) throw new CanvasValidationError("User required");

  const filter = { user: userId };
  if (!includeClosed) filter.closedAt = null;
  if (chatId) {
    assertObjectId(chatId, "chatId");
    filter.chat = chatId;
  }

  const safeLimit = Math.min(Math.max(Number(limit) || DEFAULT_LIST_LIMIT, 1), MAX_LIST_LIMIT);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const [items, total] = await Promise.all([
    Canvas.find(filter)
      .sort({ pinned: -1, updatedAt: -1 })
      .skip(safeOffset)
      .limit(safeLimit)
      .lean(),
    Canvas.countDocuments(filter),
  ]);

  return {
    items: items.map(serializeCanvas),
    total,
    limit: safeLimit,
    offset: safeOffset,
  };
}

export async function getCanvas(userId, canvasId) {
  assertObjectId(canvasId, "canvasId");
  const doc = await Canvas.findOne({ _id: canvasId, user: userId });
  if (!doc) throw new CanvasNotFoundError();
  return serializeCanvas(doc);
}

async function loadOwned(userId, canvasId) {
  assertObjectId(canvasId, "canvasId");
  const doc = await Canvas.findOne({ _id: canvasId, user: userId });
  if (!doc) throw new CanvasNotFoundError();
  return doc;
}

/**
 * Patch canvas fields with optimistic concurrency via `expectedRevision`.
 * When expectedRevision is provided and mismatches, throws CanvasConflictError.
 */
export async function updateCanvas(userId, canvasId, patch = {}, options = {}) {
  const doc = await loadOwned(userId, canvasId);
  const { expectedRevision, source = "manual", note = "", force = false } = options;

  if (
    !force &&
    expectedRevision != null &&
    Number(expectedRevision) !== Number(doc.revision)
  ) {
    throw new CanvasConflictError(serializeCanvas(doc));
  }

  let dirty = false;

  if (patch.title !== undefined) {
    doc.title = normalizeTitle(patch.title);
    dirty = true;
  }
  if (patch.type !== undefined) {
    doc.type = normalizeType(patch.type);
    dirty = true;
  }
  if (patch.language !== undefined) {
    doc.language =
      patch.language == null ? null : String(patch.language).trim().slice(0, 40) || null;
    dirty = true;
  }
  if (patch.content !== undefined) {
    doc.content = normalizeContent(patch.content);
    dirty = true;
  }
  if (patch.pinned !== undefined) {
    doc.pinned = Boolean(patch.pinned);
    dirty = true;
  }
  if (patch.chatId !== undefined) {
    if (patch.chatId === null) {
      doc.chat = null;
    } else {
      assertObjectId(patch.chatId, "chatId");
      doc.chat = patch.chatId;
    }
    dirty = true;
  }
  if (patch.closedAt !== undefined) {
    doc.closedAt = patch.closedAt ? new Date(patch.closedAt) : null;
    dirty = true;
  }

  if (!dirty) return serializeCanvas(doc);

  doc.revision = (doc.revision || 1) + 1;
  await doc.save();

  const versionSource = source === "autosave" ? "autosave" : source === "ai" ? "ai" : "manual";
  await createVersion(doc, { source: versionSource, note });

  return serializeCanvas(doc);
}

/**
 * Background-friendly autosave: content (+ optional title) with conflict handling.
 * Returns { canvas, conflict?, saved }.
 */
export async function autosaveCanvas(
  userId,
  canvasId,
  { content, title, expectedRevision } = {}
) {
  try {
    const canvas = await updateCanvas(
      userId,
      canvasId,
      {
        ...(content !== undefined ? { content } : {}),
        ...(title !== undefined ? { title } : {}),
      },
      { expectedRevision, source: "autosave", note: "Autosave" }
    );
    return { canvas, saved: true, conflict: null };
  } catch (err) {
    if (err instanceof CanvasConflictError) {
      return { canvas: err.current, saved: false, conflict: err.current };
    }
    throw err;
  }
}

export async function renameCanvas(userId, canvasId, title) {
  return updateCanvas(userId, canvasId, { title }, { source: "manual", note: "Renamed" });
}

export async function setPinned(userId, canvasId, pinned) {
  return updateCanvas(userId, canvasId, { pinned: Boolean(pinned) }, { source: "manual" });
}

export async function closeCanvas(userId, canvasId) {
  return updateCanvas(
    userId,
    canvasId,
    { closedAt: new Date() },
    { source: "manual", note: "Closed", force: true }
  );
}

export async function reopenCanvas(userId, canvasId) {
  return updateCanvas(
    userId,
    canvasId,
    { closedAt: null },
    { source: "manual", note: "Reopened", force: true }
  );
}

export async function deleteCanvas(userId, canvasId) {
  const doc = await loadOwned(userId, canvasId);
  await CanvasVersion.deleteMany({ canvas: doc._id, user: userId });
  await Canvas.deleteOne({ _id: doc._id, user: userId });
  return { deleted: true, id: String(doc._id) };
}

export async function duplicateCanvas(userId, canvasId) {
  const source = await loadOwned(userId, canvasId);
  return createCanvas(userId, {
    title: `${source.title} (Copy)`.slice(0, MAX_TITLE_LENGTH),
    type: source.type,
    language: source.language,
    content: source.content,
    chatId: source.chat ? String(source.chat) : null,
    pinned: false,
  });
}

/**
 * Restore a historical version onto the live canvas (creates a new revision).
 */
export async function restoreVersion(userId, canvasId, versionId) {
  const version = await getVersion(userId, canvasId, versionId);
  if (!version) throw new CanvasNotFoundError("Version not found");

  return updateCanvas(
    userId,
    canvasId,
    {
      title: version.title,
      type: version.type,
      language: version.language,
      content: version.content,
      closedAt: null,
    },
    {
      source: "restore",
      note: `Restored revision ${version.revision}`,
      force: true,
    }
  );
}

export async function listCanvasVersions(userId, canvasId, opts) {
  await loadOwned(userId, canvasId);
  return listVersions(userId, canvasId, opts);
}

/**
 * Find an open canvas for a source artifact (idempotent open-from-artifact).
 */
export async function findBySourceArtifact(userId, sourceArtifactId) {
  if (!sourceArtifactId) return null;
  const doc = await Canvas.findOne({
    user: userId,
    sourceArtifactId: String(sourceArtifactId),
    closedAt: null,
  }).sort({ updatedAt: -1 });
  return serializeCanvas(doc);
}

export { CANVAS_TYPES };
