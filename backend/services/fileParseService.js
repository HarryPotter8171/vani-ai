import AdmZip from "adm-zip";
import { parseBuffer } from "./parsers/index.js";
import { processImage, toUserFacingImageText } from "./image/index.js";
import { processImageForVision } from "./vision/imageProcessor.js";
import { understandPdf } from "./documentUnderstanding/extractors/pdf.js";

const MAX_EXTRACTED_CHARS = 120_000;
/** Full document text included in the model prompt before chunking. */
const FULL_DOC_PROMPT_CHARS = 80_000;
const MAX_ZIP_ENTRIES = 40;
const MAX_ZIP_ENTRY_BYTES = 2 * 1024 * 1024;
/** Cap OCR/metadata text stored on chat image attachments. */
const MAX_IMAGE_CONTEXT_CHARS = 20_000;
/** Cap persisted extracted text for documents (PDF/DOCX/etc.). */
const MAX_DOC_PERSIST_CHARS = 120_000;

const IMAGE_KINDS = new Set(["image"]);
/** Kinds that go through the modular plain-text parsers (no RAG/embeddings). */
const TEXT_PARSER_KINDS = new Set(["docx", "xlsx", "csv", "text", "markdown"]);

function normalizeImageMime(mimeType = "") {
  const mime = mimeType.toLowerCase();
  if (mime === "image/jpg") return "image/jpeg";
  if (mime === "image/heif") return "image/heic";
  if (mime === "image/x-ms-bitmap" || mime === "image/x-bmp") return "image/bmp";
  if (
    mime === "image/jpeg" ||
    mime === "image/png" ||
    mime === "image/webp" ||
    mime === "image/gif" ||
    mime === "image/heic" ||
    mime === "image/bmp"
  ) {
    return mime;
  }
  if (mime.startsWith("image/")) return "image/jpeg";
  return mimeType || "image/jpeg";
}

