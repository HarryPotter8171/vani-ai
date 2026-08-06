/**
 * Errors for the document understanding pipeline.
 * Distinct codes so controllers can map to HTTP status without string matching.
 */

export class UnsupportedDocumentError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnsupportedDocumentError";
    this.code = "UNSUPPORTED_DOCUMENT";
  }
}

export class DocumentUnderstandingError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "DocumentUnderstandingError";
    this.code = "UNDERSTANDING_FAILED";
    this.cause = cause;
  }
}
