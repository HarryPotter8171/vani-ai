import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { UPLOADS_DIR, kindForExtension } from "../config/upload.js";
import {
  ParseFailedError,
  UnsupportedFormatError,
  detectFormat,
  parseBuffer,
} from "./parsers/index.js";
import {
  ImageProcessingError,
  UnsupportedImageError,
} from "./image/index.js";
import { analyzeUploadedImage } from "./vision/visionService.js";

const META_SUFFIX = ".json";

function metaPathFor(id) {
  return path.join(UPLOADS_DIR, `${id}${META_SUFFIX}`);
}

function isSafeUploadId(id) {
  // UUIDs from upload middleware; reject path traversal / odd input early.
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Persist upload metadata beside the binary so parse / OCR / Vision
 * can recover original filename + MIME without a database.
 */
export async function writeUploadMetadata(meta) {
  const ext = path.extname(meta.filename || meta.path || "").toLowerCase();
  const ownerId = meta.ownerId != null ? String(meta.ownerId) : null;
  if (!ownerId) {
    const err = new Error("ownerId is required for uploaded files.");
    err.code = "OWNER_REQUIRED";
    throw err;
  }
  const payload = {
    id: meta.id,
    ownerId,
    filename: meta.filename,
    size: meta.size,
    mimeType: meta.mimeType,
    kind: meta.kind || kindForExtension(ext),
    // Internal relative path only — never returned in public API responses.
    path: meta.path,
    storedName: path.basename(meta.path),
    createdAt: meta.createdAt || new Date().toISOString(),
  };
  await fs.writeFile(metaPathFor(meta.id), JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

async function readSidecar(id) {
  try {
    const raw = await fs.readFile(metaPathFor(id), "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

async function findStoredBinary(id, preferredName) {
  if (preferredName) {
    const candidate = path.join(UPLOADS_DIR, path.basename(preferredName));
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // fall through to directory scan
    }
  }

  const entries = await fs.readdir(UPLOADS_DIR);
  const match = entries.find(
    (name) => name.startsWith(`${id}.`) && !name.endsWith(META_SUFFIX)
  );
  return match ? path.join(UPLOADS_DIR, match) : null;
}

/** Remove binary + sidecar (+ understanding cache) for an upload id (best-effort). */
export async function deleteUploadedFile(id) {
  if (!isSafeUploadId(id)) return;
  const sidecar = await readSidecar(id);
  const absPath = await findStoredBinary(id, sidecar?.storedName || sidecar?.path);
  const understandCache = path.join(UPLOADS_DIR, `${id}.understand.json`);
  const visionCache = path.join(UPLOADS_DIR, `${id}.vision.json`);
  const pdfIntelCache = path.join(UPLOADS_DIR, `${id}.pdfintel.json`);
  const pdfIntelIndex = path.join(UPLOADS_DIR, `${id}.pdfintel.index.json`);
  await Promise.all(
    [absPath, metaPathFor(id), understandCache, visionCache, pdfIntelCache, pdfIntelIndex]
      .filter(Boolean)
      .map(async (p) => {
      try {
        await fs.unlink(p);
      } catch (err) {
        if (err.code !== "ENOENT") console.error("deleteUploadedFile:", p, err.message);
      }
    })
  );
}

/**
 * Locate an uploaded file by id and return metadata + absolute path.
 */
export async function resolveUploadedFile(id) {
  if (!isSafeUploadId(id)) {
    const err = new Error("Invalid file id.");
    err.code = "INVALID_ID";
    throw err;
  }

  const sidecar = await readSidecar(id);
  const absPath = await findStoredBinary(id, sidecar?.storedName || sidecar?.path);

  if (!absPath) {
    const err = new Error("File not found.");
    err.code = "NOT_FOUND";
    throw err;
  }

  const storedName = path.basename(absPath);
  const filename = sidecar?.filename || storedName;
  const mimeType = sidecar?.mimeType || "";
  const size = sidecar?.size ?? (await fs.stat(absPath)).size;
  const kind = sidecar?.kind || kindForExtension(path.extname(filename));

  return {
    id,
    ownerId: sidecar?.ownerId ? String(sidecar.ownerId) : null,
    filename,
    size,
    mimeType,
    kind,
    path: sidecar?.path || path.posix.join("uploads", storedName),
    createdAt: sidecar?.createdAt,
    absolutePath: absPath,
  };
}

/**
 * Resolve a file and enforce ownership. Returns 404-shaped error on mismatch
 * (no existence oracle for other users' files).
 */
export async function resolveOwnedUploadedFile(id, ownerId) {
  const file = await resolveUploadedFile(id);
  if (!file.ownerId || String(file.ownerId) !== String(ownerId)) {
    const err = new Error("File not found.");
    err.code = "NOT_FOUND";
    throw err;
  }
  return file;
}

/**
 * Read an uploaded file from disk and extract plain text.
 * Does not chunk, embed, or index — text only.
 */
export async function parseUploadedFile(id) {
  const file = await resolveUploadedFile(id);
  const format = detectFormat({ filename: file.filename, mimeType: file.mimeType });

  if (!format) {
    throw new UnsupportedFormatError(
      `Parsing is not supported for “${file.filename}”. Supported: PDF, DOCX, TXT, Markdown, CSV, XLSX.`
    );
  }

  const buffer = await fs.readFile(file.absolutePath);
  const { text } = await parseBuffer(buffer, {
    filename: file.filename,
    mimeType: file.mimeType,
    format,
  });

  return {
    id: file.id,
    filename: file.filename,
    mimeType: file.mimeType,
    format,
    text,
  };
}

/**
 * Persist a model-generated image buffer as an owned upload so chat can
 * reference it by fileId (same path as user uploads).
 */
/**
 * Decode a generated-image payload into a Buffer.
 * Accepts Buffer, or base64 string. Never treats PNG bytes as UTF-8 text.
 */
export function decodeGeneratedImagePayload(base64OrBuffer) {
  if (Buffer.isBuffer(base64OrBuffer)) {
    return base64OrBuffer.length ? Buffer.from(base64OrBuffer) : null;
  }
  if (base64OrBuffer instanceof Uint8Array) {
    return base64OrBuffer.length ? Buffer.from(base64OrBuffer) : null;
  }
  if (typeof base64OrBuffer !== "string" || !base64OrBuffer) return null;

  const raw = base64OrBuffer.replace(/^data:[^;]+;base64,/, "");
  if (!raw) return null;

  // Raw PNG/JPEG bytes accidentally passed as a JS string — recover via latin1.
  if (
    (raw.charCodeAt(0) === 0x89 && raw.slice(1, 4) === "PNG") ||
    (raw.charCodeAt(0) === 0xff && raw.charCodeAt(1) === 0xd8)
  ) {
    return Buffer.from(raw, "latin1");
  }

  const buffer = Buffer.from(raw.replace(/\s+/g, ""), "base64");
  return buffer.length ? buffer : null;
}

export async function storeGeneratedImage({
  ownerId,
  base64,
  buffer: inputBuffer,
  mimeType = "image/png",
  prompt = "",
}) {
  if (!ownerId) {
    const err = new Error("ownerId is required for generated files.");
    err.code = "OWNER_REQUIRED";
    throw err;
  }

  const buffer = inputBuffer
    ? decodeGeneratedImagePayload(inputBuffer)
    : decodeGeneratedImagePayload(base64);
  if (!buffer?.length) {
    const err = new Error("Generated image payload is empty.");
    err.code = "EMPTY_IMAGE";
    throw err;
  }

  const mime = String(mimeType || "image/png").toLowerCase();
  const ext =
    mime === "image/jpeg" || mime === "image/jpg"
      ? ".jpg"
      : mime === "image/webp"
        ? ".webp"
        : mime === "image/gif"
          ? ".gif"
          : ".png";

  const id = crypto.randomUUID();
  const storedName = `${id}${ext}`;
  const absolutePath = path.join(UPLOADS_DIR, storedName);
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.writeFile(absolutePath, buffer);

  const safePrompt = String(prompt || "")
    .replace(/[^\w\s-]+/g, "")
    .trim()
    .slice(0, 48);
  const filename = `${safePrompt || "generated-image"}${ext}`;

  const stored = await writeUploadMetadata({
    id,
    ownerId: String(ownerId),
    filename,
    size: buffer.length,
    mimeType: mime === "image/jpg" ? "image/jpeg" : mime,
    kind: "image",
    path: path.posix.join("uploads", storedName),
  });

  return stored;
}

/**
 * OCR + metadata for an uploaded Vision image (JPG/PNG/WEBP/GIF/HEIC/BMP).
 * Uses the production Vision service (normalize → OCR → cache).
 */
export async function processUploadedImage(id) {
  const result = await analyzeUploadedImage(id);
  return {
    id: result.id,
    filename: result.filename,
    mimeType: result.mimeType,
    format: result.format,
    metadata: result.metadata,
    ocrText: result.ocrText,
    ocrConfidence: result.ocrConfidence,
    text: result.text,
  };
}

export {
  UnsupportedFormatError,
  ParseFailedError,
  UnsupportedImageError,
  ImageProcessingError,
};
