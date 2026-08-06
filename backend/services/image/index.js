import { extractImageMetadata } from "./metadata.js";
import { extractOcrText } from "./ocr.js";
import {
  ImageProcessingError,
  UnsupportedImageError,
  isSupportedImage,
  normalizePlainText,
} from "./shared.js";

export {
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_IMAGE_MIMES,
  UnsupportedImageError,
  ImageProcessingError,
  isSupportedImage,
  normalizeImageMime,
} from "./shared.js";

export { extractImageMetadata } from "./metadata.js";
export { extractOcrText, shutdownOcrWorker } from "./ocr.js";

/** Fixed assistant caption after a successful image_edit — nothing else. */
export const IMAGE_EDIT_SUCCESS_CAPTION = "I've edited your image.";

/**
 * Strip developer/debug image metadata from text before showing it to users.
 * Model context may still include Format/Dimensions; the UI must not.
 */
export function toUserFacingImageText(text) {
  if (!text || typeof text !== "string") return "";
  let out = text;
  out = out.replace(/^\s*\[Image[^\]]*\]\s*/gim, "");
  out = out.replace(/Image metadata:\s*(?:\n[ \t]*-[^\n]*)+/gi, "");
  out = out.replace(/^\s*-\s*(Format|Dimensions|Size|Has alpha channel|EXIF orientation|Color space):[^\n]*$/gim, "");
  out = out.replace(/OCR extracted text:\s*\[none detected\]\s*/gi, "");
  out = out.replace(/OCR extracted text:\s*/gi, "");
  out = out.replace(/\bRaw metadata\b[\s\S]*$/gi, "");
  out = out.replace(/\bTool payload\b[\s\S]*$/gi, "");
  out = out.replace(/\bInternal JSON\b[\s\S]*$/gi, "");
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

/**
 * Strip OCR / image-metadata / base64 leaks from assistant stream deltas.
 * OCR stays in model context only — never in user-visible assistant text.
 */
export function sanitizeAssistantDelta(text) {
  if (!text || typeof text !== "string") return "";
  let out = text;

  // Raw PNG / JPEG bytes accidentally decoded as text — drop entirely.
  if (
    (out.length > 8 && out.charCodeAt(0) === 0x89 && out.slice(1, 4) === "PNG") ||
    (out.length > 8 && out.charCodeAt(0) === 0xff && out.charCodeAt(1) === 0xd8) ||
    (out.includes("IHDR") && out.includes("PNG") && /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(out))
  ) {
    return "";
  }

  // Full labeled blocks (common when the model echoes prompt context).
  out = out.replace(/\[Image\s*\d+[^\]]*\]\s*/gi, "");
  out = out.replace(/Image metadata:\s*(?:\n[ \t]*-[^\n]*)+/gi, "");
  out = out.replace(/OCR extracted text:\s*\[none detected\]\s*/gi, "");
  out = out.replace(
    /OCR extracted text:\s*[\s\S]*?(?=(?:\n{2,}(?:Image metadata:|\[Image)|$))/gi,
    ""
  );
  out = out.replace(
    /^\s*-\s*(Format|Dimensions|Size|Has alpha channel|EXIF orientation|Color space):[^\n]*$/gim,
    ""
  );
  // Long base64 / data-URI dumps — never show raw image bytes in chat.
  out = out.replace(
    /data:image\/[a-z0-9+.-]+;base64,[A-Za-z0-9+/=\s]{80,}/gi,
    ""
  );
  out = out.replace(/\b[A-Za-z0-9+/]{200,}={0,2}\b/g, "");
  out = out.replace(/\n{3,}/g, "\n\n");
  // Preserve whitespace boundaries between streamed deltas; callers concatenate
  // chunks and tests expect spaces to remain intact.
  // However, if the delta is effectively empty (e.g. pure OCR flood), return "".
  if (!out || !String(out).trim()) return "";
  return out;
}

/**
 * Format metadata + OCR into a chat-context block the model can read
 * alongside the native image inlineData part.
 */
export function formatImageContextBlock({ metadata, ocrText } = {}) {
  const lines = [];

  if (metadata) {
    const dims =
      metadata.width && metadata.height ? `${metadata.width}×${metadata.height}px` : "unknown size";
    const format = (metadata.format || "image").toUpperCase();
    const sizeKb =
      typeof metadata.sizeBytes === "number"
        ? `${Math.max(1, Math.round(metadata.sizeBytes / 1024))} KB`
        : null;

    lines.push("Image metadata:");
    lines.push(
      [
        `- Format: ${format}`,
        `- Dimensions: ${dims}`,
        sizeKb ? `- Size: ${sizeKb}` : null,
        metadata.hasAlpha ? "- Has alpha channel" : null,
        metadata.orientation && metadata.orientation !== 1
          ? `- EXIF orientation: ${metadata.orientation}`
          : null,
        metadata.space ? `- Color space: ${metadata.space}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  const text = normalizePlainText(ocrText || "");
  if (text) {
    lines.push("OCR extracted text:");
    lines.push(text);
  } else {
    lines.push("OCR extracted text: [none detected]");
  }

  return lines.join("\n");
}

/**
 * Full image processing pipeline: validate → metadata → OCR.
 * Does not generate images, chunk, embed, or index.
 *
 * @returns {Promise<{
 *   format: string,
 *   mimeType: string,
 *   metadata: object,
 *   ocrText: string,
 *   ocrConfidence: number|null,
 *   text: string
 * }>}
 */
export async function processImage(buffer, { filename = "", mimeType = "" } = {}) {
  if (!Buffer.isBuffer(buffer)) {
    throw new ImageProcessingError("processImage expects a Buffer.");
  }

  if (filename || mimeType) {
    if (!isSupportedImage({ filename, mimeType })) {
      throw new UnsupportedImageError(
        `Unsupported image type${filename ? `: ${filename}` : ""}. Supported: JPG, JPEG, PNG, WEBP, GIF, HEIC, BMP.`
      );
    }
  }

  // Route exotic formats through Vision normalize so OCR always sees JPEG/PNG.
  let workBuffer = buffer;
  let workMime = mimeType;
  let workName = filename;
  try {
    const { processImageForVision, visionOutputFilename } = await import(
      "../vision/imageProcessor.js"
    );
    const { needsVisionNormalization } = await import("../vision/shared.js");
    if (needsVisionNormalization({ filename, mimeType })) {
      const optimized = await processImageForVision(buffer, { filename, mimeType });
      workBuffer = optimized.buffer;
      workMime = optimized.mimeType;
      workName = visionOutputFilename(filename, optimized.format);
    }
  } catch {
    // Fall through with original bytes when vision normalize is unavailable.
  }

  const metadata = await extractImageMetadata(workBuffer, {
    filename: workName,
    mimeType: workMime,
  });
  const { ocrText, confidence } = await extractOcrText(workBuffer);

  return {
    format: metadata.format,
    mimeType: metadata.mimeType,
    metadata,
    ocrText,
    ocrConfidence: confidence,
    text: formatImageContextBlock({ metadata, ocrText }),
  };
}
