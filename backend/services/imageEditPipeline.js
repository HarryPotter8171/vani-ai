/**
 * Deterministic image-edit pipeline.
 *
 * When an edit intent + uploaded image are detected, invoke image_edit
 * directly — never let the LLM refuse or offer a fresh generation instead.
 * On success the user sees ONLY a fixed caption + the edited image.
 */

import { executeTool, getTool } from "../tools/index.js";
import { IMAGE_EDIT_SUCCESS_CAPTION } from "./image/index.js";
import {
  detectImageToolIntent,
  isVisionOnlyQuestion,
  normalizeImageToolFailure,
  pickLatestImageFileId,
} from "./imageToolIntent.js";
import { hasOcrIntent } from "./ocrToolIntent.js";
import { conversationHasImages } from "../tools/implementations/imageParts.js";

export { isVisionOnlyQuestion };

function isImageAttachment(att) {
  if (!att || typeof att !== "object") return false;
  const mime = String(att.mimeType || "").toLowerCase();
  const kind = String(att.kind || "").toLowerCase();
  return (
    kind === "image" ||
    mime.startsWith("image/") ||
    Boolean(att.dataBase64 && (kind === "image" || mime.startsWith("image/"))) ||
    /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.test(att.name || "")
  );
}

/**
 * True when the conversation has an editable image (inline bytes, hydrated
 * attachments, or image fileIds that can be reloaded).
 */
export function hasEditableImages(contents = [], toolContext = {}) {
  if (conversationHasImages(contents, toolContext.attachments || [])) {
    return true;
  }

  const pools = [
    ...(toolContext.attachments || []),
    ...(toolContext.conversationAttachments || []),
  ];
  return pools.some(isImageAttachment);
}

/**
 * Force image_edit only when there is a real edit intent + an uploaded image.
 *
 * Priority with an upload:
 *   Vision (explain / describe / what is this) → multimodal / vision tools
 *   Edit (change / remove / replace / …) → image_edit
 *   Generate → never while a source image is attached
 */
export function shouldForceImageEdit(userMessage, contents, toolContext = {}) {
  // OCR / read / summarize intents must never route to image_edit.
  if (hasOcrIntent(userMessage)) {
    return false;
  }

  // Vision Q&A must never route to image_edit or image_generation.
  if (isVisionOnlyQuestion(userMessage)) {
    return false;
  }

  const hasImages = hasEditableImages(contents, toolContext);
  const latestUpload = (toolContext.attachments || []).some(isImageAttachment);
  const intent = detectImageToolIntent(userMessage, {
    hasImages: hasImages || latestUpload,
  });

  if (intent?.tool === "image_edit" && intent.mode === "force") {
    console.info(
      "[image_trace] router=shouldForceImageEdit force=true reason=intent tool=image_edit"
    );
    return true;
  }

  return false;
}

/**
 * Run image_edit immediately and yield orchestrator events.
 *
 * On success yields: tool events + image + fixed caption only.
 * Never streams OCR, metadata, dimensions, or model prose.
 *
 * @returns {AsyncGenerator} yields events; final return value is
 *   { ok, result, modelParts, responseParts }
 */
export async function* runDirectImageEdit({
  userMessage = "",
  contents = [],
  toolContext = {},
  signal,
} = {}) {
  const tool = getTool("image_edit");
  const displayName = "✏️ Editing image";
  const callId = `image_edit_${Date.now()}`;
  const instruction = String(userMessage || "").trim().slice(0, 2000);
  const imageFileId = pickLatestImageFileId(toolContext);

  console.info(
    "[image_trace] pipeline=runDirectImageEdit tool=image_edit imageFileId=%s instructionLen=%d",
    imageFileId || "(none)",
    instruction.length
  );

  // tool_start drives the UI status — do NOT emit a text delta here (it would
  // permanently land in the assistant message / OCR flood path).
  yield {
    type: "tool_start",
    id: callId,
    name: "image_edit",
    displayName,
  };

  const ctx = {
    ...toolContext,
    contents,
    signal,
    hasVision: true,
  };

  let rawResult = await executeTool(
    "image_edit",
    {
      instruction: instruction || "Edit this image as requested.",
      ...(imageFileId ? { imageFileId } : {}),
    },
    ctx
  );

  if (rawResult?.ok === false) {
    rawResult = normalizeImageToolFailure(rawResult, "image_edit");
  }

  const ok = rawResult?.ok !== false;

  if (ok && (rawResult.fileId || rawResult.imageUrl || rawResult.imageBase64)) {
    yield {
      type: "image",
      mimeType: rawResult.mimeType || "image/png",
      // Prefer durable file reference — never put binary/base64 in text deltas.
      ...(rawResult.fileId ? { fileId: rawResult.fileId } : {}),
      ...(rawResult.imageUrl ? { imageUrl: rawResult.imageUrl } : {}),
      ...(rawResult.size ? { size: rawResult.size } : {}),
      // Only include base64 when persistence failed (legacy / Gemini fallback).
      ...(!rawResult.fileId && rawResult.imageBase64
        ? { dataBase64: rawResult.imageBase64 }
        : {}),
      prompt: rawResult.instruction || instruction,
    };
  }

  yield {
    type: "tool_done",
    id: callId,
    name: "image_edit",
    displayName,
    ok,
    error: ok ? undefined : rawResult?.error,
  };

  if (ok) {
    // Fixed caption only — never let an LLM echo OCR / metadata into chat.
    yield { type: "delta", text: IMAGE_EDIT_SUCCESS_CAPTION, replace: true };
  } else {
    yield {
      type: "delta",
      text: `\n\n${rawResult.error}`,
      replace: true,
    };
  }

  const modelParts = [
    {
      functionCall: {
        name: "image_edit",
        args: {
          instruction: instruction || "Edit this image as requested.",
          ...(imageFileId ? { imageFileId } : {}),
        },
      },
    },
  ];

  const sanitized =
    ok && (rawResult?.imageBase64 || rawResult?.fileId || rawResult?.imageUrl)
      ? (() => {
          const { imageBase64, ...rest } = rawResult;
          return {
            ...rest,
            ok: true,
            success: true,
            imageGenerated: true,
            ...(typeof imageBase64 === "string"
              ? { imageBytes: imageBase64.length }
              : rawResult.size
                ? { imageBytes: rawResult.size }
                : {}),
            ...(rawResult.imageUrl ? { imageUrl: rawResult.imageUrl } : {}),
            note:
              rest.note ||
              "Image edited successfully. Do not describe OCR, metadata, or base64.",
          };
        })()
      : rawResult;

  const responseParts = [
    {
      functionResponse: {
        name: "image_edit",
        response: sanitized,
      },
    },
  ];

  return {
    ok,
    result: rawResult,
    modelParts,
    responseParts,
    tool: tool?.name || "image_edit",
  };
}
