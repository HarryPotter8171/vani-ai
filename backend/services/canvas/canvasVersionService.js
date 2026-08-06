import CanvasVersion from "../../models/CanvasVersion.js";

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;
/** Keep a rolling history per canvas to bound storage. */
const MAX_VERSIONS_PER_CANVAS = 80;

function serializeVersion(doc, { includeContent = false } = {}) {
  if (!doc) return null;
  const base = {
    id: String(doc._id),
    canvasId: String(doc.canvas),
    userId: String(doc.user),
    revision: doc.revision,
    title: doc.title,
    type: doc.type,
    language: doc.language ?? null,
    source: doc.source,
    note: doc.note || "",
    createdAt: doc.createdAt?.toISOString?.() ?? doc.createdAt,
  };
  if (includeContent) base.content = doc.content ?? "";
  return base;
}

/**
 * Snapshot the current canvas document into the version log.
 * Skips creating a duplicate when content+title are unchanged from the latest.
 */
export async function createVersion(canvasDoc, { source = "autosave", note = "" } = {}) {
  if (!canvasDoc?._id || !canvasDoc.user) {
    throw new Error("Canvas document required to create a version");
  }

  const latest = await CanvasVersion.findOne({ canvas: canvasDoc._id })
    .sort({ revision: -1 })
    .select("revision content title type language")
    .lean();

  if (
    latest &&
    latest.content === (canvasDoc.content ?? "") &&
    latest.title === canvasDoc.title &&
    latest.type === canvasDoc.type &&
    (latest.language ?? null) === (canvasDoc.language ?? null)
  ) {
    return serializeVersion(latest, { includeContent: false });
  }

  const revision = canvasDoc.revision ?? (latest ? latest.revision + 1 : 1);

  const created = await CanvasVersion.create({
    canvas: canvasDoc._id,
    user: canvasDoc.user,
    revision,
    title: canvasDoc.title,
    type: canvasDoc.type,
    language: canvasDoc.language ?? null,
    content: canvasDoc.content ?? "",
    source,
    note: note || "",
  });

  // Prune oldest versions beyond the cap (best-effort, non-blocking for caller).
  void pruneOldVersions(canvasDoc._id).catch((err) => {
    console.error("[canvasVersion] prune failed:", err?.message || err);
  });

  return serializeVersion(created, { includeContent: false });
}

async function pruneOldVersions(canvasId) {
  const overflow = await CanvasVersion.find({ canvas: canvasId })
    .sort({ revision: -1 })
    .skip(MAX_VERSIONS_PER_CANVAS)
    .select("_id")
    .lean();

  if (!overflow.length) return;
  await CanvasVersion.deleteMany({ _id: { $in: overflow.map((v) => v._id) } });
}

export async function listVersions(userId, canvasId, { limit = DEFAULT_LIST_LIMIT, offset = 0 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || DEFAULT_LIST_LIMIT, 1), MAX_LIST_LIMIT);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const filter = { user: userId, canvas: canvasId };
  const [items, total] = await Promise.all([
    CanvasVersion.find(filter)
      .sort({ revision: -1 })
      .skip(safeOffset)
      .limit(safeLimit)
      .select("-content")
      .lean(),
    CanvasVersion.countDocuments(filter),
  ]);

  return {
    items: items.map((v) => serializeVersion(v, { includeContent: false })),
    total,
    limit: safeLimit,
    offset: safeOffset,
  };
}

export async function getVersion(userId, canvasId, versionId) {
  const doc = await CanvasVersion.findOne({
    _id: versionId,
    canvas: canvasId,
    user: userId,
  });
  if (!doc) return null;
  return serializeVersion(doc, { includeContent: true });
}

export async function getVersionByRevision(userId, canvasId, revision) {
  const doc = await CanvasVersion.findOne({
    canvas: canvasId,
    user: userId,
    revision: Number(revision),
  });
  if (!doc) return null;
  return serializeVersion(doc, { includeContent: true });
}

export { serializeVersion };
