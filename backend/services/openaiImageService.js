/**
 * OpenAI GPT Image edit path — isolated from Gemini.
 *
 * Uses images.edit() with model gpt-image-1 only.
 * Response bytes are always handled as Buffer — never decoded as UTF-8 text.
 */

import sharp from "sharp";
import { toFile } from "openai/uploads";
import { OPENAI_IMAGE_MODEL, getOpenAIClient } from "./openaiClient.js";
import { prepareEditSourceImage } from "./image/prepareEditSource.js";

/** gpt-image-1 supported edit sizes. */
const EDIT_SIZES = Object.freeze([
  { size: "1024x1024", w: 1024, h: 1024 },
  { size: "1536x1024", w: 1536, h: 1024 },
  { size: "1024x1536", w: 1024, h: 1536 },
]);

const OPENAI_SOURCE_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * Wrap the user edit so the model treats the upload as a locked source and
 * only changes the requested pixels.
 */
export function buildOpenAIEditPrompt(instruction) {
  const change = String(instruction || "").trim();
  if (!change) return "";
  if (
    /edit only the explicitly requested/i.test(change) &&
    /do not regenerate/i.test(change)
  ) {
    return change;
  }
  return (
    `Local photo edit of the PROVIDED source image only. ` +
    `Apply ONLY this change: ${change}. ` +
    `Edit only the explicitly requested pixels/region. ` +
    `Do NOT regenerate, redraw, restyle, recompose, or invent a new photograph. ` +
    `Preserve identity and likeness exactly: same faces, facial features, skin tone, hair, ` +
    `body shape, body proportions, pose, clothing, accessories, and expressions. ` +
    `Preserve camera angle, framing, perspective, depth of field, lighting, shadows, color grade, ` +
    `background, and overall image quality/sharpness/noise exactly, except where the edit requires a change. ` +
    `Unchanged areas must remain pixel-faithful to the source. Return only the edited photograph.`
  );
}

/**
 * Pick the gpt-image-1 size closest to the source aspect ratio.
 * Falls back to "auto" when dimensions are unknown.
 */
export function pickEditSize(width, height) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (!w || !h) return "auto";

  const ratio = w / h;
  let best = EDIT_SIZES[0];
  let bestDelta = Infinity;
  for (const candidate of EDIT_SIZES) {
    const delta = Math.abs(candidate.w / candidate.h - ratio);
    if (delta < bestDelta) {
      best = candidate;
      bestDelta = delta;
    }
  }
  return best.size;
}

function sniffImageMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer.length >= 12 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Decode OpenAI image payload into a Buffer.
 * NEVER uses utf8/string decoding of PNG bytes.
 */
export function decodeOpenAIImagePayload(value) {
  if (Buffer.isBuffer(value)) {
    return Buffer.from(value);
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  // Reject payloads that are clearly raw PNG/JPEG bytes mis-cast as text.
  // Those must not be treated as UTF-8 chat content or as base64.
  if (
    (trimmed.charCodeAt(0) === 0x89 && trimmed.slice(1, 4) === "PNG") ||
    (trimmed.charCodeAt(0) === 0xff && trimmed.charCodeAt(1) === 0xd8)
  ) {
    // Recover bytes via latin1 (1:1 byte mapping) — never utf8.
    return Buffer.from(trimmed, "latin1");
  }

  const b64 = trimmed
    .replace(/^data:image\/[a-z0-9+.-]+;base64,/i, "")
    .replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64) || b64.length < 16) {
    return null;
  }
  return Buffer.from(b64, "base64");
}

/**
 * Extract edited image bytes from Images API response.
 * Returns Buffer only — callers must not String() these bytes.
 */
export function extractEditedImageBuffer(response) {
  const item = Array.isArray(response?.data) ? response.data[0] : null;
  if (!item || typeof item !== "object") return null;

  if (item.b64_json != null) {
    const buffer = decodeOpenAIImagePayload(item.b64_json);
    if (!buffer?.length) return null;
    const mimeType = sniffImageMime(buffer) || "image/png";
    if (!sniffImageMime(buffer)) return null;
    return { buffer, mimeType };
  }

  // GPT image models do not return URL; ignore if present.
  return null;
}

