/**
 * Prepare source image bytes for Gemini native image editing.
 *
 * Photographic images (JPEG / HEIC / HEIF): pass through original uploaded
 * bytes unchanged — no resize, rotate, recompress, color-space conversion,
 * or metadata stripping. Only normalize the MIME type when needed.
 *
 * Non-photographic formats keep the prior sweet-spot path (longest side
 * ≤ 1568, RGB re-encode) used when MIME/size/alpha otherwise confuse the model.
 */

import sharp from "sharp";
import { detectImageFormat } from "../vision/imageProcessor.js";
import { normalizeImageMime } from "./shared.js";

/** Longest edge Nano Banana edits most reliably with (see Gemini Lab / Google samples). */
export const EDIT_MAX_EDGE = Number(process.env.VANI_IMAGE_EDIT_MAX_EDGE) || 1568;

const SNIFF_TO_MIME = Object.freeze({
  png: "image/png",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  heic: "image/heic",
});

const PHOTOGRAPHIC_SNIFFS = new Set(["jpeg", "jpg", "heic"]);

/**
 * Strip a data-URI prefix if the client embedded one in dataBase64.
 */
export function stripDataUriPrefix(data) {
  const raw = String(data || "");
  const m = raw.match(/^data:image\/[a-z0-9+.-]+;base64,(.+)$/i);
  return m ? m[1] : raw;
}

function isPhotographic({ sniffed, claimed }) {
  // Prefer byte sniff so a wrong claimed MIME cannot force passthrough.
  if (sniffed) return PHOTOGRAPHIC_SNIFFS.has(sniffed);
  return (
    claimed === "image/jpeg" ||
    claimed === "image/heic" ||
    claimed === "image/heif"
  );
}

/**
 * Resolve MIME for pass-through photos: prefer sniffed bytes, else claimed,
 * else a safe default. Never re-encodes.
 */
function resolvePhotographicMime(sniffed, claimed) {
  if (sniffed && SNIFF_TO_MIME[sniffed]) return SNIFF_TO_MIME[sniffed];
  if (claimed) return claimed;
  return "image/jpeg";
}

/**
 * Normalize raw/base64 image input into Gemini-safe edit inlineData.
 *
 * @returns {Promise<{ mimeType: string, dataBase64: string, width: number, height: number, bytes: number }>}
 */
export async function prepareEditSourceImage(dataBase64, claimedMime = "") {
  const cleaned = stripDataUriPrefix(dataBase64);
  if (!cleaned) {
    throw new Error("Empty source image bytes");
  }

  let buffer;
  try {
    buffer = Buffer.from(cleaned, "base64");
  } catch {
    throw new Error("Source image is not valid base64");
  }
  if (!buffer.length) {
    throw new Error("Empty source image bytes");
  }

  const sniffed = detectImageFormat(buffer);
  const claimed = normalizeImageMime(claimedMime);

  // Photographic: return original bytes exactly. Metadata read is observational
  // only (no rotate / no decode-reencode).
  if (isPhotographic({ sniffed, claimed })) {
    const mimeType = resolvePhotographicMime(sniffed, claimed);
    let width = 0;
    let height = 0;
    try {
      const meta = await sharp(buffer, {
        failOn: "none",
        // Do not auto-orient; EXIF orientation must remain untouched.
        autoOrient: false,
      }).metadata();
      width = meta.width || 0;
      height = meta.height || 0;
    } catch {
      // Dimensions are best-effort for logging; bytes still pass through.
    }
    if (!width || !height) {
      throw new Error("Source image has no dimensions");
    }

    if (
      sniffed &&
      claimed &&
      SNIFF_TO_MIME[sniffed] &&
      claimed !== SNIFF_TO_MIME[sniffed] &&
      !(claimed === "image/jpeg" && sniffed === "jpeg")
    ) {
      console.warn(
        "[image_trace] edit_source mime_mismatch claimed=%s sniffed=%s → sending=%s (raw photographic passthrough)",
        claimed,
        sniffed,
        mimeType
      );
    } else {
      console.info(
        "[image_trace] edit_source mode=photographic_passthrough mime=%s bytes=%d %dx%d",
        mimeType,
        buffer.length,
        width,
        height
      );
    }

    return {
      mimeType,
      dataBase64: cleaned,
      width,
      height,
      bytes: buffer.length,
    };
  }

  // Decode via sharp (honors EXIF orientation). Force RGB — alpha often causes
  // the model to repaint backgrounds and lose the original composition.
  let pipeline = sharp(buffer, { failOn: "none" }).rotate();
  const meta = await pipeline.metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  if (!width || !height) {
    throw new Error("Source image has no dimensions");
  }

  const edge = Math.max(width, height);
  if (edge > EDIT_MAX_EDGE) {
    pipeline = pipeline.resize({
      width: EDIT_MAX_EDGE,
      height: EDIT_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  // Prefer JPEG for photos (smaller, no alpha). Keep PNG only when source was
  // already a small lossless graphic and stays under the edge cap.
  const preferPng =
    sniffed === "png" && edge <= EDIT_MAX_EDGE && buffer.length < 1.5 * 1024 * 1024;

  let out;
  let mimeType;
  if (preferPng) {
    out = await pipeline.png({ compressionLevel: 8 }).toBuffer({ resolveWithObject: true });
    mimeType = "image/png";
  } else {
    out = await pipeline
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    mimeType = "image/jpeg";
  }

  // If claim and sniff disagree badly, log — we already re-encoded to mimeType.
  if (
    sniffed &&
    claimed &&
    SNIFF_TO_MIME[sniffed] &&
    claimed !== SNIFF_TO_MIME[sniffed] &&
    !(claimed === "image/jpeg" && sniffed === "jpeg")
  ) {
    console.warn(
      "[image_trace] edit_source mime_mismatch claimed=%s sniffed=%s → sending=%s",
      claimed,
      sniffed,
      mimeType
    );
  }

  return {
    mimeType,
    dataBase64: out.data.toString("base64"),
    width: out.info.width || width,
    height: out.info.height || height,
    bytes: out.data.length,
  };
}
