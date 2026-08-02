import mammoth from "mammoth";
import * as XLSX from "xlsx";
import AdmZip from "adm-zip";

const MAX_EXTRACTED_CHARS = 120_000;
const MAX_ZIP_ENTRIES = 40;
const MAX_ZIP_ENTRY_BYTES = 2 * 1024 * 1024;

const IMAGE_KINDS = new Set(["image"]);
const INLINE_DOC_KINDS = new Set(["pdf"]); // Gemini natively understands PDFs

function normalizeImageMime(mimeType = "") {
  const mime = mimeType.toLowerCase();
  if (mime === "image/jpg") return "image/jpeg";
  if (mime === "image/jpeg" || mime === "image/png" || mime === "image/webp") return mime;
  if (mime.startsWith("image/")) return "image/jpeg";
  return mimeType || "image/jpeg";
}

function kindFromName(name = "", mimeType = "") {
  const lower = name.toLowerCase();
  const mime = (mimeType || "").toLowerCase();

  if (mime.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(lower)) return "image";
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

async function extractDocx(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return (result.value || "").trim();
}

function extractSpreadsheet(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sections = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (csv.trim()) {
      sections.push(`### Sheet: ${sheetName}\n${csv.trim()}`);
    }
  }

  return sections.join("\n\n");
}

function extractPlainText(buffer) {
  return buffer.toString("utf8").trim();
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
      if (kind === "docx") text = await extractDocx(data);
      else if (kind === "xlsx" || kind === "csv") {
        text = kind === "csv" ? extractPlainText(data) : extractSpreadsheet(data);
      } else if (kind === "text" || kind === "markdown" || kind === "unknown") {
        // Only attempt text decode for likely text-like unknowns with small size
        if (kind === "unknown" && !/\.(json|xml|html?|log|yml|yaml)$/i.test(entry.entryName)) {
          parts.push(`### ${entry.entryName}\n[Unsupported binary entry]`);
          continue;
        }
        text = extractPlainText(data);
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
 * Parse a non-vision attachment into plain text for model context.
 * Images and PDFs are returned as inlineData parts instead.
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
        inlinePart: null,
      };
    }
    return {
      kind,
      name,
      mimeType,
      text: `[Attached file “${name}” — content unavailable in this session]`,
      inlinePart: null,
    };
  }

  if (IMAGE_KINDS.has(kind) || INLINE_DOC_KINDS.has(kind)) {
    const inlineMime =
      kind === "pdf" ? "application/pdf" : normalizeImageMime(mimeType);
    return {
      kind,
      name,
      mimeType: inlineMime,
      text: null,
      inlinePart: {
        inlineData: {
          mimeType: inlineMime,
          data: attachment.dataBase64,
        },
      },
    };
  }

  const buffer = bufferFromBase64(attachment.dataBase64);
  let text = "";

  try {
    if (kind === "docx") text = await extractDocx(buffer);
    else if (kind === "xlsx") text = extractSpreadsheet(buffer);
    else if (kind === "csv" || kind === "text" || kind === "markdown") {
      text = extractPlainText(buffer);
    } else if (kind === "zip") text = await extractZip(buffer);
    else text = extractPlainText(buffer);
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

    persistedAttachments.push({
      id: att.id,
      name: parsed.name,
      mimeType: parsed.mimeType,
      size: att.size || 0,
      kind: parsed.kind,
      extractedText: parsed.text ? truncate(parsed.text, 20_000) : undefined,
    });

    if (parsed.inlinePart) {
      parts.push(parsed.inlinePart);
      if (parsed.kind === "image") {
        imageCount += 1;
        documentBlocks.push(`[Image ${imageCount}: ${parsed.name}]`);
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
          ? "Analyze this image in detail. Identify the type of content (chart, document, screenshot, handwriting, math, receipt, photo, etc.) and provide the most useful insights."
          : `Analyze these ${imageCount} images in detail. Refer to them as Image 1, Image 2, etc. Identify content types and provide the most useful insights.`
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
