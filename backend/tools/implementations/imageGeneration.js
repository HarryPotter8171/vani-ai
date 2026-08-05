import { generateImage } from "../../services/geminiImageService.js";
import {
  imageGenerationUnavailableMessage,
  pickLatestImageFileId,
} from "../../services/imageToolIntent.js";
import { conversationHasImages } from "./imageParts.js";
import { imageEditTool } from "./imageEdit.js";

function ctxHasEditableImage(ctx = {}) {
  if (conversationHasImages(ctx.contents || [], ctx.attachments || [])) {
    return true;
  }
  const pools = [
    ...(Array.isArray(ctx.attachments) ? ctx.attachments : []),
    ...(Array.isArray(ctx.conversationAttachments)
      ? ctx.conversationAttachments
      : []),
  ];
  return pools.some((a) => {
    if (!a) return false;
    const mime = String(a.mimeType || "").toLowerCase();
    const kind = String(a.kind || "").toLowerCase();
    return (
      kind === "image" ||
      mime.startsWith("image/") ||
      Boolean(a.dataBase64 && mime.startsWith("image/")) ||
      /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.test(a.name || "")
    );
  });
}

/**
 * Image generation via Gemini native image models (text → generateImage).
 * Never accepts or forwards a source image — use image_edit for that.
 *
 * HARD GUARD: if the conversation already has an uploaded image, this tool
 * refuses to call generateImage() (text-only, drops bytes) and redirects to
 * image_edit so the source pixels are preserved.
 */
export const imageGenerationTool = {
  id: "image_generation",
  name: "image_generation",
  displayName: "Image Generation",
  feature: "image_generation",
  quotaMetric: "image_generation",
  description:
    "Generate an image from a text prompt. Call this IMMEDIATELY when the user asks to create, draw, design, generate, illustrate, paint, or sketch something visual AND there is no uploaded image to edit. Do not explain your capabilities — generate the image. The client renders the result inline in chat. Do NOT use this when the user uploaded an image — use image_edit instead (generation discards the upload).",
  schema: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "Detailed description of the image to generate",
      },
      aspectRatio: {
        type: "string",
        description: "Optional aspect ratio hint (best-effort; model may approximate)",
        enum: ["1:1", "3:4", "4:3", "9:16", "16:9"],
      },
    },
    required: ["prompt"],
    additionalProperties: false,
  },
  async execute(args = {}, ctx = {}) {
    const prompt = String(args.prompt || "").trim();
    if (!prompt) return { ok: false, error: "Prompt is required" };
    if (prompt.length > 2000) return { ok: false, error: "Prompt too long" };

    if (process.env.VANI_DISABLE_IMAGE_GEN === "true") {
      return {
        ok: false,
        error: imageGenerationUnavailableMessage(),
      };
    }

    // Never replace editing with text-to-image when a source image exists.
    if (ctxHasEditableImage(ctx)) {
      const imageFileId = pickLatestImageFileId(ctx);
      console.warn(
        "[image_trace] mode=Generate REDIRECT→Edit reason=source_image_present imageFileId=%s",
        imageFileId || "(resolve-from-ctx)"
      );
      return imageEditTool.execute(
        {
          instruction: prompt,
          ...(imageFileId ? { imageFileId } : {}),
          ...(args.aspectRatio ? { aspectRatio: args.aspectRatio } : {}),
        },
        ctx
      );
    }

    try {
      return await generateImage({
        prompt,
        aspectRatio: args.aspectRatio,
      });
    } catch (err) {
      const message = err?.message || "Image generation failed";
      console.error("[image_generation]", message);
      return {
        ok: false,
        error: message,
        prompt,
      };
    }
  },
};
