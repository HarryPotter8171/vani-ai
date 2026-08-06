import { PDFParse } from "pdf-parse";
import { parse as parsePdfText } from "../../parsers/pdf.js";
import { normalizePlainText } from "../../parsers/shared.js";
import {
  PDF_SCAN_MIN_CHARS,
  PDF_SCAN_MIN_CHARS_PER_PAGE,
} from "../config.js";
import { ocrPdfPages } from "../ocr/pdfPages.js";
import { DocumentUnderstandingError } from "../errors.js";

async function getPdfPageCount(buffer) {
  let parser;
  try {
    parser = new PDFParse({ data: buffer });
    const info = await parser.getInfo();
    return Number(info?.total || info?.pages?.length || 0) || null;
  } catch {
    return null;
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

function needsOcr(text, pageCount) {
  const normalized = (text || "").trim();
  if (!normalized) return true;

  // Count real content — ignore whitespace-only / punctuation-only layers.
  const alnum = (normalized.match(/[A-Za-z0-9\u00C0-\u024F]/g) || []).length;
  if (alnum === 0) return true;

  // Short but real text layers (e.g. one-line PDFs) should not force OCR.
  if (alnum >= PDF_SCAN_MIN_CHARS) return false;

  if (pageCount && pageCount > 1) {
    return alnum / pageCount < PDF_SCAN_MIN_CHARS_PER_PAGE;
  }

  // Single-page with tiny alphanumeric yield — likely a scan with garbage text.
  return alnum < 8;
}

/**
 * Understand a PDF: extract selectable text; fall back to page OCR when
 * the document looks scanned / image-only.
 */
export async function understandPdf(buffer, { filename = "" } = {}) {
  const warnings = [];
  let textResult;
  try {
    textResult = await parsePdfText(buffer);
  } catch (err) {
    throw new DocumentUnderstandingError(
      `Failed to read PDF “${filename || "document"}”: ${err.message}`,
      err
    );
  }

  const textLayer = normalizePlainText(textResult?.text || "");
  const pageCount = await getPdfPageCount(buffer);

  if (!needsOcr(textLayer, pageCount)) {
    return {
      extractionMethod: "text",
      text: textLayer,
      pageCount,
      pages: pageCount
        ? undefined // page-level split not available from text layer alone
        : undefined,
      ocr: { used: false, confidence: null, pagesProcessed: 0, language: null },
      metadata: {
        source: "pdf-text-layer",
        pageCount,
      },
      warnings,
    };
  }

  warnings.push(
    textLayer
      ? "Low selectable text density — ran OCR for scanned pages."
      : "No selectable text found — ran OCR for scanned pages."
  );

  try {
    const ocr = await ocrPdfPages(buffer);
    // Prefer OCR when the text layer is empty; otherwise merge (OCR wins for scanned).
    const text = ocr.text || textLayer;
    if (ocr.truncated) {
      warnings.push(
        `OCR processed the first ${ocr.pagesProcessed} of ${ocr.pageCount} pages.`
      );
    }

    return {
      extractionMethod: textLayer && ocr.text ? "text+ocr" : "ocr",
      text,
      pageCount: ocr.pageCount || pageCount,
      pages: ocr.pages,
      ocr: {
        used: true,
        confidence: ocr.confidence,
        pagesProcessed: ocr.pagesProcessed,
        language: ocr.language,
      },
      metadata: {
        source: "pdf-ocr",
        pageCount: ocr.pageCount || pageCount,
        textLayerChars: textLayer.length,
      },
      warnings,
    };
  } catch (err) {
    // Soft-fail: return whatever text layer we have rather than hard-failing.
    if (textLayer) {
      warnings.push(`OCR unavailable: ${err.message}`);
      return {
        extractionMethod: "text",
        text: textLayer,
        pageCount,
        ocr: { used: false, confidence: null, pagesProcessed: 0, language: null },
        metadata: { source: "pdf-text-layer", pageCount },
        warnings,
      };
    }
    throw err;
  }
}
