/**
 * Tunables for document understanding.
 * Env overrides keep production knobs out of code.
 */

/** Below this many extracted chars, a PDF is treated as likely scanned. */
export const PDF_SCAN_MIN_CHARS =
  Number(process.env.VANI_PDF_SCAN_MIN_CHARS) || 40;

/** Average chars/page below this also triggers OCR fallback. */
export const PDF_SCAN_MIN_CHARS_PER_PAGE =
  Number(process.env.VANI_PDF_SCAN_MIN_CHARS_PER_PAGE) || 30;

/** Max PDF pages rendered for OCR (keeps latency bounded). */
export const PDF_OCR_MAX_PAGES =
  Number(process.env.VANI_PDF_OCR_MAX_PAGES) || 15;

/** Render scale for PDF page screenshots fed to OCR. */
export const PDF_OCR_SCALE = Number(process.env.VANI_PDF_OCR_SCALE) || 1.5;

/** Hard cap on returned / cached extracted text. */
export const MAX_EXTRACTED_CHARS =
  Number(process.env.VANI_DOC_MAX_CHARS) || 120_000;

/** Rate limit for POST /api/files/:id/understand */
export const UNDERSTAND_RATE_LIMIT_WINDOW_MS = 60_000;
export const UNDERSTAND_RATE_LIMIT_MAX = 30;
