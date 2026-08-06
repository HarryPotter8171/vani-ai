/**
 * OCR tool — extract plain text, tables, and mixed Hindi/English (incl.
 * handwriting best-effort) from JPG / JPEG / PNG / WEBP / PDF attachments.
 *
 * Integrates into the agent pipeline exactly like image_edit:
 * registered in tools/, wrapped for agents/, force-routed on OCR intents.
 */

import { attachmentFromUploadId } from "../../services/chatAttachmentService.js";
import { runOcr, isOcrSupported } from "../../services/ocr/index.js";
import { ocrUnavailableMessage } from "../../services/ocrToolIntent.js";
import { normalizeImageMime } from "../../services/image/shared.js";

function isOcrAttachment(att) {
  if (!att || typeof att !== "object") return false;
  const mime = String(att.mimeType || "").toLowerCase();
  const kind = String(att.kind || "").toLowerCase();
  const name = String(att.name || "");
  if (kind === "pdf" || mime === "application/pdf" || /\.pdf$/i.test(name)) {
    return true;
  }
  if (
    kind === "image" ||
    mime.startsWith("image/") ||
    /\.(jpe?g|png|webp)$/i.test(name)
  ) {
    return isOcrSupported({ filename: name, mimeType: mime });
  }
  return false;
}

function bufferFromAttachment(att) {
  if (!att?.dataBase64) return null;
  try {
    return Buffer.from(att.dataBase64, "base64");
  } catch {
    return null;
  }
}

function bufferFromInlineData(part) {
  const data = part?.inlineData?.data;
  if (!data) return null;
  try {
    return Buffer.from(data, "base64");
  } catch {
    return null;
  }
}

/**
 * Resolve the best OCR source: explicit fileId → attachment bytes →
 * conversation inlineData (images / PDF).
 */
async function resolveOcrSource(args, ctx) {
  const pools = [
    ...(Array.isArray(ctx.attachments) ? ctx.attachments : []),
    ...(Array.isArray(ctx.conversationAttachments)
      ? ctx.conversationAttachments
      : []),
  ];
  const ownerId = ctx.userId || ctx.user?._id || ctx.user?.id || null;

  const fileId =
    (typeof args.fileId === "string" && args.fileId.trim()) ||
    (typeof args.imageFileId === "string" && args.imageFileId.trim()) ||
    null;

  if (fileId && ownerId) {
    try {
      const att = await attachmentFromUploadId(fileId, {}, String(ownerId));
      const buffer = bufferFromAttachment(att);
      if (buffer) {
        return {
          buffer,
          filename: att.name || "",
          mimeType: att.mimeType || "",
          fileId,
        };
      }
    } catch (err) {
      console.warn("[ocr] fileId hydrate failed:", err?.message || err);
    }
  }

  // Newest attachment with bytes.
  for (let i = pools.length - 1; i >= 0; i -= 1) {
    const att = pools[i];
    if (!isOcrAttachment(att)) continue;
    if (att.dataBase64) {
      const buffer = bufferFromAttachment(att);
      if (buffer) {
        return {
          buffer,
          filename: att.name || "",
          mimeType: att.mimeType || "",
          fileId: att.fileId || att.id || null,
        };
      }
    }
  }

  // Hydrate fileId-only chips.
  if (ownerId) {
    for (let i = pools.length - 1; i >= 0; i -= 1) {
      const att = pools[i];
      if (!isOcrAttachment(att)) continue;
      const id = att.fileId || att.id;
      if (!id || att.dataBase64) continue;
      try {
        const hydrated = await attachmentFromUploadId(
          String(id),
          att,
          String(ownerId)
        );
        const buffer = bufferFromAttachment(hydrated);
        if (buffer) {
          return {
            buffer,
            filename: hydrated.name || att.name || "",
            mimeType: hydrated.mimeType || att.mimeType || "",
            fileId: id,
          };
        }
      } catch {
        // try next
      }
    }
  }

  // Inline data on conversation contents (images + PDF).
  const contents = Array.isArray(ctx.contents) ? ctx.contents : [];
  for (let i = contents.length - 1; i >= 0; i -= 1) {
    const parts = contents[i]?.parts || [];
    for (let j = parts.length - 1; j >= 0; j -= 1) {
      const part = parts[j];
      const mime = String(part?.inlineData?.mimeType || "").toLowerCase();
      if (!mime) continue;
      const isImage =
        mime.startsWith("image/") &&
        isOcrSupported({ mimeType: normalizeImageMime(mime) });
      const isPdf = mime === "application/pdf";
      if (!isImage && !isPdf) continue;
      const buffer = bufferFromInlineData(part);
      if (buffer) {
        return {
          buffer,
          filename: isPdf ? "document.pdf" : "image",
          mimeType: isPdf ? "application/pdf" : normalizeImageMime(mime),
          fileId: null,
        };
      }
    }
  }

  return null;
}

