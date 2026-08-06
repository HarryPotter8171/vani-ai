/**
 * Shared constants / errors for the image processing pipeline.
 * OCR + metadata only — no generation, chunking, embeddings, or RAG.
 * Format allowlist stays aligned with services/vision for Vision uploads.
 */

export const SUPPORTED_IMAGE_EXTENSIONS = Object.freeze([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".heic",
  ".heif",
  ".bmp",
]);

export const SUPPORTED_IMAGE_MIMES = Object.freeze([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/bmp",
  "image/x-ms-bitmap",
  "image/x-bmp",
]);

/** Max edge length fed to OCR (keeps Tesseract responsive on large photos). */
export const OCR_MAX_EDGE = Number(process.env.VANI_OCR_MAX_EDGE) || 2000;

/** Hard cap on persisted / injected OCR text. */
export const OCR_MAX_CHARS = Number(process.env.VANI_OCR_MAX_CHARS) || 20_000;

/** Tesseract language pack(s). Default eng+hin for mixed Indic documents. */
export const OCR_LANG = process.env.VANI_OCR_LANG || "eng+hin";

export class UnsupportedImageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnsupportedImageError";
    this.code = "UNSUPPORTED_IMAGE";
  }
}

export class ImageProcessingError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "ImageProcessingError";
    this.code = "IMAGE_PROCESSING_FAILED";
    this.cause = cause;
  }
}

export function getExtension(filename = "") {
  const i = String(filename).lastIndexOf(".");
  return i >= 0 ? String(filename).slice(i).toLowerCase() : "";
}

export function normalizeImageMime(mimeType = "") {
  const mime = String(mimeType || "").toLowerCase().trim();
  if (mime === "image/jpg") return "image/jpeg";
  if (mime === "image/x-ms-bitmap" || mime === "image/x-bmp") return "image/bmp";
  if (mime === "image/heif") return "image/heic";
  if (
    mime === "image/jpeg" ||
    mime === "image/png" ||
    mime === "image/webp" ||
    mime === "image/gif" ||
    mime === "image/heic" ||
    mime === "image/bmp"
  ) {
    return mime;
  }
  return mime;
}

export function isSupportedImage({ filename = "", mimeType = "" } = {}) {
  const ext = getExtension(filename);
  if (SUPPORTED_IMAGE_EXTENSIONS.includes(ext)) return true;
  const mime = normalizeImageMime(mimeType);
  return SUPPORTED_IMAGE_MIMES.includes(mime);
}

export function normalizePlainText(text = "") {
  return String(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
