import * as XLSX from "xlsx";
import { ParseFailedError, normalizePlainText } from "./shared.js";

export const format = "xlsx";
export const extensions = [".xlsx", ".xls"];
export const mimeTypes = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];

/**
 * Flatten every sheet to CSV-like plain text, labeled by sheet name.
 */
export async function parse(buffer) {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sections = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      if (csv.trim()) {
        sections.push(`### Sheet: ${sheetName}\n${csv.trim()}`);
      }
    }

    return { text: normalizePlainText(sections.join("\n\n")) };
  } catch (err) {
    throw new ParseFailedError(`Failed to parse spreadsheet: ${err.message}`, err);
  }
}
