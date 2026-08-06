import { processImage } from "../../image/index.js";
import { OCR_LANG } from "../../image/shared.js";
import { DocumentUnderstandingError } from "../errors.js";

/**
 * Understand an image via metadata + OCR.
 * Reuses the production image pipeline (sharp preprocess + Tesseract).
 */
export async function understandImage(buffer, { filename = "", mimeType = "" } = {}) {
  try {
    const processed = await processImage(buffer, { filename, mimeType });
    const ocrText = processed.ocrText || "";

    return {
      extractionMethod: "ocr",
      text: ocrText,
      pages: [
        {
          page: 1,
          text: ocrText,
          method: "ocr",
          confidence: processed.ocrConfidence,
        },
      ],
      pageCount: 1,
      ocr: {
        used: true,
        confidence: processed.ocrConfidence,
        pagesProcessed: 1,
        language: OCR_LANG,
      },
      metadata: processed.metadata,
      warnings: ocrText
        ? []
        : ["No readable text detected in this image."],
    };
  } catch (err) {
    throw new DocumentUnderstandingError(
      `Failed to analyze image “${filename || "image"}”: ${err.message}`,
      err
    );
  }
}
