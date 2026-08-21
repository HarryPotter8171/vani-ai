/**
 * Detect when the user is asking to generate or edit an image so the
 * orchestrator can force the matching tool — and never answer with a
 * capability refusal.
 *
 * Priority when an image is uploaded:
 *   Vision (explain / describe / what is this)
 *   → Image Edit (edit / replace / remove / …)
 *   → Image Generation (create / draw / generate — only without a source upload)
 *
 * CRITICAL: When an image is uploaded, edit requests must route to image_edit.
 * Routing to image_generation discards the uploaded bytes (generateImage is
 * text-only). Hinglish like "snowfall kar do" / "pani red kar do" must count.
 */

const IMAGE_GEN_UNAVAILABLE_MSG =
  "The image generation service is temporarily unavailable.";

const IMAGE_EDIT_UNAVAILABLE_MSG =
  "The image editing service is temporarily unavailable.";

/** English verbs / intents that mean "edit the uploaded image". */
const EDIT_INTENT_RE =
  /\b(edit|change|replace|remove|erase|add|put|insert|expand|uncrop|inpaint|outpaint|make|transform|modify|retouch|restyle|upscale|crop|blur|enhance|colorize|recolor|swap|delete|paint|fix|update|improve|turn|convert)\b/i;

/** Hinglish / Hindi action phrases used for photo edits ("kar do", "bana do"). */
const HINGLISH_EDIT_RE =
  /\b(kar\s*do|kardo|bana\s*do|banado|kar\s*de|kar\s*dena|kar\s*den|kar\s*dijiye|kar\s*do\s*na)\b/i;

/**
 * Vision / Q&A over an uploaded image — never generate or edit.
 * Covers: "Explain this", "What is this?", "Describe", "What's in the photo?"
 */
function looksLikeImageCreateRequest(msg) {
  return (
    (/\b(generate|create|draw|design|illustrate|render|sketch)\b/i.test(msg) &&
      /\b(image|picture|photo|illustration|artwork|drawing|logo|icon|poster|banner|wallpaper)\b/i.test(
        msg
      )) ||
    /\b(give|show|get|send|fetch)\s+me\b[\s\S]{0,60}\b(an? )?(image|picture|photo|illustration|artwork|drawing|logo|icon|poster|banner|wallpaper)\b/i.test(
      msg
    ) ||
    /\b(give|show|get|send|fetch)\s+me\b[\s\S]{0,60}\b(picture|photo|image|illustration|artwork|drawing|logo|icon|poster|banner|wallpaper)\b/i.test(
      msg
    ) ||
    /\b(an? |the )?(picture|photo|image|illustration|artwork|drawing|logo|icon|poster|banner|wallpaper)\b[\s\S]{0,20}\b(of|showing|depicting|with)\b/i.test(
      msg
    ) ||
    /\bi (want|need|would like)\b[\s\S]{0,48}\b(an? )?(picture|photo|image|illustration|drawing|logo)\b/i.test(
      msg
    )
  );
}