async function ensureOpenAICompatibleSource(prepared) {
  const mime = String(prepared.mimeType || "").toLowerCase();
  if (OPENAI_SOURCE_MIMES.has(mime)) {
    return {
      mimeType: mime,
      dataBase64: prepared.dataBase64,
      width: prepared.width,
      height: prepared.height,
      bytes: prepared.bytes,
    };
  }

  const buffer = Buffer.from(prepared.dataBase64, "base64");
  const out = await sharp(buffer, { failOn: "none", autoOrient: false })
    .jpeg({ quality: 95, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  return {
    mimeType: "image/jpeg",
    dataBase64: out.data.toString("base64"),
    width: out.info.width || prepared.width,
    height: out.info.height || prepared.height,
    bytes: out.data.length,
  };
}

/**
 * Scale edited Buffer back to source dimensions. Returns Buffer — never a
 * utf8 string of PNG bytes.
 */
async function matchSourceResolutionBuffer(editedBuffer, targetWidth, targetHeight) {
  const tw = Number(targetWidth) || 0;
  const th = Number(targetHeight) || 0;
  if (!tw || !th || !Buffer.isBuffer(editedBuffer)) {
    return { buffer: editedBuffer, mimeType: sniffImageMime(editedBuffer) || "image/png" };
  }

  const meta = await sharp(editedBuffer, { failOn: "none" }).metadata();
  const cw = meta.width || 0;
  const ch = meta.height || 0;

  if (cw === tw && ch === th) {
    return {
      buffer: editedBuffer,
      mimeType: sniffImageMime(editedBuffer) || "image/png",
    };
  }

  const out = await sharp(editedBuffer, { failOn: "none" })
    .resize(tw, th, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 8 })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: out.data,
    mimeType: "image/png",
  };
}

export async function editImage({ instruction, imageParts = [] } = {}) {
  const change = String(instruction || "").trim();
  if (!change) return { ok: false, error: "Instruction is required" };
  if (change.length > 2000) return { ok: false, error: "Instruction too long" };

  const sources = (Array.isArray(imageParts) ? imageParts : []).filter(
    (p) =>
      p?.inlineData?.data &&
      String(p.inlineData.mimeType || "").startsWith("image/")
  );

  if (!sources.length) {
    return {
      ok: false,
      error: "No images are available in the current conversation to edit.",
      mode: "Edit",
    };
  }

  const source = sources[sources.length - 1];
  let prepared;
  try {
    prepared = await prepareEditSourceImage(
      source.inlineData.data,
      source.inlineData.mimeType || "image/png"
    );
    prepared = await ensureOpenAICompatibleSource(prepared);
  } catch {
    return {
      ok: false,
      error: "Could not read the uploaded image for editing.",
      mode: "Edit",
    };
  }

  const editPrompt = buildOpenAIEditPrompt(change);
  const size = pickEditSize(prepared.width, prepared.height);

  try {
    const imageBuffer = Buffer.from(prepared.dataBase64, "base64");
    const ext =
      prepared.mimeType === "image/png"
        ? "png"
        : prepared.mimeType === "image/webp"
          ? "webp"
          : "jpg";
    const image = await toFile(imageBuffer, `source.${ext}`, {
      type: prepared.mimeType,
    });

    console.info(
      "[image_trace] mode=Edit provider=openai model=%s size=%s quality=high input_fidelity=high source=%dx%d bytes=%d",
      OPENAI_IMAGE_MODEL,
      size,
      prepared.width,
      prepared.height,
      prepared.bytes
    );

    const response = await getOpenAIClient().images.edit({
      model: OPENAI_IMAGE_MODEL,
      image,
      prompt: editPrompt,
      size,
      quality: "high",
      input_fidelity: "high",
    });

    const extracted = extractEditedImageBuffer(response);
    if (!extracted?.buffer?.length) {
      return {
        ok: false,
        error: "Image edit returned no image.",
        instruction: change,
        mode: "Edit",
        model: OPENAI_IMAGE_MODEL,
      };
    }

    let finalBuffer = extracted.buffer;
    let finalMime = extracted.mimeType;
    try {
      const matched = await matchSourceResolutionBuffer(
        extracted.buffer,
        prepared.width,
        prepared.height
      );
      finalBuffer = matched.buffer;
      finalMime = matched.mimeType || finalMime;
    } catch (resizeErr) {
      console.warn(
        "[image_edit][openai] resolution match skipped:",
        resizeErr?.message || resizeErr
      );
    }

    // Encode for persistence helpers ONLY — never expose as utf8 text.
    const imageBase64 = finalBuffer.toString("base64");

    return {
      ok: true,
      success: true,
      instruction: change,
      mimeType: finalMime,
      // Clean base64 for storeGeneratedImage; pipeline must strip before any
      // model/text path. Prefer fileId/imageUrl after persistence.
      imageBase64,
      imageBytes: finalBuffer.length,
      mode: "Edit",
      model: OPENAI_IMAGE_MODEL,
      sourceBytes: prepared.bytes,
      sourceMime: prepared.mimeType,
      sourceWidth: prepared.width,
      sourceHeight: prepared.height,
      note: "Image edited successfully. Do not describe OCR, metadata, or base64.",
    };
  } catch (err) {
    console.error(
      "[image_edit][openai]",
      err?.status || "",
      err?.code || "",
      err?.message || err
    );
    return {
      ok: false,
      error: "Image edit failed.",
      instruction: change,
      mode: "Edit",
      model: OPENAI_IMAGE_MODEL,
    };
  }
}
