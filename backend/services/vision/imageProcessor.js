/**
 * Image processor for Vision pipeline.
 * Validate → normalize exotic formats (HEIC / GIF first frame / BMP) →
 * compress large images → Gemini-safe JPEG/PNG/WEBP buffers.
 */
import sharp from "sharp";
import bmpJs from "bmp-js";
import {
  ImageProcessingError,
  UnsupportedImageError,
  VISION_MAX_EDGE,
  VISION_JPEG_QUALITY,
  getExtension,
  isSupportedImage,
  normalizeImageMime,
  needsVisionNormalization,
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

function startsWithBytes(buf, bytes) {
  if (!buf || buf.length < bytes.length) return false;
  return bytes.every((b, i) => buf[i] === b);
}

/**
 * Sniff image format from magic bytes (extension-agnostic safety net).
 */
export function detectImageFormat(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  if (startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "png";
  }
  if (startsWithBytes(buffer, [0xff, 0xd8, 0xff])) return "jpeg";
  if (
    startsWithBytes(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  if (startsWithBytes(buffer, [0x47, 0x49, 0x46, 0x38])) return "gif";
  if (startsWithBytes(buffer, [0x42, 0x4d])) return "bmp";

  // ISO BMFF — HEIC / HEIF / AVIF
  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp") {
    const brand = buffer.toString("ascii", 8, 12);
    if (
      ["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heim", "heis"].some((b) =>
        brand.startsWith(b.slice(0, 4))
      ) ||
      brand.includes("hei") ||
      brand === "mif1"
    ) {
      return "heic";
    }
    if (brand === "avif" || brand === "avis") return "avif";
    // Generic ftyp — try heic path
    if (["heic", "heif", "avif"].some((b) => brand.includes(b.slice(0, 3)))) {
      return "heic";
    }
  }

  return null;
}

async function decodeHeic(buffer) {
  // Prefer sharp (libheif) when the build can decode HEIC; fall back to heic-convert.
  try {
    const meta = await sharp(buffer, { failOn: "none" }).metadata();
    if (meta.width && meta.height) {
      return sharp(buffer, { failOn: "none", pages: 1 });
    }
  } catch {
    // fall through
  }

  try {
    const { default: convert } = await import("heic-convert");
    const output = await convert({
      buffer,
      format: "JPEG",
      quality: 0.92,
    });
    return sharp(Buffer.from(output), { failOn: "none" });
  } catch (err) {
    throw new ImageProcessingError(
      `Unable to decode HEIC/HEIF image: ${err.message}`,
      err
    );
  }
}

function decodeBmpToSharp(buffer) {
  try {
    const bmp = bmpJs.decode(buffer);
    if (!bmp?.data || !bmp.width || !bmp.height) {
      throw new Error("Invalid BMP dimensions");
    }
    // bmp-js returns ABGR; sharp expects RGBA — swap R/B.
    const rgba = Buffer.alloc(bmp.width * bmp.height * 4);
    const src = bmp.data;
    for (let i = 0; i < src.length; i += 4) {
      rgba[i] = src[i + 2];
      rgba[i + 1] = src[i + 1];
      rgba[i + 2] = src[i];
      rgba[i + 3] = src[i + 3];
    }
    return sharp(rgba, {
      raw: { width: bmp.width, height: bmp.height, channels: 4 },
      failOn: "none",
    });
  } catch (err) {
    throw new ImageProcessingError(`Unable to decode BMP image: ${err.message}`, err);
  }
}

/**
 * Open any supported image as a sharp pipeline (GIF → first frame).
 */
export async function openImagePipeline(buffer, { filename = "", mimeType = "" } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new ImageProcessingError("Image buffer is empty.");
  }

  const sniffed = detectImageFormat(buffer);
  const ext = getExtension(filename);
  const mime = normalizeImageMime(mimeType);

  const formatHint =
    sniffed ||
    (ext === ".heic" || ext === ".heif" || mime === "image/heic" || mime === "image/heif"
      ? "heic"
      : ext === ".gif" || mime === "image/gif"
        ? "gif"
        : ext === ".bmp" || mime === "image/bmp" || mime === "image/x-ms-bitmap"
          ? "bmp"
          : null);

  if (formatHint === "bmp") {
    return { pipeline: decodeBmpToSharp(buffer), sourceFormat: "bmp" };
  }

  if (formatHint === "heic" || formatHint === "avif") {
    const pipeline = await decodeHeic(buffer);
    return { pipeline, sourceFormat: formatHint };
  }

  if (formatHint === "gif") {
    // First frame only — animated GIFs are flattened for Vision.
    return {
      pipeline: sharp(buffer, { failOn: "none", pages: 1, page: 0 }),
      sourceFormat: "gif",
    };
  }

  return {
    pipeline: sharp(buffer, { failOn: "none" }),
    sourceFormat: formatHint || "unknown",
  };
}

/**
 * Encode a sharp pipeline to a Gemini-friendly buffer.
 * Prefers PNG when alpha is used; otherwise JPEG for size.
 */
async function encodeForVision(pipeline, { preferPng = false } = {}) {
  const rotated = pipeline.rotate();
  const meta = await rotated.metadata();
  const hasAlpha = Boolean(meta.hasAlpha);
  const edge = Math.max(meta.width || 0, meta.height || 0);
  const needsResize = edge > VISION_MAX_EDGE;

  let next = rotated;
  if (needsResize) {
    next = next.resize({
      width: VISION_MAX_EDGE,
      height: VISION_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  if (preferPng || hasAlpha) {
    const { data, info } = await next.png({ compressionLevel: 8 }).toBuffer({
      resolveWithObject: true,
    });
    return {
      buffer: data,
      mimeType: "image/png",
      format: "png",
      width: info.width,
      height: info.height,
      sizeBytes: data.length,
      optimized: needsResize,
    };
  }

  const { data, info } = await next
    .jpeg({ quality: VISION_JPEG_QUALITY, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    mimeType: "image/jpeg",
    format: "jpeg",
    width: info.width,
    height: info.height,
    sizeBytes: data.length,
    optimized: needsResize || data.length < (meta.size || Infinity),
  };
}

/**
 * Normalize + compress an image for Vision / Gemini inlineData.
 * HEIC / GIF (first frame) / BMP become JPEG or PNG.
 */
export async function processImageForVision(
  buffer,
  { filename = "", mimeType = "", force = false } = {}
) {
  if (filename || mimeType) {
    if (!isSupportedImage({ filename, mimeType })) {
      throw new UnsupportedImageError(
        `Unsupported image type${filename ? `: ${filename}` : ""}. Supported: JPG, JPEG, PNG, WEBP, GIF, HEIC, BMP.`
      );
    }
  }

  const sniffed = detectImageFormat(buffer);
  const alreadySafe =
    !force &&
    !needsVisionNormalization({ filename, mimeType }) &&
    sniffed &&
    ["jpeg", "png", "webp"].includes(sniffed);

  if (alreadySafe) {
    // Still compress oversized photos.
    try {
      const meta = await sharp(buffer, { failOn: "none" }).metadata();
      const edge = Math.max(meta.width || 0, meta.height || 0);
      if (edge <= VISION_MAX_EDGE && buffer.length <= 4 * 1024 * 1024) {
        const format = sniffed === "jpg" ? "jpeg" : sniffed;
        return {
          buffer,
          mimeType: FORMAT_TO_MIME[format] || normalizeImageMime(mimeType) || "image/jpeg",
          format,
          width: meta.width || null,
          height: meta.height || null,
          sizeBytes: buffer.length,
          optimized: false,
          sourceFormat: format,
        };
      }
    } catch {
      // Fall through to full pipeline.
    }
  }

  const { pipeline, sourceFormat } = await openImagePipeline(buffer, {
    filename,
    mimeType,
  });

  const encoded = await encodeForVision(pipeline, {
    preferPng: sourceFormat === "png" || normalizeImageMime(mimeType) === "image/png",
  });

  return {
    ...encoded,
    sourceFormat,
  };
}

/**
 * Suggested filename after normalization (keeps basename, swaps extension).
 */
export function visionOutputFilename(originalName = "image", format = "jpeg") {
  const base = String(originalName).replace(/\.[^.]+$/, "") || "image";
  const ext = format === "png" ? "png" : format === "webp" ? "webp" : "jpg";
  return `${base}.${ext}`;
}
