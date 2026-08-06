/**
 * Shared constants for the Vision (image understanding) pipeline.
 * Backend is ESM JavaScript — mirrors the requested vision/*.ts surface.
 */

export {
  OCR_MAX_EDGE,
  OCR_MAX_CHARS,
  OCR_LANG,
  UnsupportedImageError,
  ImageProcessingError,
  getExtension,
  normalizePlainText,
} from "../image/shared.js";

import {
  UnsupportedImageError,
  ImageProcessingError,
  getExtension,
} from "../image/shared.js";

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

/** Max edge length sent to the vision model (Gemini). */
export const VISION_MAX_EDGE = Number(process.env.VANI_VISION_MAX_EDGE) || 2048;

/** JPEG quality for server-side vision optimization (0–100 for sharp). */
export const VISION_JPEG_QUALITY = Number(process.env.VANI_VISION_JPEG_QUALITY) || 86;

/** Formats that must be converted before Gemini inlineData. */
export const VISION_CONVERT_EXTENSIONS = Object.freeze([
  ".heic",
  ".heif",
  ".gif",
  ".bmp",
]);

export const VISION_CONVERT_MIMES = Object.freeze([
  "image/heic",
  "image/heif",
  "image/gif",
  "image/bmp",
  "image/x-ms-bitmap",
  "image/x-bmp",
]);

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

export function needsVisionNormalization({ filename = "", mimeType = "" } = {}) {
  const ext = getExtension(filename);
  if (VISION_CONVERT_EXTENSIONS.includes(ext)) return true;
  const mime = normalizeImageMime(mimeType);
  return VISION_CONVERT_MIMES.includes(mime);
}
