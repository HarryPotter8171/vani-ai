import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the on-disk upload directory (backend/uploads). */
export const UPLOADS_DIR = path.resolve(__dirname, "../uploads");

/** Per-file size cap — 25 MB. */
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

/** Soft total budget across files in one multipart request. */
export const MAX_TOTAL_SIZE_BYTES = 50 * 1024 * 1024;

/** Maximum files accepted in a single request. */
export const MAX_FILES = 10;

/** Upload endpoint rate limit (per client IP). */
export const UPLOAD_RATE_LIMIT_WINDOW_MS = 60_000;
export const UPLOAD_RATE_LIMIT_MAX = 40;

/**
 * Allowed extensions → accepted MIME types.
 * Both extension and MIME must agree (octet-stream is tolerated and
 * canonicalized from the extension — many browsers send it for Office files).
 *
 * Core product types: PDF, DOCX, XLSX, CSV, TXT, PNG, JPG/JPEG, WEBP.
 * Extra types (MD, XLS, ZIP) stay enabled for future tools / knowledge ingest.
 */
export const EXTENSION_MIME_MAP = Object.freeze({
  ".jpg": ["image/jpeg", "image/jpg"],
  ".jpeg": ["image/jpeg", "image/jpg"],
  ".png": ["image/png"],
  ".webp": ["image/webp"],
  ".gif": ["image/gif"],
  ".heic": ["image/heic", "image/heif"],
  ".heif": ["image/heic", "image/heif"],
  ".bmp": ["image/bmp", "image/x-ms-bitmap", "image/x-bmp"],
  ".pdf": ["application/pdf"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".txt": ["text/plain"],
  ".md": ["text/markdown", "text/plain"],
  ".markdown": ["text/markdown", "text/plain"],
  ".csv": ["text/csv", "application/csv", "text/plain"],
  ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ".xls": ["application/vnd.ms-excel"],
  ".zip": ["application/zip", "application/x-zip-compressed"],
});

/** Canonical MIME returned in API metadata for each extension. */
export const CANONICAL_MIME_BY_EXT = Object.freeze({
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".heif": "image/heic",
  ".bmp": "image/bmp",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".csv": "text/csv",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".zip": "application/zip",
});

/** Stable kind labels reused by OCR / Vision / PDF / parsers. */
export const KIND_BY_EXT = Object.freeze({
  ".jpg": "image",
  ".jpeg": "image",
  ".png": "image",
  ".webp": "image",
  ".gif": "image",
  ".heic": "image",
  ".heif": "image",
  ".bmp": "image",
  ".pdf": "pdf",
  ".docx": "docx",
  ".txt": "text",
  ".md": "markdown",
  ".markdown": "markdown",
  ".csv": "csv",
  ".xlsx": "xlsx",
  ".xls": "xlsx",
  ".zip": "zip",
});

export const ALLOWED_EXTENSIONS = new Set(Object.keys(EXTENSION_MIME_MAP));

export function kindForExtension(ext = "") {
  return KIND_BY_EXT[String(ext).toLowerCase()] || "unknown";
}