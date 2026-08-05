import AdmZip from "adm-zip";
import { parseBuffer } from "./parsers/index.js";
import { processImage, toUserFacingImageText } from "./image/index.js";
import { processImageForVision } from "./vision/imageProcessor.js";

const MAX_EXTRACTED_CHARS = 120_000;
const MAX_ZIP_ENTRIES = 40;
const MAX_ZIP_ENTRY_BYTES = 2 * 1024 * 1024;
/** Cap OCR/metadata text stored on chat attachments. */
const MAX_IMAGE_CONTEXT_CHARS = 20_000;

const IMAGE_KINDS = new Set(["image"]);
const INLINE_DOC_KINDS = new Set(["pdf"]); // Gemini natively understands PDFs
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

async function extractViaParsers(buffer, name, mimeType) {
  const { text } = await parseBuffer(buffer, { filename: name, mimeType });
  return text;
}

/**
 * Run OCR + metadata for a chat image attachment.
 * Failures are soft — the native image inlineData still reaches the model.
 */
async function processImageAttachment(buffer, name, mimeType, existing = {}) {
  // Prefer existing OCR from document understanding — skip duplicate Tesseract.
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
 * PDFs stay as inlineData only (Gemini document understanding).
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
        text: truncate(attachment.extractedText),
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

  if (INLINE_DOC_KINDS.has(kind)) {
    return {
      kind,
      name,
      mimeType: "application/pdf",
      text: null,
      inlinePart: {
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

  for (const att of attachments) {
    const parsed = await parseAttachment(att);

    // Persist OCR-only text for images — never expose Format/Dimensions
    // metadata blocks to the client. Full metadata still reaches the model
    // via documentBlocks below.
    let persistedExtracted = parsed.text
      ? truncate(parsed.text, MAX_IMAGE_CONTEXT_CHARS)
      : undefined;
    if (parsed.kind === "image" && persistedExtracted) {
      persistedExtracted = toUserFacingImageText(persistedExtracted) || undefined;
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

    if (parsed.inlinePart) {
      parts.push(parsed.inlinePart);
      if (parsed.kind === "image") {
        imageCount += 1;
        // Inject OCR + metadata into the text context the model reads.
        const block = parsed.text
          ? `[Image ${imageCount}: ${parsed.name}]\n${parsed.text}`
          : `[Image ${imageCount}: ${parsed.name}]`;
        documentBlocks.push(block);
      } else {
        documentBlocks.push(`[Attached ${parsed.kind}: ${parsed.name}]`);
      }
    } else if (parsed.text) {
      documentBlocks.push(`--- File: ${parsed.name} (${parsed.kind}) ---\n${parsed.text}`);
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
  }

  // Gemini requires at least one part; put text first so the model sees the ask before binaries.
  parts.unshift({ text: promptText });

  return { parts, persistedAttachments };
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

  return { contents, persistedMessages };
}
