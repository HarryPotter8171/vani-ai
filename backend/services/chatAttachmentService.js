import fs from "fs/promises";
import { resolveOwnedUploadedFile, resolveUploadedFile } from "./fileService.js";

/**
 * Hydrate chat message attachments that reference uploaded files (by fileId)
 * into full in-memory attachments (with dataBase64) so the existing
 * prepareMessages / tool / vision pipeline can run unchanged.
 *
 * Supports multiple files per message. Legacy base64 attachments pass through.
 * Streaming, web search, memory, and tools are unaffected — this only fills context.
 *
 * Ownership: when `ownerId` is provided (required for chat/agent paths), only
 * files owned by that user are loaded. Foreign fileIds are treated as missing.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function kindFromName(name = "", mimeType = "") {
  const lower = String(name).toLowerCase();
  const mime = String(mimeType || "").toLowerCase();

  if (mime.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.test(lower)) return "image";
  if (mime === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
  if (mime.includes("wordprocessingml") || lower.endsWith(".docx")) return "docx";
  if (mime === "text/csv" || lower.endsWith(".csv")) return "csv";
  if (
    mime.includes("spreadsheetml") ||
    mime === "application/vnd.ms-excel" ||
    /\.xlsx?$/i.test(lower)
  ) {
    return "xlsx";
  }
  if (mime.includes("zip") || lower.endsWith(".zip")) return "zip";
  if (mime === "text/markdown" || /\.(md|markdown)$/i.test(lower)) return "markdown";
  if (mime.startsWith("text/") || lower.endsWith(".txt")) return "text";
  return "unknown";
}

function isUploadId(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Load one uploaded file from disk into a chat attachment shape.
 * @param {string} fileId
 * @param {object} [overrides]
 * @param {string|null} [ownerId] — when set, enforces ownership
 */
export async function attachmentFromUploadId(fileId, overrides = {}, ownerId = null) {
  const file = ownerId
    ? await resolveOwnedUploadedFile(fileId, ownerId)
    : await resolveUploadedFile(fileId);
  const buffer = await fs.readFile(file.absolutePath);
  const mimeType = overrides.mimeType || file.mimeType || "application/octet-stream";
  const name = overrides.name || file.filename;

  return {
    id: file.id,
    fileId: file.id,
    name,
    mimeType,
    size: overrides.size || file.size,
    kind: overrides.kind || kindFromName(name, mimeType),
    dataBase64: buffer.toString("base64"),
    extractedText: overrides.extractedText,
    imageMetadata: overrides.imageMetadata,
  };
}

async function hydrateOneAttachment(att, ownerId) {
  if (!att || typeof att !== "object") return att;

  // Already has bytes (legacy client path) — keep as-is.
  if (att.dataBase64) return att;

  const fileId = att.fileId || (isUploadId(att.id) ? att.id : null);
  if (!fileId) {
    // Historical metadata-only chip (no bytes, no upload id) — leave for
    // prepareMessages to use extractedText when present.
    return att;
  }

  try {
    return await attachmentFromUploadId(fileId, att, ownerId);
  } catch (err) {
    if (err.code === "NOT_FOUND" || err.code === "INVALID_ID") {
      return {
        ...att,
        id: fileId,
        fileId,
        name: att.name || "file",
        kind: att.kind || "unknown",
        extractedText:
          att.extractedText ||
          `[Uploaded file “${att.name || fileId}” is no longer available on the server]`,
      };
    }
    throw err;
  }
}

/**
 * Merge optional top-level `fileIds` onto the latest user message as attachments.
 */
function mergeTopLevelFileIds(messages, fileIds) {
  if (!Array.isArray(fileIds) || fileIds.length === 0) return messages;

  const next = messages.map((m) => ({
    ...m,
    attachments: Array.isArray(m.attachments) ? [...m.attachments] : undefined,
  }));

  let targetIndex = -1;
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i]?.role === "user") {
      targetIndex = i;
      break;
    }
  }
  if (targetIndex < 0) return next;

  const existing = next[targetIndex].attachments || [];
  const existingIds = new Set(
    existing.map((a) => a.fileId || a.id).filter(Boolean)
  );

  const extras = fileIds
    .filter((id) => isUploadId(id) && !existingIds.has(id))
    .map((id) => ({ id, fileId: id }));

  if (extras.length) {
    next[targetIndex].attachments = [...existing, ...extras];
  }

  return next;
}

/**
 * @param {Array} messages
 * @param {{ fileIds?: string[], ownerId?: string|object }} [options]
 * @returns {Promise<Array>}
 */
export async function hydrateChatMessages(messages, options = {}) {
  if (!Array.isArray(messages) || messages.length === 0) return messages || [];

  const ownerId = options.ownerId != null ? String(options.ownerId) : null;
  if (!ownerId) {
    // Refuse unscoped hydration — prevents IDOR via fileIds.
    const err = new Error("ownerId is required to hydrate uploaded files.");
    err.code = "OWNER_REQUIRED";
    throw err;
  }

  const withIds = mergeTopLevelFileIds(messages, options.fileIds);

  return Promise.all(
    withIds.map(async (message) => {
      if (!Array.isArray(message.attachments) || message.attachments.length === 0) {
        return message;
      }
      const attachments = await Promise.all(
        message.attachments.map((att) => hydrateOneAttachment(att, ownerId))
      );
      return { ...message, attachments };
    })
  );
}
