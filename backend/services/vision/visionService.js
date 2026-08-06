/**
 * Production Vision service — upload → validate → optimize → OCR → model context.
 *
 * Orchestrates imageProcessor + ocrService. Multimodal Gemini calls stay in
 * fileParseService / geminiService; this layer prepares safe image bytes + text.
 */
import sharp from "sharp";
import fs from "fs/promises";
import path from "path";
import {
  ImageProcessingError,
  UnsupportedImageError,
  VISION_MAX_EDGE,
  isSupportedImage,
  needsVisionNormalization,
  normalizeImageMime,
  normalizePlainText,
} from "./shared.js";
import {
  detectImageFormat,
  processImageForVision,
  visionOutputFilename,
} from "./imageProcessor.js";
import { extractOcrText } from "./ocrService.js";
import { extractImageMetadata } from "../image/metadata.js";
import { formatImageContextBlock } from "../image/index.js";
import { UPLOADS_DIR } from "../../config/upload.js";

const VISION_CACHE_SUFFIX = ".vision.json";

function visionCachePath(id) {
  return path.join(UPLOADS_DIR, `${id}${VISION_CACHE_SUFFIX}`);
}

async function readVisionCache(id) {
  try {
    const raw = await fs.readFile(visionCachePath(id), "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

async function writeVisionCache(id, payload) {
  await fs.writeFile(visionCachePath(id), JSON.stringify(payload, null, 2), "utf8");
}

/**
 * Format metadata + OCR for chat / tool context (multi-image aware label).
 */
export function formatVisionContextBlock({ metadata, ocrText, index, name } = {}) {
  const header =
    typeof index === "number"
      ? `Image ${index}${name ? `: ${name}` : ""}`
      : name
        ? `Image: ${name}`
        : "Image";
  const body = formatImageContextBlock({ metadata, ocrText });
  return `[${header}]\n${body}`;
}

/**
 * Full in-memory vision pipeline for a buffer.
 */
export async function analyzeImageBuffer(
  buffer,
  { filename = "", mimeType = "", skipOcr = false } = {}
) {
  if (!Buffer.isBuffer(buffer)) {
    throw new ImageProcessingError("analyzeImageBuffer expects a Buffer.");
  }

  if (filename || mimeType) {
    if (!isSupportedImage({ filename, mimeType })) {
      throw new UnsupportedImageError(
        `Unsupported image type${filename ? `: ${filename}` : ""}. Supported: JPG, JPEG, PNG, WEBP, GIF, HEIC, BMP.`
      );
    }
  }

  const optimized = await processImageForVision(buffer, { filename, mimeType });
  const metaBuffer = optimized.buffer;

  let metadata;
  try {
    metadata = await extractImageMetadata(metaBuffer, {
      filename: visionOutputFilename(filename, optimized.format),
      mimeType: optimized.mimeType,
    });
  } catch {
    metadata = {
      width: optimized.width,
      height: optimized.height,
      format: optimized.format,
      mimeType: optimized.mimeType,
      sizeBytes: optimized.sizeBytes,
      hasAlpha: optimized.format === "png",
      orientation: null,
      space: null,
    };
  }

  let ocrText = "";
  let ocrConfidence = null;
  if (!skipOcr) {
    const ocr = await extractOcrText(metaBuffer);
    ocrText = ocr.ocrText;
    ocrConfidence = ocr.confidence;
  }

  return {
    format: optimized.format,
    mimeType: optimized.mimeType,
    buffer: optimized.buffer,
    dataBase64: optimized.buffer.toString("base64"),
    metadata,
    ocrText,
    ocrConfidence,
    text: formatImageContextBlock({ metadata, ocrText }),
    optimized: optimized.optimized,
    sourceFormat: optimized.sourceFormat || detectImageFormat(buffer),
    width: optimized.width,
    height: optimized.height,
    sizeBytes: optimized.sizeBytes,
  };
}

/**
 * Normalize an on-disk upload to a Gemini-safe image (convert HEIC/GIF/BMP,
 * compress oversized). Updates binary + sidecar metadata in place.
 */
export async function normalizeUploadedImage(id) {
  const { resolveUploadedFile, writeUploadMetadata } = await import("../fileService.js");
  const file = await resolveUploadedFile(id);
  if (!isSupportedImage({ filename: file.filename, mimeType: file.mimeType })) {
    return { normalized: false, file };
  }

  const original = await fs.readFile(file.absolutePath);
  const shouldConvert =
    needsVisionNormalization({ filename: file.filename, mimeType: file.mimeType }) ||
    detectImageFormat(original) === "gif" ||
    detectImageFormat(original) === "heic" ||
    detectImageFormat(original) === "bmp";

  let meta;
  try {
    meta = await sharp(original, { failOn: "none", pages: 1 }).metadata();
  } catch {
    meta = null;
  }

  const edge = Math.max(meta?.width || 0, meta?.height || 0);
  const oversized = edge > VISION_MAX_EDGE || original.length > 4 * 1024 * 1024;

  if (!shouldConvert && !oversized) {
    return { normalized: false, file };
  }

  const optimized = await processImageForVision(original, {
    filename: file.filename,
    mimeType: file.mimeType,
    force: shouldConvert,
  });

  const outName = visionOutputFilename(file.filename, optimized.format);
  const outExt = path.extname(outName).toLowerCase() || ".jpg";
  const newStoredName = `${id}${outExt}`;
  const newAbsPath = path.join(UPLOADS_DIR, newStoredName);

  await fs.writeFile(newAbsPath, optimized.buffer);

  if (path.resolve(file.absolutePath) !== path.resolve(newAbsPath)) {
    try {
      await fs.unlink(file.absolutePath);
    } catch (err) {
      if (err.code !== "ENOENT") console.error("normalizeUploadedImage unlink:", err.message);
    }
  }

  const stored = await writeUploadMetadata({
    id: file.id,
    ownerId: file.ownerId,
    filename: outName,
    size: optimized.sizeBytes,
    mimeType: optimized.mimeType,
    kind: "image",
    path: path.posix.join("uploads", newStoredName),
    createdAt: file.createdAt,
  });

  return {
    normalized: true,
    file: {
      ...stored,
      absolutePath: newAbsPath,
    },
    sourceFormat: optimized.sourceFormat,
  };
}

/**
 * Analyze an uploaded file (with optional disk cache). Runs normalize first.
 */
export async function analyzeUploadedImage(id, { force = false, skipOcr = false } = {}) {
  if (!force) {
    const cached = await readVisionCache(id);
    if (cached?.ocrText != null && cached?.metadata) {
      return {
        id,
        ...cached,
        cached: true,
      };
    }
  }

  await normalizeUploadedImage(id);
  const { resolveUploadedFile } = await import("../fileService.js");
  const file = await resolveUploadedFile(id);
  const buffer = await fs.readFile(file.absolutePath);
  const result = await analyzeImageBuffer(buffer, {
    filename: file.filename,
    mimeType: file.mimeType,
    skipOcr,
  });

  const payload = {
    id,
    filename: file.filename,
    mimeType: result.mimeType,
    format: result.format,
    metadata: result.metadata,
    ocrText: result.ocrText,
    ocrConfidence: result.ocrConfidence,
    text: result.text,
    optimized: result.optimized,
    sourceFormat: result.sourceFormat,
    width: result.width,
    height: result.height,
    sizeBytes: result.sizeBytes,
    analyzedAt: new Date().toISOString(),
  };

  await writeVisionCache(id, payload);
  return { ...payload, cached: false };
}

/**
 * Build labeled context blocks for multi-image comparison / reasoning.
 */
export function buildMultiImageContext(results = []) {
  return results
    .map((r, i) =>
      formatVisionContextBlock({
        metadata: r.metadata,
        ocrText: r.ocrText,
        index: i + 1,
        name: r.filename || r.name,
      })
    )
    .join("\n\n");
}

/**
 * Parallel vision analysis for multiple upload ids.
 */
export async function analyzeUploadedImages(ids = [], options = {}) {
  const unique = [...new Set(ids.filter(Boolean))];
  const settled = await Promise.all(
    unique.map(async (id) => {
      try {
        const result = await analyzeUploadedImage(id, options);
        return { ok: true, id, result };
      } catch (err) {
        return { ok: false, id, error: err.message || "Vision analysis failed." };
      }
    })
  );
  return settled;
}

export {
  processImageForVision,
  detectImageFormat,
  visionOutputFilename,
  isSupportedImage,
  normalizeImageMime,
  normalizePlainText,
  UnsupportedImageError,
  ImageProcessingError,
};
