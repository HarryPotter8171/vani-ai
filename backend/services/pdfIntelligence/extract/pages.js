import { PDFParse } from "pdf-parse";
import { normalizePlainText } from "../../parsers/shared.js";
import { PDF_MAX_PAGES, PDF_WARN_PAGES, PDF_PAGE_MAX_CHARS } from "../config.js";
import {
  HugePdfError,
  UnsupportedPdfError,
  mapPdfParseError,
} from "../errors.js";
import {
  extractHeadings,
  extractTablesFromPages,
  extractForms,
  extractImageInventory,
  truncatePageText,
} from "./structure.js";

/**
 * Low-level PDF open + page extraction.
 * Never loads the full document text into a single string for 500-page docs —
 * pages are kept separate and only joined when a caller explicitly needs a sample.
 */
export async function openPdfParser(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new UnsupportedPdfError("Empty or invalid PDF buffer.");
  }
  // Quick magic-byte check
  const head = buffer.subarray(0, 5).toString("utf8");
  if (!head.startsWith("%PDF")) {
    throw new UnsupportedPdfError("File does not look like a PDF (missing %PDF header).");
  }
  return new PDFParse({ data: buffer });
}

/**
 * Extract per-page text, tables, forms, headings, images, and metadata.
 *
 * @param {Buffer} buffer
 * @param {{ filename?: string, onProgress?: (evt: object) => void }} [options]
 */
export async function extractPdfStructure(buffer, options = {}) {
  const { filename = "document.pdf", onProgress } = options;
  const emit = (stage, detail = {}) => {
    if (typeof onProgress === "function") {
      try {
        onProgress({ stage, ...detail });
      } catch {
        // never let progress callbacks break extraction
      }
    }
  };

  let parser;
  try {
    emit("reading", { message: "Reading PDF..." });
    parser = await openPdfParser(buffer);

    let info;
    try {
      info = await parser.getInfo({ parsePageInfo: true });
    } catch (err) {
      throw mapPdfParseError(err, filename);
    }

    const pageCount = Number(info?.total || info?.pages?.length || 0) || 0;
    if (pageCount > PDF_MAX_PAGES) {
      throw new HugePdfError(pageCount, PDF_MAX_PAGES);
    }

    const warnings = [];
    if (pageCount > PDF_WARN_PAGES) {
      warnings.push(
        `Large PDF (${pageCount} pages) — analysis may take longer.`
      );
    }

    const metaInfo = info?.info || {};
    if (metaInfo.IsAcroFormPresent) {
      warnings.push("PDF contains AcroForm fields — form values extracted from text layer.");
    }

    emit("extracting_text", {
      message: "Extracting text...",
      pageCount,
    });

    let textResult;
    try {
      textResult = await parser.getText();
    } catch (err) {
      throw mapPdfParseError(err, filename);
    }

    const pages = (textResult?.pages || []).map((p) => ({
      page: p.num ?? p.pageNumber ?? p.page,
      text: truncatePageText(p.text || "", PDF_PAGE_MAX_CHARS),
      charCount: normalizePlainText(p.text || "").length,
    }));

    // Ensure page numbers are sequential even if parser omits empties
    if (pageCount > 0 && pages.length === 0) {
      for (let i = 1; i <= pageCount; i += 1) {
        pages.push({ page: i, text: "", charCount: 0 });
      }
    }

    emit("extracting_tables", { message: "Extracting tables..." });

    let nativeTables = [];
    try {
      const tableResult = await parser.getTable();
      nativeTables = (tableResult?.pages || []).map((p) => ({
        page: p.num ?? p.pageNumber,
        tables: p.tables || [],
      }));
    } catch {
      // native table extraction is best-effort
    }

    const tables = extractTablesFromPages(pages, nativeTables);

    emit("extracting_structure", { message: "Detecting headings and forms..." });
    const headings = extractHeadings(pages);
    const forms = extractForms(pages);

    emit("extracting_images", { message: "Cataloging images..." });
    let images = [];
    try {
      const imageResult = await parser.getImage({ imageBuffer: false });
      images = extractImageInventory(imageResult);
    } catch {
      // optional
    }

    const totalChars = pages.reduce((sum, p) => sum + (p.charCount || 0), 0);
    // Sample text for classification — first ~3 pages + last page (not whole doc).
    const samplePages = [
      ...pages.slice(0, 3),
      ...(pages.length > 3 ? [pages[pages.length - 1]] : []),
    ];
    const sampleText = samplePages.map((p) => p.text).join("\n\n");

    return {
      pageCount: pageCount || pages.length,
      pages,
      tables,
      headings,
      forms,
      images,
      sampleText,
      totalChars,
      metadata: {
        title: metaInfo.Title || null,
        author: metaInfo.Author || null,
        creator: metaInfo.Creator || null,
        producer: metaInfo.Producer || null,
        creationDate: metaInfo.CreationDate || null,
        pdfVersion: metaInfo.PDFFormatVersion || null,
        encrypted: Boolean(metaInfo.EncryptFilterName),
        hasAcroForm: Boolean(metaInfo.IsAcroFormPresent),
        hasXFA: Boolean(metaInfo.IsXFAPresent),
        pageSizes: (info?.pages || []).map((p) => ({
          page: p.pageNumber,
          width: p.width,
          height: p.height,
        })),
      },
      warnings,
    };
  } catch (err) {
    throw mapPdfParseError(err, filename);
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
