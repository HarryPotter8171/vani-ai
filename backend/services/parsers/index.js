import * as pdf from "./pdf.js";
import * as docx from "./docx.js";
import * as txt from "./txt.js";
import * as markdown from "./markdown.js";
import * as csv from "./csv.js";
import * as xlsx from "./xlsx.js";
import {
  UnsupportedFormatError,
  ParseFailedError,
  getExtension,
  normalizePlainText,
} from "./shared.js";

/**
 * Modular document parsers — plain-text extraction only.
 * No chunking, embeddings, or RAG live here.
 */

const PARSERS = Object.freeze([pdf, docx, txt, markdown, csv, xlsx]);

const BY_FORMAT = Object.freeze(
  Object.fromEntries(PARSERS.map((parser) => [parser.format, parser]))
);

const EXT_TO_FORMAT = (() => {
  const map = new Map();
  for (const parser of PARSERS) {
    for (const ext of parser.extensions) map.set(ext, parser.format);
  }
  return map;
})();

const MIME_TO_FORMAT = (() => {
  const map = new Map();
  for (const parser of PARSERS) {
    for (const mime of parser.mimeTypes) {
      // First registered format wins for ambiguous MIMEs (e.g. text/plain → txt).
      if (!map.has(mime)) map.set(mime, parser.format);
    }
  }
  return map;
})();

export const SUPPORTED_FORMATS = Object.freeze(PARSERS.map((p) => p.format));

export { UnsupportedFormatError, ParseFailedError, normalizePlainText };

/**
 * Resolve a parser format from filename extension and/or MIME type.
 * Extension wins when both are present (more reliable than browser MIME guesses).
 */
export function detectFormat({ filename = "", mimeType = "" } = {}) {
  const ext = getExtension(filename);
  if (ext && EXT_TO_FORMAT.has(ext)) return EXT_TO_FORMAT.get(ext);

  const mime = String(mimeType || "").toLowerCase().trim();
  if (mime && MIME_TO_FORMAT.has(mime)) return MIME_TO_FORMAT.get(mime);

  return null;
}

export function getParser(format) {
  return BY_FORMAT[format] || null;
}

/**
 * Parse a file buffer into plain text.
 *
 * @param {Buffer} buffer
 * @param {{ filename?: string, mimeType?: string, format?: string }} [meta]
 * @returns {Promise<{ format: string, text: string }>}
 */
export async function parseBuffer(buffer, meta = {}) {
  if (!Buffer.isBuffer(buffer)) {
    throw new ParseFailedError("parseBuffer expects a Buffer.");
  }

  const format = meta.format || detectFormat(meta);
  if (!format) {
    throw new UnsupportedFormatError(
      `Unsupported file type for parsing${meta.filename ? `: ${meta.filename}` : "."}`
    );
  }

  const parser = getParser(format);
  if (!parser) {
    throw new UnsupportedFormatError(`No parser registered for format "${format}".`);
  }

  const { text } = await parser.parse(buffer);
  return { format, text: normalizePlainText(text) };
}
