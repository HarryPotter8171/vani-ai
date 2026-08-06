/**
 * Production OCR module — images (JPG/JPEG/PNG/WEBP) + PDF.
 * Powers the model-callable `ocr` tool.
 */

export {
  OCR_SUPPORTED_EXTENSIONS,
  OCR_SUPPORTED_MIMES,
  OCR_TOOL_LANG,
  OCR_TOOL_PDF_MAX_PAGES,
  OCR_TOOL_PDF_SCALE,
  OCR_TOOL_MAX_CHARS,
} from "./config.js";

export {
  extractTablesFromBlocks,
  collectWordsFromBlocks,
  clusterRows,
  matrixToMarkdown,
} from "./tables.js";

export {
  runOcr,
  isOcrSupported,
  OcrError,
  UnsupportedOcrInputError,
} from "./runOcr.js";
