/**
 * Shared helpers for document parsers.
 * Parsers only extract plain text — no chunking, embeddings, or RAG.
 */

export class UnsupportedFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnsupportedFormatError";
    this.code = "UNSUPPORTED_FORMAT";
  }
}

export class ParseFailedError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "ParseFailedError";
    this.code = "PARSE_FAILED";
    this.cause = cause;
  }
}

/** Collapse excessive blank lines and trim edges. */
export function normalizePlainText(text = "") {
  return String(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function getExtension(filename = "") {
  const i = String(filename).lastIndexOf(".");
  return i >= 0 ? String(filename).slice(i).toLowerCase() : "";
}
