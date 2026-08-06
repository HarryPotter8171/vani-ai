/**
 * Deterministic OCR pipeline — mirrors imageEditPipeline.
 *
 * When an OCR intent + image/PDF are detected, invoke `ocr` directly,
 * then let the LLM continue with the extracted text (summarize / answer).
 */

import { executeTool, getTool } from "../tools/index.js";
import {
  detectOcrToolIntent,
  hasOcrIntent,
  isOcrToolFormat,
  isOcrableAttachment,
  normalizeOcrToolFailure,
  pickLatestOcrFileId,
} from "./ocrToolIntent.js";
import { conversationHasImages } from "../tools/implementations/imageParts.js";

function poolsFrom(toolContext = {}) {
  return [
    ...(Array.isArray(toolContext.attachments) ? toolContext.attachments : []),
    ...(Array.isArray(toolContext.conversationAttachments)
      ? toolContext.conversationAttachments
      : []),
  ];
}

function contentsHavePdf(contents = []) {
  return (contents || []).some((c) =>
    (c.parts || []).some(
      (p) =>
        p?.inlineData?.mimeType === "application/pdf" ||
        String(p?.inlineData?.mimeType || "").includes("pdf")
    )
  );
}

/**
 * True when conversation has an image (supported formats) or PDF for OCR.
 */
export function hasOcrableInputs(contents = [], toolContext = {}) {
  const pools = poolsFrom(toolContext);
  if (pools.some((a) => isOcrableAttachment(a) && isOcrToolFormat(a))) {
    return true;
  }
  if (contentsHavePdf(contents)) return true;
  // Images in contents — OCR tool supports jpg/png/webp (gif/heic may still
  // reach extractOcrText via sharp, but product allowlist is the four formats).
  if (conversationHasImages(contents, toolContext.attachments || [])) {
    return true;
  }
  return false;
}

/**
 * Force OCR when the user asks to read / extract / summarize an attached
 * image or PDF. Takes priority over image_edit for those intents.
 */
export function shouldForceOcr(userMessage, contents, toolContext = {}) {
  const hasOcrable = hasOcrableInputs(contents, toolContext);
  const intent = detectOcrToolIntent(userMessage, { hasOcrable });

  if (intent?.tool === "ocr" && intent.mode === "force") {
    console.info(
      "[ocr_trace] router=shouldForceOcr force=true reason=intent tool=ocr"
    );
    return true;
  }

  // Latest-turn OCR-able upload + clear OCR intent phrasing.
  const latest = (toolContext.attachments || []).some(
    (a) => isOcrableAttachment(a) && isOcrToolFormat(a)
  );
  if (latest && hasOcrIntent(userMessage)) {
    console.info(
      "[ocr_trace] router=shouldForceOcr force=true reason=latest_upload tool=ocr"
    );
    return true;
  }

  return false;
}

/**
 * Run `ocr` immediately and yield orchestrator events.
 * Unlike image_edit, callers should continue the LLM loop with the returned
 * modelParts / responseParts so the assistant can summarize or answer.
 *
 * @returns {AsyncGenerator} yields events; final return value is
 *   { ok, result, modelParts, responseParts }
 */
export async function* runDirectOcr({
  userMessage = "",
  contents = [],
  toolContext = {},
  signal,
} = {}) {
  const tool = getTool("ocr");
  const displayName = tool?.displayName || "OCR";
  const callId = `ocr_${Date.now()}`;
  const instruction = String(userMessage || "").trim().slice(0, 2000);
  const fileId = pickLatestOcrFileId(toolContext);

  console.info(
    "[ocr_trace] pipeline=runDirectOcr tool=ocr fileId=%s instructionLen=%d",
    fileId || "(none)",
    instruction.length
  );

  yield {
    type: "tool_start",
    id: callId,
    name: "ocr",
    displayName,
  };

  const ctx = {
    ...toolContext,
    contents,
    signal,
  };

  let rawResult = await executeTool(
    "ocr",
    {
      ...(fileId ? { fileId } : {}),
      ...(instruction ? { focus: instruction } : {}),
    },
    ctx
  );

  if (rawResult?.ok === false || rawResult?.success === false) {
    rawResult = normalizeOcrToolFailure(rawResult);
  }

  const ok = rawResult?.ok !== false && rawResult?.success !== false;

  yield {
    type: "tool_done",
    id: callId,
    name: "ocr",
    displayName,
    ok,
    error: ok ? undefined : rawResult?.error,
  };

  const modelParts = [
    {
      functionCall: {
        name: "ocr",
        args: {
          ...(fileId ? { fileId } : {}),
          ...(instruction ? { focus: instruction } : {}),
        },
      },
    },
  ];

  const sanitized = ok
    ? {
        success: true,
        ok: true,
        text: rawResult.text || "",
        pages: Array.isArray(rawResult.pages) ? rawResult.pages : [],
        language: rawResult.language || "",
        metadata: rawResult.metadata || {},
        note:
          "OCR extracted text from the attachment. Use this text to answer the user " +
          "(transcribe, summarize, or answer questions). Present clearly; do not dump raw JSON.",
      }
    : rawResult;

  const responseParts = [
    {
      functionResponse: {
        name: "ocr",
        response: sanitized,
      },
    },
  ];

  return {
    ok,
    result: rawResult,
    modelParts,
    responseParts,
    tool: tool?.name || "ocr",
  };
}
