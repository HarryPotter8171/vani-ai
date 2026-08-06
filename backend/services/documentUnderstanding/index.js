import fs from "fs/promises";
import { resolveUploadedFile } from "../fileService.js";
import {
  UnsupportedFormatError,
  ParseFailedError,
} from "../parsers/index.js";
import { detectDocumentType } from "./detect.js";
import { buildUnderstandingResult } from "./schema.js";
import {
  readUnderstandingCache,
  writeUnderstandingCache,
} from "./cache.js";
import { understandPdf } from "./extractors/pdf.js";
import { understandImage } from "./extractors/image.js";
import { understandTextDocument } from "./extractors/document.js";
import {
  UnsupportedDocumentError,
  DocumentUnderstandingError,
} from "./errors.js";

export {
  UnsupportedDocumentError,
  DocumentUnderstandingError,
} from "./errors.js";
export { detectDocumentType, isSupportedDocumentType } from "./detect.js";

/**
 * Production document understanding entrypoint.
 *
 * Reads an uploaded file by id, detects type, extracts text (OCR when needed),
 * and returns structured JSON. Results are cached beside the upload for
 * Vision / RAG / Agents / Deep Research reuse.
 *
 * Does not touch chat endpoints.
 *
 * @param {string} id - Upload UUID from POST /api/files/upload
 * @param {{ force?: boolean }} [options] - force=true bypasses cache
 */
export async function understandUploadedDocument(id, options = {}) {
  const force = Boolean(options.force);

  if (!force) {
    const cached = await readUnderstandingCache(id);
    if (cached?.id === id && typeof cached.text === "string") {
      return { ...cached, cached: true };
    }
  }

  const file = await resolveUploadedFile(id);
  const detection = detectDocumentType({
    filename: file.filename,
    mimeType: file.mimeType,
  });

  if (!detection) {
    throw new UnsupportedDocumentError(
      `Document understanding is not supported for “${file.filename}”. Supported: PDF, DOCX, TXT, CSV, XLSX, PNG, JPG, JPEG, WEBP.`
    );
  }

  const buffer = await fs.readFile(file.absolutePath);
  let extracted;

  try {
    if (detection.category === "image") {
      extracted = await understandImage(buffer, {
        filename: file.filename,
        mimeType: file.mimeType,
      });
    } else if (detection.format === "pdf") {
      extracted = await understandPdf(buffer, { filename: file.filename });
    } else {
      extracted = await understandTextDocument(buffer, {
        filename: file.filename,
        mimeType: file.mimeType,
        format: detection.format,
      });
    }
  } catch (err) {
    if (
      err instanceof UnsupportedDocumentError ||
      err instanceof DocumentUnderstandingError ||
      err instanceof UnsupportedFormatError ||
      err instanceof ParseFailedError
    ) {
      throw err;
    }
    throw new DocumentUnderstandingError(
      `Unable to analyze “${file.filename}”: ${err.message}`,
      err
    );
  }

  const result = buildUnderstandingResult({
    id: file.id,
    filename: file.filename,
    mimeType: file.mimeType,
    size: file.size,
    detection,
    extractionMethod: extracted.extractionMethod,
    text: extracted.text,
    pages: extracted.pages,
    sheets: extracted.sheets,
    ocr: extracted.ocr,
    metadata: extracted.metadata,
    warnings: extracted.warnings || [],
    pageCount: extracted.pageCount,
  });

  try {
    await writeUnderstandingCache(id, result);
  } catch (err) {
    console.error("documentUnderstanding cache write failed:", err.message);
  }

  return { ...result, cached: false };
}
