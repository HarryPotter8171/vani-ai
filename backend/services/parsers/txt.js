import { ParseFailedError, normalizePlainText } from "./shared.js";

export const format = "txt";
export const extensions = [".txt"];
export const mimeTypes = ["text/plain"];

/** Decode a UTF-8 (with BOM) plain-text buffer. */
export async function parse(buffer) {
  try {
    let text = buffer.toString("utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    return { text: normalizePlainText(text) };
  } catch (err) {
    throw new ParseFailedError(`Failed to parse TXT: ${err.message}`, err);
  }
}
