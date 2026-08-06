/**
 * Production OCR runner — images + PDF → unified API response.
 *
 * Response shape (always):
 * {
 *   success: true|false,
 *   text: string,
 *   pages: Array,
 *   language: string,
 *   metadata: object,
 *   error?: string,
 * }
 */

import { PDFParse } from "pdf-parse";
import { extractOcrText } from "../image/ocr.js";
import { normalizePlainText } from "../image/shared.js";
import {
  OCR_SUPPORTED_EXTENSIONS,
  OCR_SUPPORTED_MIMES,
  OCR_TOOL_LANG,
  OCR_TOOL_MAX_CHARS,
  OCR_TOOL_PDF_MAX_PAGES,
  OCR_TOOL_PDF_SCALE,
} from "./config.js";
import { extractTablesFromBlocks } from "./tables.js";

export class OcrError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "OcrError";
    this.code = "OCR_FAILED";
    this.cause = cause;
  }
}

export class UnsupportedOcrInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnsupportedOcrInputError";
    this.code = "UNSUPPORTED_OCR_INPUT";
  }
}

function getExtension(filename = "") {
  const i = String(filename).lastIndexOf(".");
  return i >= 0 ? String(filename).slice(i).toLowerCase() : "";
}

function normalizeMime(mimeType = "") {
  const mime = String(mimeType || "").toLowerCase().trim();
  if (mime === "image/jpg") return "image/jpeg";
  return mime;
}

export function isOcrSupported({ filename = "", mimeType = "" } = {}) {
  const ext = getExtension(filename);
  if (OCR_SUPPORTED_EXTENSIONS.includes(ext)) return true;
  const mime = normalizeMime(mimeType);
  return OCR_SUPPORTED_MIMES.includes(mime);
}

function isPdf({ filename = "", mimeType = "" } = {}) {
  const ext = getExtension(filename);
  const mime = normalizeMime(mimeType);
  return ext === ".pdf" || mime === "application/pdf";
}

function appendTablesToText(text, tablesMarkdown) {
  const base = normalizePlainText(text || "");
  const tables = normalizePlainText(tablesMarkdown || "");
  if (!tables) return base;
  if (!base) return tables;
  if (base.includes(tables)) return base;
  return `${base}\n\n## Detected tables\n\n${tables}`;
}

