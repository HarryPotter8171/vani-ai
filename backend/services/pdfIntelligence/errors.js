/**
 * Typed errors for the PDF Intelligence pipeline.
 * Controllers map `code` → HTTP status without string matching.
 */

export class PdfIntelligenceError extends Error {
  constructor(message, code = "PDF_INTEL_FAILED", status = 422) {
    super(message);
    this.name = "PdfIntelligenceError";
    this.code = code;
    this.status = status;
  }
}

export class PasswordProtectedPdfError extends PdfIntelligenceError {
  constructor(message = "This PDF is password-protected. Please unlock it and upload again.") {
    super(message, "PDF_PASSWORD_PROTECTED", 422);
    this.name = "PasswordProtectedPdfError";
  }
}

export class CorruptedPdfError extends PdfIntelligenceError {
  constructor(message = "This PDF appears to be corrupted or unreadable. Please re-export and try again.") {
    super(message, "PDF_CORRUPTED", 422);
    this.name = "CorruptedPdfError";
  }
}

export class UnsupportedPdfError extends PdfIntelligenceError {
  constructor(message = "This file is not a supported PDF.") {
    super(message, "PDF_UNSUPPORTED", 415);
    this.name = "UnsupportedPdfError";
  }
}

export class HugePdfError extends PdfIntelligenceError {
  constructor(pageCount, maxPages) {
    super(
      `This PDF has ${pageCount} pages. VANI supports up to ${maxPages} pages. Please split the document and try again.`,
      "PDF_TOO_LARGE",
      422
    );
    this.name = "HugePdfError";
    this.pageCount = pageCount;
    this.maxPages = maxPages;
  }
}

/**
 * Map raw pdf.js / pdf-parse failures to friendly typed errors.
 */
export function mapPdfParseError(err, filename = "document") {
  const msg = String(err?.message || err || "");
  const name = String(err?.name || "");
  const lower = msg.toLowerCase();

  if (
    name === "PasswordException" ||
    lower.includes("password") ||
    lower.includes("encrypted") ||
    lower.includes("need to be decrypted")
  ) {
    return new PasswordProtectedPdfError();
  }

  if (
    name === "InvalidPDFException" ||
    lower.includes("invalid pdf") ||
    lower.includes("corrupted") ||
    lower.includes("empty") ||
    lower.includes("missing pdf header") ||
    lower.includes("bad xref")
  ) {
    return new CorruptedPdfError(
      `“${filename}” appears to be corrupted or unreadable. Please re-export the PDF and try again.`
    );
  }

  if (err instanceof PdfIntelligenceError) return err;

  return new PdfIntelligenceError(
    `Unable to analyze “${filename}”: ${msg}`,
    "PDF_INTEL_FAILED",
    422
  );
}