export function isVisionOnlyQuestion(userMessage) {
  const msg = String(userMessage || "").trim().toLowerCase();
  if (!msg) return false;
  if (hasEditIntent(msg)) return false;
  // "Generate an image of …?" is creation, not vision Q&A.
  if (looksLikeImageCreateRequest(msg)) return false;

  // Explicit vision / describe / identify intents (anywhere in the message).
  if (
    /\b(explain|describe|analyze|analyse|identify|recognize|recognise|caption|inspect|look at|tell me about|what(?:'s| is| are) (?:this|that|it|in)|who(?:'s| is)|where(?:'s| is)|kya (?:hai|ye|yeh)|kaun|kitna)\b/i.test(
      msg
    )
  ) {
    return true;
  }

  // Short prompts that start with vision verbs.
  if (
    /^(what|who|where|describe|analyze|analyse|explain|tell me|look|see|check|identify|recognize|recognise|kya|kaun|kitna)\b/i.test(
      msg
    )
  ) {
    return true;
  }

  // Any question mark without an edit/create verb → vision Q&A when an image is attached.
  if (/\?/.test(msg)) return true;

  return false;
}

/**
 * Explicit "create a brand-new image from text" — never treat as edit or vision.
 */
function isExplicitNewImageGeneration(msg) {
  if (isVisionOnlyQuestion(msg)) return false;

  return (
    /\b(generate|create|draw|design|illustrate|render|paint|sketch)\b[\s\S]{0,48}\b(an? |the )?(image|picture|photo|illustration|artwork|drawing|logo|icon|poster|banner|wallpaper)\b/.test(
      msg
    ) ||
    /\b(draw me|generate me|create me|make me)\b[\s\S]{0,40}\b(an? )?(image|picture|photo|illustration|drawing|logo)?\b/.test(
      msg
    ) ||
    /\bgenerate an image\b/.test(msg) ||
    /\bmake (an?|me a) (image|picture|photo|illustration|drawing|logo)\b/.test(msg) ||
    // "an image of …" only when paired with a create verb nearby
    /\b(generate|create|draw|design|illustrate|render|sketch|make)\b[\s\S]{0,64}\b(an? )?(image|picture|photo|illustration|artwork|drawing|logo|icon|poster)\b[\s\S]{0,24}\b(of|showing|with|for|that)\b/.test(
      msg
    ) ||
    // Colloquial requests: "give me modi picture", "show me a photo of …"
    /\b(give|show|get|send|fetch)\s+me\b[\s\S]{0,60}\b(an? )?(image|picture|photo|illustration|artwork|drawing|logo|icon|poster|banner|wallpaper)\b/.test(
      msg
    ) ||
    /\b(give|show|get|send|fetch)\s+me\b[\s\S]{0,60}\b(picture|photo|image|illustration|artwork|drawing|logo|icon|poster|banner|wallpaper)\b/.test(
      msg
    ) ||
    /\b(an? |the )?(picture|photo|image|illustration|artwork|drawing|logo|icon|poster|banner|wallpaper)\b[\s\S]{0,20}\b(of|showing|depicting|with)\b/.test(
      msg
    ) ||
    /\bi (want|need|would like)\b[\s\S]{0,48}\b(an? )?(picture|photo|image|illustration|drawing|logo)\b/.test(
      msg
    )
  );
}

export function hasEditIntent(userMessage) {
  const msg = String(userMessage || "").trim().toLowerCase();
  if (!msg) return false;
  if (EDIT_INTENT_RE.test(msg) || HINGLISH_EDIT_RE.test(msg)) return true;
  if (
    /\bedit (this|the) (image|photo|picture|pic)\b/.test(msg) ||
    /\b(remove|erase|replace) (the )?(background|sky|object)\b/.test(msg)
  ) {
    return true;
  }
  return false;
}

/**
 * @param {string} userMessage
 * @param {{ hasImages?: boolean }} [opts]
 * @returns {{ tool: "image_generation" | "image_edit", mode: "force" } | null}
 */
export function detectImageToolIntent(userMessage, { hasImages = false } = {}) {
  const msg = String(userMessage || "").trim().toLowerCase();
  if (!msg) return null;

  // Vision Q&A over an upload — never force generate or edit.
  if (hasImages && isVisionOnlyQuestion(msg)) {
    return null;
  }

  // With an uploaded image, edit intents (English + Hinglish) force image_edit.
  // Never let these fall through to image_generation — that path drops bytes.
  if (hasImages && hasEditIntent(msg)) {
    return { tool: "image_edit", mode: "force" };
  }

  // Explicit edit phrasing even if hasImages detection missed (tool will resolve file).
  if (
    /\bedit (this|the) (image|photo|picture|pic)\b/.test(msg) ||
    /\b(remove|erase|replace) (the )?(background|sky|object)\b/.test(msg)
  ) {
    return { tool: "image_edit", mode: "force" };
  }

  const generatePhrases = isExplicitNewImageGeneration(msg);

  // Text-to-image ONLY when there is no uploaded source image.
  // With an upload present, forcing image_generation discards bytes and
  // regenerates from a text prompt (often derived from OCR / captions).
  // That is never a valid substitute for editing.
  if (generatePhrases && !hasImages) {
    return { tool: "image_generation", mode: "force" };
  }

  return null;
}

/** @deprecated Prefer imageGenerationUnavailableMessage / imageEditUnavailableMessage */
export function imageServiceUnavailableMessage(toolName = "image_generation") {
  return toolName === "image_edit"
    ? IMAGE_EDIT_UNAVAILABLE_MSG
    : IMAGE_GEN_UNAVAILABLE_MSG;
}

export function imageGenerationUnavailableMessage() {
  return IMAGE_GEN_UNAVAILABLE_MSG;
}

export function imageEditUnavailableMessage() {
  return IMAGE_EDIT_UNAVAILABLE_MSG;
}

/**
 * Normalize image tool failures for the model + client.
 */
export function normalizeImageToolFailure(result = {}, toolName = "image_generation") {
  const detail =
    typeof result.error === "string" && result.error.trim()
      ? result.error.trim().slice(0, 400)
      : "unknown error";

  const unavailable =
    toolName === "image_edit"
      ? IMAGE_EDIT_UNAVAILABLE_MSG
      : IMAGE_GEN_UNAVAILABLE_MSG;

  const isInputError =
    /required|too long|no images|not found|not available in the current conversation/i.test(
      detail
    );

  if (isInputError) {
    return {
      ...result,
      ok: false,
      error: detail,
      detail,
      note:
        "Image tool could not run due to missing or invalid input. Ask briefly for what you need. " +
        "Do NOT say you cannot edit, generate, or display images, and do NOT claim you are text-only. " +
        "Do NOT offer to generate a new image as a substitute for editing unless the user asks.",
    };
  }

  return {
    ...result,
    ok: false,
    error: unavailable,
    detail,
    note:
      `Image tool failed (${detail}). Reply with exactly: "${unavailable}" ` +
      "Do NOT say you cannot edit or generate images, do NOT claim you are text-only, " +
      "and do NOT offer to generate a new image instead.",
  };
}

/**
 * Pick the best fileId for the latest editable image in context.
 */
export function pickLatestImageFileId({
  attachments = [],
  conversationAttachments = [],
} = {}) {
  const pools = [...attachments, ...conversationAttachments];
  for (let i = pools.length - 1; i >= 0; i -= 1) {
    const a = pools[i];
    if (!a) continue;
    const mime = String(a.mimeType || "").toLowerCase();
    const kind = String(a.kind || "").toLowerCase();
    const isImage =
      kind === "image" ||
      mime.startsWith("image/") ||
      /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.test(a.name || "");
    if (!isImage) continue;
    const id = a.fileId || a.id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return null;
}