function kindFromName(name = "", mimeType = "") {
  const lower = name.toLowerCase();
  const mime = (mimeType || "").toLowerCase();

  if (
    mime.startsWith("image/") ||
    /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.test(lower)
  ) {
    return "image";
  }
  if (mime === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
  if (
    mime.includes("wordprocessingml") ||
    lower.endsWith(".docx")
  )
    return "docx";
  if (mime === "text/csv" || lower.endsWith(".csv")) return "csv";
  if (
    mime.includes("spreadsheetml") ||
    mime === "application/vnd.ms-excel" ||
    /\.xlsx?$/i.test(lower)
  )
    return "xlsx";
  if (mime.includes("zip") || lower.endsWith(".zip")) return "zip";
  if (mime === "text/markdown" || /\.(md|markdown)$/i.test(lower)) return "markdown";
  if (mime.startsWith("text/") || lower.endsWith(".txt")) return "text";
  return "unknown";
}

function truncate(text, limit = MAX_EXTRACTED_CHARS) {
  if (!text) return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n\n[Truncated — original content exceeded ${limit} characters]`;
}

function bufferFromBase64(dataBase64) {
  return Buffer.from(dataBase64, "base64");
}

function meaningfulText(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return false;
  const alnum = (normalized.match(/[A-Za-z0-9\u00C0-\u024F\u0900-\u097F]/g) || [])
    .length;
  return alnum >= 40;
}

/**
 * Format extracted document text for the model prompt.
 * Small docs pass in full; large docs get the first chunk with a continue hint.
 */
function formatDocumentForPrompt(name, kind, text) {
  const full = String(text || "").trim();
  if (!full) {
    return {
      promptBlock: `[Attached ${kind}: ${name} — no extractable text found]`,
      persistText: undefined,
      truncated: false,
    };
  }

  const persistText = truncate(full, MAX_DOC_PERSIST_CHARS);
  if (full.length <= FULL_DOC_PROMPT_CHARS) {
    return {
      promptBlock: `--- File: ${name} (${kind}) ---\n${full}`,
      persistText,
      truncated: false,
    };
  }

  const chunk = full.slice(0, FULL_DOC_PROMPT_CHARS);
  const remaining = full.length - FULL_DOC_PROMPT_CHARS;
  return {
    promptBlock:
      `--- File: ${name} (${kind}) — part 1 of extracted text ---\n${chunk}\n\n` +
      `[Document continues — ${remaining} more characters were extracted but not fully inlined in this turn. ` +
      `Call the file_reader tool with increasing offset/limit to fetch the rest yourself, and keep solving until the document is finished. ` +
      `Do not ask the user to continue or to specify a question.]`,
    persistText,
    truncated: true,
  };
}

async function extractViaParsers(buffer, name, mimeType) {
  const { text } = await parseBuffer(buffer, { filename: name, mimeType });
  return text;
}

/**
 * Resolve PDF text for the agent: prefer prior understanding, then text layer,
 * then OCR via document understanding. Never return metadata-only when bytes exist.
 */
async function extractPdfText(buffer, name, existingText = "") {
  if (meaningfulText(existingText)) {
    return String(existingText).trim();
  }

  let textLayer = "";
  try {
    textLayer = await extractViaParsers(buffer, name, "application/pdf");
  } catch (err) {
    console.warn(`PDF text-layer parse failed for “${name}”:`, err.message);
  }

  if (meaningfulText(textLayer)) {
    return String(textLayer).trim();
  }

  try {
    const understood = await understandPdf(buffer, { filename: name });
    const ocrText = String(understood?.text || "").trim();
    if (ocrText) return ocrText;
  } catch (err) {
    console.warn(`PDF OCR understanding failed for “${name}”:`, err.message);
  }

  return String(existingText || textLayer || "").trim();
}

/**
 * Run OCR + metadata for a chat image attachment.
 * Failures are soft — the native image inlineData still reaches the model.
 */
async function processImageAttachment(buffer, name, mimeType, existing = {}) {
  // Prefer existing OCR / sidecar text — skip duplicate Tesseract (BE-C3).
  // When extractedText is already present, never re-OCR the same buffer.
  if (existing.extractedText && existing.imageMetadata) {
    return {
      text: truncate(existing.extractedText, MAX_IMAGE_CONTEXT_CHARS),
      imageMetadata: existing.imageMetadata,
      inlineMime: normalizeImageMime(mimeType),
      inlineBase64: null,
    };
  }

  if (existing.extractedText) {
    try {
      const optimized = await processImageForVision(buffer, {
        filename: name,
        mimeType,
      });
      return {
        text: truncate(existing.extractedText, MAX_IMAGE_CONTEXT_CHARS),
        imageMetadata: existing.imageMetadata || {
          width: optimized.width,
          height: optimized.height,
          format: optimized.format,
          mimeType: optimized.mimeType,
          sizeBytes: optimized.sizeBytes,
        },
        inlineMime: optimized.mimeType,
        inlineBase64: optimized.buffer.toString("base64"),
      };
    } catch {
      return {
        text: truncate(existing.extractedText, MAX_IMAGE_CONTEXT_CHARS),
        imageMetadata: existing.imageMetadata,
        inlineMime: normalizeImageMime(mimeType),
        inlineBase64: null,
      };
    }
  }

  try {
    // Normalize HEIC/GIF/BMP (and compress) before OCR + Gemini inlineData.
    const optimized = await processImageForVision(buffer, {
      filename: name,
      mimeType,
    });
    const processed = await processImage(optimized.buffer, {
      filename: name.replace(/\.[^.]+$/, `.${optimized.format === "jpeg" ? "jpg" : optimized.format}`),
      mimeType: optimized.mimeType,
    });
    return {
      text: truncate(processed.text, MAX_IMAGE_CONTEXT_CHARS),
      imageMetadata: processed.metadata,
      inlineMime: optimized.mimeType,
      inlineBase64: optimized.buffer.toString("base64"),
    };
  } catch (err) {
    console.error(`Image processing failed for “${name}”:`, err.message);
    return {
      text: existing.extractedText
        ? truncate(existing.extractedText, MAX_IMAGE_CONTEXT_CHARS)
        : "[Image metadata/OCR unavailable for this attachment]",
      imageMetadata: existing.imageMetadata || undefined,
      inlineMime: normalizeImageMime(mimeType),
      inlineBase64: null,
    };
  }
}

async function extractZip(buffer) {
  const zip = new AdmZip(buffer);
  const entries = zip
    .getEntries()
    .filter((e) => !e.isDirectory && !e.entryName.startsWith("__MACOSX/"))
    .slice(0, MAX_ZIP_ENTRIES);

  const parts = [];

  for (const entry of entries) {
    if (entry.header.size > MAX_ZIP_ENTRY_BYTES) {
      parts.push(`### ${entry.entryName}\n[Skipped — file too large]`);
      continue;
    }

    const kind = kindFromName(entry.entryName);
    const data = entry.getData();

    try {
      if (kind === "image" || kind === "pdf") {
        parts.push(
          `### ${entry.entryName}\n[${kind.toUpperCase()} file inside ZIP — ${data.length} bytes; not inlined from archives]`
        );
        continue;
      }

      let text = "";
      if (TEXT_PARSER_KINDS.has(kind)) {
        text = await extractViaParsers(data, entry.entryName, "");
      } else if (kind === "unknown") {
        if (!/\.(json|xml|html?|log|yml|yaml)$/i.test(entry.entryName)) {
          parts.push(`### ${entry.entryName}\n[Unsupported binary entry]`);
          continue;
        }
        text = data.toString("utf8").trim();
      } else if (kind === "zip") {
        parts.push(`### ${entry.entryName}\n[Nested ZIP skipped]`);
        continue;
      }

      parts.push(`### ${entry.entryName}\n${text || "[Empty]"}`);
    } catch (err) {
      parts.push(`### ${entry.entryName}\n[Failed to parse: ${err.message}]`);
    }
  }

  if (entries.length === 0) return "[ZIP archive is empty]";
  return parts.join("\n\n");
}

