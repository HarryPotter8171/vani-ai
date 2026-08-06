/**
 * Detect when the user wants OCR / text extraction from an image or PDF
 * so the orchestrator can force the `ocr` tool — then let the LLM answer
 * (summarize, answer questions, present the transcription).
 */

const OCR_UNAVAILABLE_MSG =
  "The OCR service is temporarily unavailable.";

/** Explicit read / extract / transcribe intents. */
const OCR_READ_RE =
  /\b(read|ocr|transcribe|extract\s+(?:the\s+)?(?:text|content)|what(?:'s| is)\s+written|what\s+does\s+(?:this|it)\s+say|text\s+from|scan\s+(?:this|the)|recognize\s+(?:text|handwriting)|handwrit(?:ing|ten)|bill\s+(?:say|total|amount)|invoice|receipt)\b/i;

/** Summarize / analyze document after OCR. */
const OCR_SUMMARIZE_RE =
  /\b(summarize|summary|sum\s*up|tl;?dr|key\s+points|what\s+does\s+(?:this|the)\s+(?:pdf|document|file|image|photo|picture|scan|bill|invoice|receipt)\s+(?:say|contain|mean))\b/i;

/** Hindi / Hinglish OCR-ish asks. */
const OCR_HINGLISH_RE =
  /\b(padho|padh\s*o|likha\s*(?:hai|kya)|kya\s+likha|text\s+nikalo|padh\s*ke\s*(?:batao|bata)|samjh[aao]+)\b/i;

/**
 * @param {string} userMessage
 * @returns {boolean}
 */
export function hasOcrIntent(userMessage) {
  const msg = String(userMessage || "").trim();
  if (!msg) return false;
  if (OCR_READ_RE.test(msg)) return true;
  if (OCR_SUMMARIZE_RE.test(msg)) return true;
  if (OCR_HINGLISH_RE.test(msg)) return true;
  // Short imperative: "Read this image" / "Read this PDF"
  if (
    /\bread\s+(this|the)\s+(image|photo|picture|pic|pdf|document|file|scan|bill|invoice|receipt)\b/i.test(
      msg
    )
  ) {
    return true;
  }
  if (
    /\bwhat\s+is\s+written\s+in\s+(this|the)\b/i.test(msg) ||
    /\bextract\s+text\b/i.test(msg)
  ) {
    return true;
  }
  return false;
}

/**
 * @param {string} userMessage
 * @param {{ hasOcrable?: boolean }} [opts]
 * @returns {{ tool: "ocr", mode: "force" } | null}
 */
export function detectOcrToolIntent(userMessage, { hasOcrable = false } = {}) {
  const msg = String(userMessage || "").trim();
  if (!msg) return null;

  if (!hasOcrable && !/\b(pdf|image|photo|picture|pic|scan|bill|invoice|receipt|document)\b/i.test(msg)) {
    // Still allow explicit OCR verbs without attachment mention when
    // hasOcrable is true; without attachment, require a document word.
  }

  if (hasOcrIntent(msg) && hasOcrable) {
    return { tool: "ocr", mode: "force" };
  }

  // Explicit OCR phrasing even if attachment detection missed.
  if (
    /\bread\s+(this|the)\s+(image|photo|picture|pic|pdf|document|file)\b/i.test(
      msg
    ) ||
    /\bocr\b/i.test(msg) ||
    /\bextract\s+text\b/i.test(msg) ||
    /\bwhat\s+is\s+written\s+in\s+(this|the)\b/i.test(msg)
  ) {
    return { tool: "ocr", mode: "force" };
  }

  // Summarize + PDF/image wording — force OCR first when attachment present.
  if (
    hasOcrable &&
    OCR_SUMMARIZE_RE.test(msg) &&
    /\b(pdf|image|photo|picture|pic|document|file|scan|bill|invoice|receipt)\b/i.test(
      msg
    )
  ) {
    return { tool: "ocr", mode: "force" };
  }

  return null;
}

export function ocrUnavailableMessage() {
  return OCR_UNAVAILABLE_MSG;
}

export function normalizeOcrToolFailure(result = {}) {
  const detail =
    typeof result.error === "string" && result.error.trim()
      ? result.error.trim().slice(0, 400)
      : "unknown error";

  const isInputError =
    /required|unsupported|no (ocr|image|pdf|file|document)|not found|empty|available in the current conversation|ocr-compatible/i.test(
      detail
    );

  if (isInputError) {
    return {
      ...result,
      ok: false,
      success: false,
      error: detail,
      detail,
      note:
        "OCR could not run due to missing or invalid input. Ask briefly for an image or PDF. " +
        "Do NOT claim OCR is unsupported.",
    };
  }

  return {
    ...result,
    ok: false,
    success: false,
    error: OCR_UNAVAILABLE_MSG,
    detail,
    note:
      `OCR failed (${detail}). Reply with exactly: "${OCR_UNAVAILABLE_MSG}" ` +
      "Do NOT claim text extraction is unsupported.",
  };
}

/**
 * Pick the best fileId for the latest OCR-able attachment (image or PDF).
 */
export function pickLatestOcrFileId({
  attachments = [],
  conversationAttachments = [],
} = {}) {
  const pools = [...attachments, ...conversationAttachments];
  for (let i = pools.length - 1; i >= 0; i -= 1) {
    const a = pools[i];
    if (!a) continue;
    if (!isOcrableAttachment(a)) continue;
    const id = a.fileId || a.id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return null;
}

export function isOcrableAttachment(att) {
  if (!att || typeof att !== "object") return false;
  const mime = String(att.mimeType || "").toLowerCase();
  const kind = String(att.kind || "").toLowerCase();
  const name = String(att.name || "");
  if (kind === "pdf" || mime === "application/pdf" || /\.pdf$/i.test(name)) {
    return true;
  }
  if (kind === "image" || mime.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(name)) {
    return (
      mime === "image/jpeg" ||
      mime === "image/jpg" ||
      mime === "image/png" ||
      mime === "image/webp" ||
      /\.(jpe?g|png|webp)$/i.test(name) ||
      // kind=image without mime — treat as OCR-able; tool validates formats
      kind === "image"
    );
  }
  return false;
}

/**
 * Restrict to product-supported OCR formats (JPG/JPEG/PNG/WEBP/PDF).
 */
export function isOcrToolFormat(att) {
  if (!att || typeof att !== "object") return false;
  const mime = String(att.mimeType || "").toLowerCase();
  const name = String(att.name || "").toLowerCase();
  if (/\.(jpe?g|png|webp|pdf)$/i.test(name)) return true;
  if (
    mime === "image/jpeg" ||
    mime === "image/jpg" ||
    mime === "image/png" ||
    mime === "image/webp" ||
    mime === "application/pdf"
  ) {
    return true;
  }
  return false;
}