export const ocrTool = {
  id: "ocr",
  name: "ocr",
  displayName: "OCR",
  description:
    "Extract plain text, tables, and handwritten text (best effort) from an attached image (JPG/JPEG/PNG/WEBP) or PDF, including mixed Hindi + English. Call IMMEDIATELY when the user asks to read, OCR, transcribe, extract text, summarize a scanned PDF/image, or asks what is written in a bill/document. Returns structured text for you to present, summarize, or answer from.",
  schema: {
    type: "object",
    properties: {
      fileId: {
        type: "string",
        description: "Optional uploaded file id of the image or PDF to OCR",
      },
      focus: {
        type: "string",
        description:
          "Optional hint, e.g. 'extract table', 'transcribe handwriting', 'read the bill totals'",
      },
      language: {
        type: "string",
        description:
          "Optional Tesseract language pack(s), e.g. 'eng+hin' (default) or 'eng'",
      },
    },
    additionalProperties: false,
  },
  async execute(args = {}, ctx = {}) {
    try {
      const source = await resolveOcrSource(args, ctx);
      if (!source) {
        return {
          ok: false,
          success: false,
          text: "",
          pages: [],
          language: "",
          metadata: {},
          error:
            "No OCR-compatible image or PDF is available in the current conversation. Supported: JPG, JPEG, PNG, WEBP, PDF.",
        };
      }

      if (
        !isOcrSupported({
          filename: source.filename,
          mimeType: source.mimeType,
        })
      ) {
        return {
          ok: false,
          success: false,
          text: "",
          pages: [],
          language: "",
          metadata: {
            filename: source.filename || null,
            mimeType: source.mimeType || null,
          },
          error:
            "Unsupported OCR input. Supported: JPG, JPEG, PNG, WEBP, PDF.",
        };
      }

      const language =
        typeof args.language === "string" && args.language.trim()
          ? args.language.trim().slice(0, 40)
          : undefined;

      const result = await runOcr(source.buffer, {
        filename: source.filename,
        mimeType: source.mimeType,
        language,
      });

      if (!result.success) {
        return {
          ok: false,
          success: false,
          text: result.text || "",
          pages: result.pages || [],
          language: result.language || "",
          metadata: result.metadata || {},
          error: result.error || ocrUnavailableMessage(),
        };
      }

      return {
        ok: true,
        success: true,
        text: result.text || "",
        pages: Array.isArray(result.pages) ? result.pages : [],
        language: result.language || "",
        metadata: {
          ...(result.metadata || {}),
          ...(source.fileId ? { fileId: source.fileId } : {}),
          ...(typeof args.focus === "string" && args.focus.trim()
            ? { focus: args.focus.trim().slice(0, 500) }
            : {}),
        },
      };
    } catch (err) {
      const message = err?.message || "OCR failed";
      console.error("[ocr]", message);
      return {
        ok: false,
        success: false,
        text: "",
        pages: [],
        language: "",
        metadata: {},
        error: message,
      };
    }
  },
};
