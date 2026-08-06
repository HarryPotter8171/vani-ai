import { parseBuffer } from "../../parsers/index.js";
import { DocumentUnderstandingError } from "../errors.js";

/**
 * Plain-text extractors for DOCX / TXT / MD / CSV / XLSX.
 * Sheet labels for spreadsheets are already embedded by the xlsx parser.
 */
export async function understandTextDocument(
  buffer,
  { filename = "", mimeType = "", format } = {}
) {
  try {
    const { text, format: resolvedFormat } = await parseBuffer(buffer, {
      filename,
      mimeType,
      format,
    });

    const sheets =
      resolvedFormat === "xlsx" || resolvedFormat === "csv"
        ? extractSheetSections(text, resolvedFormat)
        : undefined;

    return {
      extractionMethod: "text",
      text,
      sheets,
      pageCount: null,
      ocr: { used: false, confidence: null, pagesProcessed: 0, language: null },
      metadata: {
        source: `${resolvedFormat}-parser`,
        format: resolvedFormat,
      },
      warnings: text ? [] : ["Document appears to be empty."],
    };
  } catch (err) {
    if (err.code === "UNSUPPORTED_FORMAT" || err.code === "PARSE_FAILED") {
      throw err;
    }
    throw new DocumentUnderstandingError(
      `Failed to extract text from “${filename || "document"}”: ${err.message}`,
      err
    );
  }
}

/** Best-effort sheet split from labeled xlsx/csv text for structured JSON. */
function extractSheetSections(text, format) {
  if (format === "csv") {
    return [{ name: "Sheet1", text: text || "" }];
  }

  if (!text) return [];

  const sections = text.split(/^### Sheet: (.+)$/m);
  if (sections.length < 3) {
    return [{ name: "Workbook", text }];
  }

  const sheets = [];
  for (let i = 1; i < sections.length; i += 2) {
    const name = (sections[i] || "").trim() || `Sheet${sheets.length + 1}`;
    const body = (sections[i + 1] || "").trim();
    sheets.push({ name, text: body });
  }
  return sheets;
}
