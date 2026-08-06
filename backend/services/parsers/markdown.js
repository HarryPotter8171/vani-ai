import { ParseFailedError, normalizePlainText } from "./shared.js";

export const format = "markdown";
export const extensions = [".md", ".markdown"];
export const mimeTypes = ["text/markdown", "text/plain"];

/**
 * Return Markdown source as plain text (no HTML rendering).
 * Callers get the raw document content for downstream use.
 */
export async function parse(buffer) {
  try {
    let text = buffer.toString("utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    return { text: normalizePlainText(text) };
  } catch (err) {
    throw new ParseFailedError(`Failed to parse Markdown: ${err.message}`, err);
  }
}
