import { ParseFailedError, normalizePlainText } from "./shared.js";

export const format = "csv";
export const extensions = [".csv"];
export const mimeTypes = ["text/csv", "application/csv", "text/plain"];

/** Decode CSV as UTF-8 plain text (rows preserved, no schema inference). */
export async function parse(buffer) {
  try {
    let text = buffer.toString("utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    return { text: normalizePlainText(text) };
  } catch (err) {
    throw new ParseFailedError(`Failed to parse CSV: ${err.message}`, err);
  }
}
