/**
 * Vision module public surface.
 * Requested as visionService.ts / imageProcessor.ts / ocrService.ts —
 * implemented as ESM .js to match the Express backend (no TS build step).
 */
export {
  analyzeImageBuffer,
  analyzeUploadedImage,
  analyzeUploadedImages,
  normalizeUploadedImage,
  formatVisionContextBlock,
  buildMultiImageContext,
  processImageForVision,
  detectImageFormat,
  visionOutputFilename,
  isSupportedImage,
  normalizeImageMime,
  UnsupportedImageError,
  ImageProcessingError,
} from "./visionService.js";

export {
  processImageForVision as optimizeImage,
  openImagePipeline,
  detectImageFormat as sniffImageFormat,
} from "./imageProcessor.js";

export { extractOcrText, shutdownOcrWorker, OCR_LANG } from "./ocrService.js";

export {
  SUPPORTED_IMAGE_EXTENSIONS,
  SUPPORTED_IMAGE_MIMES,
  VISION_MAX_EDGE,
  VISION_JPEG_QUALITY,
} from "./shared.js";
