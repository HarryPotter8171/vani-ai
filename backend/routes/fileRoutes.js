import express from "express";
import {
  getFileMetadata,
  getFileContent,
  getSignedFileUrl,
  deleteFile,
  parseFile,
  processImageFile,
  understandFile,
  uploadFiles,
} from "../controllers/fileController.js";
import {
  analyzePdf,
  analyzePdfStream,
  askPdf,
  askPdfStream,
  searchPdf,
  getPdfTables,
  clearPdfChat,
} from "../controllers/pdfIntelligenceController.js";
import { uploadFilesMiddleware } from "../middleware/upload.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { requireAuth, requireFileAccess } from "../middleware/auth.js";
import { usageGuard } from "../middleware/usageGuard.js";
import {
  UPLOAD_RATE_LIMIT_MAX,
  UPLOAD_RATE_LIMIT_WINDOW_MS,
} from "../config/upload.js";
import {
  UNDERSTAND_RATE_LIMIT_MAX,
  UNDERSTAND_RATE_LIMIT_WINDOW_MS,
} from "../services/documentUnderstanding/config.js";
import {
  PDF_INTEL_RATE_LIMIT_MAX,
  PDF_INTEL_RATE_LIMIT_WINDOW_MS,
} from "../services/pdfIntelligence/config.js";

const router = express.Router();

const uploadRateLimit = createRateLimiter({
  windowMs: UPLOAD_RATE_LIMIT_WINDOW_MS,
  max: UPLOAD_RATE_LIMIT_MAX,
  message: "Too many uploads. Please wait a moment and try again.",
  keyFn: (req) => req.user?.id || req.ip || "unknown",
});

const understandRateLimit = createRateLimiter({
  windowMs: UNDERSTAND_RATE_LIMIT_WINDOW_MS,
  max: UNDERSTAND_RATE_LIMIT_MAX,
  message: "Too many document analyses. Please wait a moment and try again.",
  keyFn: (req) => req.user?.id || req.ip || "unknown",
});

const pdfIntelRateLimit = createRateLimiter({
  windowMs: PDF_INTEL_RATE_LIMIT_WINDOW_MS,
  max: PDF_INTEL_RATE_LIMIT_MAX,
  message: "Too many PDF intelligence requests. Please wait a moment and try again.",
  keyFn: (req) => req.user?.id || req.ip || "unknown",
});

function uploadBytes(req) {
  const files = Array.isArray(req.files) ? req.files : [];
  const total = files.reduce((sum, f) => sum + (Number(f.size) || 0), 0);
  return total > 0 ? total : 1;
}

router.post(
  "/upload",
  requireAuth,
  uploadRateLimit,
  uploadFilesMiddleware,
  usageGuard("file_upload", uploadBytes),
  uploadFiles
);

// Session JWT or short-lived file-scoped token (for <img src>).
router.get("/:id/content", requireFileAccess, getFileContent);

router.get("/:id/signed-url", requireAuth, getSignedFileUrl);
router.get("/:id", requireAuth, getFileMetadata);
router.delete("/:id", requireAuth, deleteFile);
router.post("/:id/parse", requireAuth, parseFile);
router.post("/:id/process-image", requireAuth, processImageFile);
router.post(
  "/:id/understand",
  requireAuth,
  understandRateLimit,
  understandFile
);

// --- PDF Intelligence (additive; does not change existing contracts) --------
router.post(
  "/:id/pdf/analyze",
  requireAuth,
  pdfIntelRateLimit,
  analyzePdf
);
router.post(
  "/:id/pdf/analyze/stream",
  requireAuth,
  pdfIntelRateLimit,
  analyzePdfStream
);
router.post("/:id/pdf/ask", requireAuth, pdfIntelRateLimit, askPdf);
router.post(
  "/:id/pdf/ask/stream",
  requireAuth,
  pdfIntelRateLimit,
  askPdfStream
);
router.post("/:id/pdf/search", requireAuth, pdfIntelRateLimit, searchPdf);
router.get("/:id/pdf/tables", requireAuth, pdfIntelRateLimit, getPdfTables);
router.delete(
  "/:id/pdf/conversation",
  requireAuth,
  pdfIntelRateLimit,
  clearPdfChat
);

export default router;