/**
 * Parse an attachment into model context.
 * Images keep native inlineData and also inject OCR + metadata text.
 * PDFs always extract text (text layer / OCR) and inject it into the prompt —
 * never metadata-only. Inline PDF bytes are kept only when extraction is weak.
 */
export async function parseAttachment(attachment) {
  const kind = attachment.kind || kindFromName(attachment.name, attachment.mimeType);
  const name = attachment.name || "file";
  const mimeType = attachment.mimeType || "application/octet-stream";

  if (!attachment.dataBase64) {
    // History reload path: use previously extracted text when raw bytes are gone.
    if (attachment.extractedText) {
      return {
        kind,
        name,
        mimeType,
        text: truncate(
          attachment.extractedText,
          kind === "image" ? MAX_IMAGE_CONTEXT_CHARS : MAX_DOC_PERSIST_CHARS
        ),
        imageMetadata: attachment.imageMetadata,
        inlinePart: null,
      };
    }
    return {
      kind,
      name,
      mimeType,
      text: `[Attached file “${name}” — content unavailable in this session]`,
      imageMetadata: attachment.imageMetadata,
      inlinePart: null,
    };
  }

  if (IMAGE_KINDS.has(kind)) {
    const inlineMime = normalizeImageMime(mimeType);
    const buffer = bufferFromBase64(attachment.dataBase64);
    const processed = await processImageAttachment(buffer, name, inlineMime, {
      extractedText: attachment.extractedText,
      imageMetadata: attachment.imageMetadata,
    });

    const data =
      processed.inlineBase64 ||
      attachment.dataBase64;
    const mime = processed.inlineMime || inlineMime;

    return {
      kind,
      name,
      mimeType: mime,
      text: processed.text,
      imageMetadata: processed.imageMetadata,
      inlinePart: {
        inlineData: {
          mimeType: mime === "image/heic" || mime === "image/bmp" || mime === "image/gif"
            ? "image/jpeg"
            : mime,
          data,
        },
      },
    };
  }

  if (kind === "pdf") {
    const buffer = bufferFromBase64(attachment.dataBase64);
    const text = await extractPdfText(buffer, name, attachment.extractedText || "");
    const hasText = meaningfulText(text);

    return {
      kind,
      name,
      mimeType: "application/pdf",
      // Always surface extracted text to the agent when available.
      text: text ? truncate(text, MAX_DOC_PERSIST_CHARS) : null,
      inlinePart:
        // Prefer text routing. Keep native PDF bytes only as a fallback when
        // extraction failed (e.g. heavily graphical / encrypted PDFs).
        hasText
          ? null
          : {
              inlineData: {
                mimeType: "application/pdf",
                data: attachment.dataBase64,
              },
            },
    };
  }

  const buffer = bufferFromBase64(attachment.dataBase64);
  let text = "";

  try {
    if (TEXT_PARSER_KINDS.has(kind)) {
      text = await extractViaParsers(buffer, name, mimeType);
    } else if (kind === "zip") {
      text = await extractZip(buffer);
    } else {
      text = buffer.toString("utf8").trim();
    }
  } catch (err) {
    text = `[Could not parse “${name}”: ${err.message}]`;
  }

  return {
    kind,
    name,
    mimeType,
    text: truncate(text),
    inlinePart: null,
  };
}

