import { PDFParse } from "pdf-parse";
import { ParseFailedError, normalizePlainText } from "./shared.js";

export const format = "pdf";
export const extensions = [".pdf"];
export const mimeTypes = ["application/pdf"];

/**
 * Extract selectable text from a PDF buffer.
 * Scanned/image-only PDFs may return an empty string.
 */
export async function parse(buffer) {
  let parser;
  try {
    parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    // pdf-parse appends page markers like "-- 1 of 3 --"; strip them for plain text.
    const raw = String(result?.text || "").replace(/^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/gm, "");
    return { text: normalizePlainText(raw) };
  } catch (err) {
    throw new ParseFailedError(`Failed to parse PDF: ${err.message}`, err);
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
