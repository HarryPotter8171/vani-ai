import { PDFParse } from "pdf-parse";
import { extractOcrText } from "../../image/ocr.js";
import { OCR_LANG } from "../../image/shared.js";
import { normalizePlainText } from "../../parsers/shared.js";
import {
  PDF_OCR_MAX_PAGES,
  PDF_OCR_SCALE,
} from "../config.js";
import { DocumentUnderstandingError } from "../errors.js";

/**
 * Render PDF pages to PNG via pdf-parse (pdfjs + @napi-rs/canvas),
 * then run Tesseract OCR. Used for scanned / image-only PDFs.
 *
 * @param {Buffer} buffer
 * @param {{ maxPages?: number, scale?: number }} [options]
 */
export async function ocrPdfPages(buffer, options = {}) {
  const maxPages = options.maxPages ?? PDF_OCR_MAX_PAGES;
  const scale = options.scale ?? PDF_OCR_SCALE;

  let parser;
  try {
    parser = new PDFParse({ data: buffer });
    const info = await parser.getInfo();
    const totalPages = Number(info?.total || info?.pages?.length || 0) || 0;
    const pagesToProcess = Math.min(totalPages || maxPages, maxPages);

    if (pagesToProcess <= 0) {
      return {
        text: "",
        pages: [],
        pageCount: 0,
        confidence: null,
        pagesProcessed: 0,
        language: OCR_LANG,
        truncated: false,
      };
    }

    const screenshot = await parser.getScreenshot({
      first: pagesToProcess,
      scale,
      imageBuffer: true,
      imageDataUrl: false,
    });

    const pageResults = [];
    const confidences = [];

    for (const page of screenshot.pages || []) {
      const pageBuffer = Buffer.isBuffer(page.data)
        ? page.data
        : Buffer.from(page.data);

      const { ocrText, confidence } = await extractOcrText(pageBuffer);
      if (typeof confidence === "number") confidences.push(confidence);

      pageResults.push({
        page: page.pageNumber,
        text: ocrText,
        method: "ocr",
        confidence:
          typeof confidence === "number"
            ? Math.round(confidence * 10) / 10
            : null,
        width: page.width,
        height: page.height,
      });
    }

    const text = normalizePlainText(
      pageResults.map((p) => p.text).filter(Boolean).join("\n\n")
    );

    const avgConfidence =
      confidences.length > 0
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length
        : null;

    return {
      text,
      pages: pageResults,
      pageCount: totalPages || pageResults.length,
      confidence: avgConfidence,
      pagesProcessed: pageResults.length,
      language: OCR_LANG,
      truncated: totalPages > pagesToProcess,
    };
  } catch (err) {
    throw new DocumentUnderstandingError(
      `PDF OCR failed: ${err.message}`,
      err
    );
  } finally {
    if (parser) {
      try {
        await parser.destroy();
      } catch {
        // ignore cleanup errors
      }
    }
  }
}