/**
 * Build Gemini content parts + persistence-safe attachment metadata for one message.
 */
export async function buildMessageParts(message) {
  const text = typeof message.content === "string" ? message.content : "";
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];

  if (!attachments.length) {
    return {
      parts: [{ text: text || " " }],
      persistedAttachments: [],
    };
  }

  const parts = [];
  const documentBlocks = [];
  const persistedAttachments = [];
  let imageCount = 0;
  let hasDocumentText = false;

  for (const att of attachments) {
    const parsed = await parseAttachment(att);

    // Persist extracted text for documents so later turns / file_reader can reuse it.
    // Images keep the smaller OCR-facing cap.
    let persistedExtracted;
    if (parsed.kind === "image") {
      persistedExtracted = parsed.text
        ? truncate(parsed.text, MAX_IMAGE_CONTEXT_CHARS)
        : undefined;
      if (persistedExtracted) {
        persistedExtracted = toUserFacingImageText(persistedExtracted) || undefined;
      }
    } else if (parsed.text) {
      persistedExtracted = truncate(parsed.text, MAX_DOC_PERSIST_CHARS);
    }

    persistedAttachments.push({
      id: att.fileId || att.id,
      fileId: att.fileId || (typeof att.id === "string" ? att.id : undefined),
      name: parsed.name,
      mimeType: parsed.mimeType,
      size: att.size || 0,
      kind: parsed.kind,
      extractedText: persistedExtracted,
      imageMetadata: parsed.imageMetadata || undefined,
    });

    if (parsed.kind === "image") {
      if (parsed.inlinePart) parts.push(parsed.inlinePart);
      imageCount += 1;
      const block = parsed.text
        ? `[Image ${imageCount}: ${parsed.name}]\n${parsed.text}`
        : `[Image ${imageCount}: ${parsed.name}]`;
      documentBlocks.push(block);
      continue;
    }

    if (parsed.text) {
      const formatted = formatDocumentForPrompt(parsed.name, parsed.kind, parsed.text);
      documentBlocks.push(formatted.promptBlock);
      hasDocumentText = true;
      // Keep inline PDF only when we deliberately returned it (weak extraction).
      if (parsed.inlinePart) parts.push(parsed.inlinePart);
    } else if (parsed.inlinePart) {
      parts.push(parsed.inlinePart);
      documentBlocks.push(
        `[Attached ${parsed.kind}: ${parsed.name} — binary attached; text extraction unavailable]`
      );
    }
  }

  let promptText = [text, ...documentBlocks].filter(Boolean).join("\n\n").trim();
  if (!promptText) {
    promptText =
      imageCount > 0
        ? imageCount === 1
          ? "Analyze this image in detail. Identify the type of content (chart, document, screenshot, handwriting, math, receipt, photo, etc.) and provide the most useful insights. Use the OCR text and metadata when present."
          : `Analyze these ${imageCount} images in detail. Refer to them as Image 1, Image 2, etc. Identify content types and provide the most useful insights. Use the OCR text and metadata when present.`
        : "Please analyze the attached file(s).";
  } else if (hasDocumentText && isWholePaperSolveCommand(text)) {
    promptText = `${promptText}\n\n${WHOLE_PAPER_SOLVE_HINT}`;
  } else if (hasDocumentText && isReferentialDocumentCommand(text)) {
    // Short commands like "solve this" / "pura paper solve kro" must operate on
    // the extracted attachment text above — not ask the user to restate questions.
    promptText = `${promptText}\n\n${REFERENTIAL_DOCUMENT_HINT}`;
  }

  // Gemini requires at least one part; put text first so the model sees the ask before binaries.
  parts.unshift({ text: promptText });

  return { parts, persistedAttachments };
}

const REFERENTIAL_DOCUMENT_HINT =
  `[System: The user is referring to the attached document text above. ` +
  `Read and use that extracted content to fulfill the request. ` +
  `Do not ask which file or which question. If this is an exam/paper with multiple questions, ` +
  `solve them sequentially in this response until done (or until the user named a specific question). ` +
  `Never say you can only solve one question at a time.]`;

