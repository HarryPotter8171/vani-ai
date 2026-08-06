import { capabilitiesFor } from "./detect.js";
import { MAX_EXTRACTED_CHARS } from "./config.js";
import { normalizePlainText } from "../parsers/shared.js";

function truncateText(text, limit = MAX_EXTRACTED_CHARS) {
  const normalized = normalizePlainText(text || "");
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit)}\n\n[Truncated — exceeded ${limit} characters]`;
}

/**
 * Build the stable structured JSON contract for document understanding.
 * Designed so Vision / RAG / Agents / Deep Research can consume the same shape.
 */
export function buildUnderstandingResult({
  id,
  filename,
  mimeType,
  size,
  detection,
  extractionMethod,
  text,
  pages,
  sheets,
  ocr,
  metadata,
  warnings = [],
  pageCount = null,
}) {
  const extractedText = truncateText(text);
  const charCount = extractedText.length;
  const hasText = charCount > 0;

  return {
    id,
    filename,
    mimeType,
    size: typeof size === "number" ? size : undefined,
    documentType: detection.documentType,
    format: detection.format,
    category: detection.category,
    extension: detection.extension,
    extractionMethod,
    pageCount: pageCount ?? (Array.isArray(pages) ? pages.length : null),
    charCount,
    language: ocr?.language || (hasText ? "eng" : null),
    text: extractedText,
    structured: {
      pages: Array.isArray(pages) ? pages : undefined,
      sheets: Array.isArray(sheets) ? sheets : undefined,
    },
    ocr: ocr
      ? {
          used: Boolean(ocr.used),
          confidence:
            typeof ocr.confidence === "number"
              ? Math.round(ocr.confidence * 10) / 10
              : null,
          pagesProcessed: ocr.pagesProcessed ?? null,
          language: ocr.language || "eng",
        }
      : { used: false, confidence: null, pagesProcessed: null, language: null },
    metadata: metadata || undefined,
    warnings: warnings.length ? warnings : [],
    capabilities: capabilitiesFor(detection.category, { hasText }),
    analyzedAt: new Date().toISOString(),
  };
}
