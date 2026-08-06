import { detectFormat } from "../parsers/index.js";
import { isSupportedImage } from "../image/index.js";
import { getExtension } from "../parsers/shared.js";

/**
 * Document type taxonomy for understanding + future Vision / RAG / Agents.
 * `format` is the parser/OCR format; `category` is the product-level bucket.
 */

const CATEGORY_BY_FORMAT = Object.freeze({
  pdf: "document",
  docx: "document",
  txt: "text",
  markdown: "text",
  csv: "spreadsheet",
  xlsx: "spreadsheet",
  image: "image",
});

const IMAGE_FORMATS = Object.freeze([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "heic",
  "heif",
  "bmp",
]);

/**
 * Detect document type from filename + MIME.
 * Returns null when the file cannot be understood by this service.
 *
 * @returns {{
 *   documentType: string,
 *   format: string,
 *   category: string,
 *   extension: string
 * } | null}
 */
export function detectDocumentType({ filename = "", mimeType = "" } = {}) {
  const extension = getExtension(filename);

  if (isSupportedImage({ filename, mimeType })) {
    const ext = extension.replace(/^\./, "") || "image";
    const format = IMAGE_FORMATS.includes(ext) ? ext : "image";
    return {
      documentType: "image",
      format,
      category: "image",
      extension,
    };
  }

  const format = detectFormat({ filename, mimeType });
  if (!format) return null;

  return {
    documentType: format,
    format,
    category: CATEGORY_BY_FORMAT[format] || "document",
    extension,
  };
}

export function isSupportedDocumentType(meta) {
  return detectDocumentType(meta) != null;
}

/** Capability flags for future Vision / RAG / Agents / Deep Research consumers. */
export function capabilitiesFor(category, { hasText = false } = {}) {
  return {
    vision: category === "image" || category === "document",
    rag: hasText,
    agents: hasText,
    deepResearch: hasText,
  };
}