const WHOLE_PAPER_SOLVE_HINT =
  `[System: The user wants the ENTIRE uploaded exam/paper solved. ` +
  `Acknowledge briefly (e.g. "I'll solve the paper sequentially. Starting with Question 1...") ` +
  `then answer EVERY question in order in one continuous streamed response. ` +
  `If earlier turns already answered some questions, skip those and continue from the next unanswered one. ` +
  `Keep using the uploaded document as context. If the document was chunked, call file_reader for remaining offsets and keep going. ` +
  `FORBIDDEN replies: "I can only solve one question", "Please specify a question", "I cannot solve the whole paper", or equivalents.]`;

/** Short referential asks that imply "use the attached document". */
export function isReferentialDocumentCommand(content = "") {
  const t = String(content || "").trim().toLowerCase();
  if (!t) return true;
  if (t.length > 180) return false;
  return (
    /\b(solve|read|summarize|analyse|analyze|translate|explain|review|check|complete|attempt)\b/.test(
      t
    ) ||
    /\b(isko|is[eé]|yeh|yah|pura|poora|paper|document|pdf|file)\b/.test(t) ||
    /^(this|that|it)[\s.!?]*$/i.test(t) ||
    /\b(do this|help with this|look at this|go through this)\b/.test(t)
  );
}

/** User wants the full exam/paper solved — never refuse or gate to one question. */
export function isWholePaperSolveCommand(content = "") {
  const t = String(content || "").trim().toLowerCase();
  if (!t || t.length > 280) return false;

  const wantsAll =
    /\b(whole|entire|full|complete|all|everything|remaining|rest)\b/.test(t) ||
    /\b(pura|poora|saara|saare|sabhi|sab)\b/.test(t) ||
    /\ball\s+correct\s+options?\b/.test(t) ||
    /\bevery\s+question\b/.test(t);

  const examish =
    /\b(paper|exam|test|quiz|worksheet|assignment|questions?|mcq|options?)\b/.test(
      t
    ) || /\b(solve|complete|attempt|answer|finish)\b/.test(t);

  if (wantsAll && examish) return true;

  // Compact phrases: "solve everything", "complete this exam", "pura paper solve kro"
  return (
    /\b(solve|complete|finish|attempt)\b[\s\S]{0,40}\b(everything|all|whole|entire|paper|exam)\b/.test(
      t
    ) ||
    /\b(pura|poora)\s+(paper|exam|test)\b/.test(t) ||
    /\bgive\s+all\s+correct\s+options?\b/.test(t)
  );
}

function conversationHasDocumentContext(contents = []) {
  return contents.some((c) =>
    (c.parts || []).some((p) => {
      const text = typeof p.text === "string" ? p.text : "";
      return (
        text.includes("--- File:") ||
        /\[Attached (?:pdf|docx|xlsx|csv|text|markdown)/i.test(text)
      );
    })
  );
}

function appendHintToUserParts(parts, hint) {
  if (!Array.isArray(parts) || !parts.length) {
    return [{ text: hint }];
  }
  const next = parts.map((p) => ({ ...p }));
  const textIdx = next.findIndex((p) => typeof p.text === "string");
  if (textIdx >= 0) {
    const existing = next[textIdx].text || "";
    if (existing.includes("[System: The user wants the ENTIRE")) return next;
    next[textIdx] = {
      ...next[textIdx],
      text: `${existing}\n\n${hint}`.trim(),
    };
    return next;
  }
  next.unshift({ text: hint });
  return next;
}

export async function messagesToGeminiContents(messages) {
  const contents = [];
  const persistedMessages = [];

  for (const message of messages) {
    const role = message.role === "assistant" ? "model" : "user";
    const { parts, persistedAttachments } = await buildMessageParts(message);

    contents.push({ role, parts });

    persistedMessages.push({
      role: message.role,
      content:
        typeof message.content === "string" && message.content.trim()
          ? message.content
          : persistedAttachments.length
            ? `[Attached ${persistedAttachments.map((a) => a.name).join(", ")}]`
            : "",
      attachments: persistedAttachments,
    });
  }

  // Follow-up turns: "solve the whole paper" with no new attachment still must
  // continue against prior uploaded/parsed document context — never refuse.
  const last = messages[messages.length - 1];
  if (
    last?.role === "user" &&
    isWholePaperSolveCommand(last.content) &&
    conversationHasDocumentContext(contents)
  ) {
    const lastContent = contents[contents.length - 1];
    if (lastContent?.role === "user") {
      lastContent.parts = appendHintToUserParts(
        lastContent.parts,
        WHOLE_PAPER_SOLVE_HINT
      );
    }
  }

  return { contents, persistedMessages };
}
