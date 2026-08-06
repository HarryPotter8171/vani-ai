import { editImage as editGeminiImage } from "../../services/geminiImageService.js";
import {
  editImage as editOpenAIImage,
} from "../../services/openaiImageService.js";
import { imageEditUnavailableMessage } from "../../services/imageToolIntent.js";
import { attachmentFromUploadId } from "../../services/chatAttachmentService.js";
import { storeGeneratedImage } from "../../services/fileService.js";
import { collectImageParts } from "./imageParts.js";
import { normalizeImageMime } from "../../services/image/shared.js";

function isImageAttachment(att) {
  if (!att || typeof att !== "object") return false;
  const mime = String(att.mimeType || "").toLowerCase();
  const kind = String(att.kind || "").toLowerCase();
  return (
    kind === "image" ||
    mime.startsWith("image/") ||
    /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.test(att.name || "")
  );
}

function partFromAttachment(att) {
  if (!att?.dataBase64) return null;
  return {
    inlineData: {
      mimeType: normalizeImageMime(att.mimeType) || "image/jpeg",
      data: att.dataBase64,
    },
  };
}

/**
 * Resolve source image bytes for editing.
 *
 * Prefer the original uploaded file (fileId) over conversation contents.
 * Contents may carry vision/OCR-optimized bytes with mismatched MIME labels,
 * which causes gemini-2.5-flash-image to ignore the reference and regenerate.
 */
async function resolveImageParts(args, ctx) {
  const pools = [
    ...(Array.isArray(ctx.attachments) ? ctx.attachments : []),
    ...(Array.isArray(ctx.conversationAttachments)
      ? ctx.conversationAttachments
      : []),
  ];
  const ownerId = ctx.userId || ctx.user?._id || ctx.user?.id || null;

  const fileId =
    (typeof args.imageFileId === "string" && args.imageFileId.trim()) ||
    null;

  // 1) Explicit / latest upload fileId — original disk bytes.
  if (fileId && ownerId) {
    try {
      const att = await attachmentFromUploadId(fileId, {}, String(ownerId));
      const part = partFromAttachment(att);
      if (part) {
        console.info(
          "[image_trace] image_edit source=fileId id=%s bytes=%d mime=%s",
          fileId,
          String(att.dataBase64 || "").length,
          part.inlineData.mimeType
        );
        return [part];
      }
    } catch (err) {
      console.warn("[image_edit] fileId hydrate failed:", err?.message || err);
    }
  }

  // 2) Latest attachment that already has bytes (hydrated chat turn).
  for (let i = pools.length - 1; i >= 0; i -= 1) {
    const att = pools[i];
    if (!isImageAttachment(att)) continue;
    if (att.dataBase64) {
      const part = partFromAttachment(att);
      if (part) {
        console.info(
          "[image_trace] image_edit source=attachment_bytes mime=%s bytes=%d",
          part.inlineData.mimeType,
          String(att.dataBase64).length
        );
        return [part];
      }
    }
  }

  // 3) Hydrate any fileId-only image chip from newest → oldest.
  if (ownerId) {
    for (let i = pools.length - 1; i >= 0; i -= 1) {
      const att = pools[i];
      if (!isImageAttachment(att)) continue;
      const id = att.fileId || att.id;
      if (!id || att.dataBase64) continue;
      try {
        const hydrated = await attachmentFromUploadId(
          String(id),
          att,
          String(ownerId)
        );
        const part = partFromAttachment(hydrated);
        if (part) {
          console.info(
            "[image_trace] image_edit source=hydrated_chip id=%s mime=%s",
            id,
            part.inlineData.mimeType
          );
          return [part];
        }
      } catch {
        // try next
      }
    }
  }

  // 4) Last resort: inlineData already on conversation contents.
  const fromContents = collectImageParts(ctx.contents, []);
  if (fromContents.length) {
    console.info(
      "[image_trace] image_edit source=contents count=%d",
      fromContents.length
    );
    return fromContents;
  }

  return [];
}

function getImageProvider() {
  const raw = String(process.env.IMAGE_PROVIDER || "gemini").trim().toLowerCase();
  if (raw === "openai") return "openai";
  return "gemini";
}

