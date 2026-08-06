/**
 * Vision OCR facade — wraps the shared Tesseract pipeline used by
 * document understanding and chat multimodal context.
 */
export {
  extractOcrText,
  shutdownOcrWorker,
} from "../image/ocr.js";

export {
  OCR_LANG,
  OCR_MAX_CHARS,
  OCR_MAX_EDGE,
} from "../image/shared.js";
