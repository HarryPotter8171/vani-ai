import sharp from "sharp";
import {
  ImageProcessingError,
  UnsupportedImageError,
  isSupportedImage,
  normalizeImageMime,
} from "./shared.js";

const FORMAT_TO_MIME = Object.freeze({
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heif: "image/heic",
  heic: "image/heic",
  avif: "image/avif",
});

const ACCEPTED_SHARP_FORMATS = new Set([
  "png",
  "jpeg",
  "jpg",
  "webp",
  "gif",
  "heif",
  "heic",
  "avif",
]);

/**
 * Read production-useful image metadata via sharp (no pixels decoded beyond headers
 * when possible). Accepts Vision formats including GIF / HEIC after conversion.
 */
export async function extractImageMetadata(buffer, { filename = "", mimeType = "" } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new ImageProcessingError("Image buffer is empty.");
  }

  if (!isSupportedImage({ filename, mimeType }) && filename) {
    // Still attempt sharp detection when MIME/filename are missing; reject clearly
    // when the caller already declared an unsupported type.
    throw new UnsupportedImageError(
      `Unsupported image type${filename ? `: ${filename}` : ""}. Supported: JPG, JPEG, PNG, WEBP, GIF, HEIC, BMP.`
    );
  }

  try {
    const meta = await sharp(buffer, { failOn: "none", pages: 1 }).metadata();
    const format = String(meta.format || "").toLowerCase();

    // BMP often arrives already decoded to raw/png via vision imageProcessor.
    if (format && !ACCEPTED_SHARP_FORMATS.has(format) && format !== "raw") {
      throw new UnsupportedImageError(
        `Unsupported image format "${format || "unknown"}". Supported: JPG, JPEG, PNG, WEBP, GIF, HEIC, BMP.`
      );
    }

    const canonicalFormat =
      format === "jpg" || format === "heif" ? (format === "heif" ? "heic" : "jpeg") : format || "jpeg";

    return {
      width: meta.width || null,
      height: meta.height || null,
      format: canonicalFormat === "heif" ? "heic" : canonicalFormat,
      mimeType:
        FORMAT_TO_MIME[canonicalFormat] ||
        FORMAT_TO_MIME[format] ||
        normalizeImageMime(mimeType) ||
        null,
      space: meta.space || null,
      channels: meta.channels || null,
      hasAlpha: Boolean(meta.hasAlpha),
      isOpaque: meta.isOpaque == null ? null : Boolean(meta.isOpaque),
      orientation: meta.orientation || null,
      density: meta.density || null,
      isProgressive: Boolean(meta.isProgressive),
      sizeBytes: buffer.length,
    };
  } catch (err) {
    if (err instanceof UnsupportedImageError || err instanceof ImageProcessingError) throw err;
    throw new ImageProcessingError(`Failed to read image metadata: ${err.message}`, err);
  }
}