/**
 * Edit an uploaded / conversation image via editImage() — never generateImage().
 */
export const imageEditTool = {
  id: "image_edit",
  name: "image_edit",
  displayName: "✏️ Editing image",
  feature: "image_generation",
  quotaMetric: "image_generation",
  description:
    "Edit an image already attached in the conversation (add/remove/replace objects, background, sky, colors, style). Call IMMEDIATELY when the user uploads an image and asks to edit/change/remove/add/replace/recolor/erase/crop/expand anything. The uploaded image is the primary source — preserve camera angle, people, objects, perspective, lighting, and composition; only modify the requested region. Never refuse or offer to generate a new image instead.",
  schema: {
    type: "object",
    properties: {
      instruction: {
        type: "string",
        description:
          "Clear edit instruction describing the desired change to the source image",
      },
      imageFileId: {
        type: "string",
        description: "Optional uploaded file id of the source image to edit",
      },
      imageIndex: {
        type: "number",
        description: "Optional 1-based image index when multiple images are attached",
      },
      aspectRatio: {
        type: "string",
        description: "Optional aspect ratio hint (best-effort; model may approximate)",
        enum: ["1:1", "3:4", "4:3", "9:16", "16:9"],
      },
    },
    required: ["instruction"],
    additionalProperties: false,
  },
  async execute(args = {}, ctx = {}) {
    const instruction = String(args.instruction || "").trim();
    if (!instruction) return { ok: false, error: "Instruction is required" };
    if (instruction.length > 2000) return { ok: false, error: "Instruction too long" };

    if (process.env.VANI_DISABLE_IMAGE_GEN === "true") {
      return {
        ok: false,
        error: imageEditUnavailableMessage(),
      };
    }

    const imageParts = await resolveImageParts(args, ctx);
    if (!imageParts.length) {
      return {
        ok: false,
        error: "No images are available in the current conversation to edit.",
      };
    }

    let selected = imageParts;
    const index = Number(args.imageIndex);
    if (Number.isFinite(index) && index >= 1) {
      const hit = imageParts[index - 1];
      if (!hit) {
        return {
          ok: false,
          error: `Image ${index} not found. ${imageParts.length} image(s) available.`,
        };
      }
      selected = [hit];
    } else {
      selected = [imageParts[imageParts.length - 1]];
    }

    try {
      // Always use image edit path — never generateImage (text-to-image discards source).
      const provider = getImageProvider();
      const editImage = provider === "openai" ? editOpenAIImage : editGeminiImage;
      const result = await editImage({
        instruction,
        imageParts: selected,
      });
      if (!result?.ok) return result;

      const ownerId = ctx.userId || ctx.user?._id || ctx.user?.id || null;
      let fileId = null;
      let imageUrl = null;
      let size = 0;

      // Persist immediately so the chat stream can send fileId/imageUrl only —
      // never raw PNG bytes or base64 as assistant text.
      if (ownerId && result.imageBase64) {
        try {
          const stored = await storeGeneratedImage({
            ownerId,
            base64: result.imageBase64,
            mimeType: result.mimeType || "image/png",
            prompt: instruction || "edited-image",
          });
          fileId = stored.id;
          size = stored.size || 0;
          imageUrl = `/api/files/${stored.id}/content`;
        } catch (persistErr) {
          console.warn(
            "[image_edit] persist failed:",
            persistErr?.message || persistErr
          );
        }
      }

      // Prefer durable file refs for every provider — never keep base64 after
      // a successful persist (chat/SSE must not carry binary payloads).
      if (fileId && imageUrl) {
        const { imageBase64: _drop, ...rest } = result;
        return {
          ...rest,
          ok: true,
          success: true,
          fileId,
          imageUrl,
          size,
          mimeType: result.mimeType || "image/png",
          imageFileId: args.imageFileId || undefined,
        };
      }

      return {
        ...result,
        ok: true,
        success: true,
        imageFileId: args.imageFileId || undefined,
      };
    } catch (err) {
      const message = err?.message || "Image edit failed";
      console.error("[image_edit]", message);
      return {
        ok: false,
        error: message,
        instruction,
      };
    }
  },
};
