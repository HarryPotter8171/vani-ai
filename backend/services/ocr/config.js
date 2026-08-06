/**
 * Production OCR tool configuration.
 * Env overrides keep latency / language knobs out of code.
 */

/** Formats accepted by the `ocr` tool (images + PDF). */
export const OCR_SUPPORTED_EXTENSIONS = Object.freeze([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".pdf",
]);

export const OCR_SUPPORTED_MIMES = Object.freeze([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

/** Default: English + Hindi for mixed Indic documents. */
export const OCR_TOOL_LANG =
  process.env.VANI_OCR_LANG || process.env.VANI_OCR_TOOL_LANG || "eng+hin";

/** Max PDF pages rendered for the ocr tool. */
export const OCR_TOOL_PDF_MAX_PAGES =
  Number(process.env.VANI_OCR_PDF_MAX_PAGES) ||
  Number(process.env.VANI_PDF_OCR_MAX_PAGES) ||
  15;

/** Render scale for PDF page screenshots. */
export const OCR_TOOL_PDF_SCALE =
  Number(process.env.VANI_OCR_PDF_SCALE) ||
  Number(process.env.VANI_PDF_OCR_SCALE) ||
  1.5;

/** Hard cap on returned OCR text. */
export const OCR_TOOL_MAX_CHARS =
  Number(process.env.VANI_OCR_MAX_CHARS) || 20_000;