function truncateText(text, maxChars = OCR_TOOL_MAX_CHARS) {
  const t = normalizePlainText(text || "");
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars)}\n\n[OCR truncated — exceeded ${maxChars} characters]`;
}

/**
 * OCR a single image buffer (JPG/JPEG/PNG/WEBP).
 */
async function ocrImageBuffer(buffer, { language, filename, mimeType } = {}) {
  const result = await extractOcrText(buffer, {
    lang: language,
    includeBlocks: true,
    maxChars: OCR_TOOL_MAX_CHARS,
  });

  const tableInfo = extractTablesFromBlocks(result.blocks);
  const text = appendTablesToText(result.ocrText, tableInfo.markdown);

  return {
    success: true,
    text: truncateText(text),
    pages: [
      {
        page: 1,
        text: truncateText(result.ocrText),
        confidence: result.confidence,
        tables: tableInfo.tables,
        method: "ocr",
      },
    ],
    language: result.language || language,
    metadata: {
      source: "image",
      filename: filename || null,
      mimeType: normalizeMime(mimeType) || null,
      pageCount: 1,
      confidence: result.confidence,
      tableCount: tableInfo.tables.length,
      handwriting: "best-effort",
      scripts: ["latin", "devanagari"],
    },
  };
}

/**
 * OCR a PDF — render pages then run Tesseract (scanned + text PDFs).
 */
async function ocrPdfBuffer(buffer, { language, filename, maxPages, scale } = {}) {
  const pagesCap = maxPages ?? OCR_TOOL_PDF_MAX_PAGES;
  const renderScale = scale ?? OCR_TOOL_PDF_SCALE;

  let parser;
  try {
    parser = new PDFParse({ data: buffer });
    const info = await parser.getInfo();
    const totalPages = Number(info?.total || info?.pages?.length || 0) || 0;
    const pagesToProcess = Math.min(totalPages || pagesCap, pagesCap);

    if (pagesToProcess <= 0) {
      return {
        success: true,
        text: "",
        pages: [],
        language,
        metadata: {
          source: "pdf",
          filename: filename || null,
          mimeType: "application/pdf",
          pageCount: 0,
          pagesProcessed: 0,
          confidence: null,
          tableCount: 0,
          handwriting: "best-effort",
          scripts: ["latin", "devanagari"],
          warning: "PDF has no pages to OCR.",
        },
      };
    }

    const screenshot = await parser.getScreenshot({
      first: pagesToProcess,
      scale: renderScale,
      imageBuffer: true,
      imageDataUrl: false,
    });

    const pageResults = [];
    const confidences = [];
    const allTableMarkdown = [];
    let tableCount = 0;

    for (const page of screenshot.pages || []) {
      const pageBuffer = Buffer.isBuffer(page.data)
        ? page.data
        : Buffer.from(page.data);

      const { ocrText, confidence, blocks } = await extractOcrText(pageBuffer, {
        lang: language,
        includeBlocks: true,
        maxChars: OCR_TOOL_MAX_CHARS,
      });

      if (typeof confidence === "number") confidences.push(confidence);
      const tableInfo = extractTablesFromBlocks(blocks);
      if (tableInfo.markdown) allTableMarkdown.push(tableInfo.markdown);
      tableCount += tableInfo.tables.length;

      pageResults.push({
        page: page.pageNumber,
        text: ocrText,
        confidence:
          typeof confidence === "number"
            ? Math.round(confidence * 10) / 10
            : null,
        tables: tableInfo.tables,
        method: "ocr",
        width: page.width,
        height: page.height,
      });
    }

    const joined = normalizePlainText(
      pageResults.map((p) => p.text).filter(Boolean).join("\n\n")
    );
    const text = truncateText(
      appendTablesToText(joined, allTableMarkdown.join("\n\n"))
    );

    const avgConfidence =
      confidences.length > 0
        ? Math.round(
            (confidences.reduce((a, b) => a + b, 0) / confidences.length) * 10
          ) / 10
        : null;

    return {
      success: true,
      text,
      pages: pageResults,
      language,
      metadata: {
        source: "pdf",
        filename: filename || null,
        mimeType: "application/pdf",
        pageCount: totalPages || pageResults.length,
        pagesProcessed: pageResults.length,
        truncated: totalPages > pagesToProcess,
        confidence: avgConfidence,
        tableCount,
        handwriting: "best-effort",
        scripts: ["latin", "devanagari"],
      },
    };
  } catch (err) {
    throw new OcrError(`PDF OCR failed: ${err.message}`, err);
  } finally {
    if (parser) {
      try {
        await parser.destroy();
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Run production OCR on a buffer.
 *
 * @param {Buffer} buffer
 * @param {{
 *   filename?: string,
 *   mimeType?: string,
 *   language?: string,
 *   maxPages?: number,
 *   scale?: number,
 * }} [options]
 */
export async function runOcr(buffer, options = {}) {
  const filename = options.filename || "";
  const mimeType = options.mimeType || "";
  const language = String(options.language || OCR_TOOL_LANG).trim() || "eng+hin";

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return {
      success: false,
      text: "",
      pages: [],
      language,
      metadata: {},
      error: "OCR input buffer is empty.",
    };
  }

  if (!isOcrSupported({ filename, mimeType })) {
    return {
      success: false,
      text: "",
      pages: [],
      language,
      metadata: { filename: filename || null, mimeType: mimeType || null },
      error:
        "Unsupported OCR input. Supported: JPG, JPEG, PNG, WEBP, PDF.",
    };
  }

  try {
    if (isPdf({ filename, mimeType })) {
      return await ocrPdfBuffer(buffer, {
        language,
        filename,
        maxPages: options.maxPages,
        scale: options.scale,
      });
    }
    return await ocrImageBuffer(buffer, { language, filename, mimeType });
  } catch (err) {
    if (err instanceof UnsupportedOcrInputError) {
      return {
        success: false,
        text: "",
        pages: [],
        language,
        metadata: {},
        error: err.message,
      };
    }
    return {
      success: false,
      text: "",
      pages: [],
      language,
      metadata: {},
      error: err?.message || "OCR failed",
    };
  }
}
