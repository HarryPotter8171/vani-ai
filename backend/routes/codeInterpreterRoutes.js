import express from "express";
import multer from "multer";
import path from "node:path";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { usageGuard, usageGuardFeature } from "../middleware/usageGuard.js";
import { ALLOWED_UPLOAD_EXTENSIONS } from "../services/codeInterpreter/config.ts";
import {
  codeInterpreterHealth,
  createSession,
  listSessions,
  getSession,
  destroySession,
  executeCode,
  interruptExecution,
  restartKernel,
  uploadSessionFile,
  downloadSessionFile,
  listSessionFiles,
  publishToCanvas,
  recentAudit,
} from "../controllers/codeInterpreterController.js";

const router = express.Router();

const execLimit = createRateLimiter({
  windowMs: 60_000,
  max: 40,
  message: "Too many Code Interpreter requests. Please try again shortly.",
});

const uploadLimit = createRateLimiter({
  windowMs: 60_000,
  max: 30,
  message: "Too many Code Interpreter uploads. Please try again shortly.",
});

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
      return cb(new Error(`Unsupported file type: ${ext || "(none)"}`));
    }
    cb(null, true);
  },
});

router.get("/health", codeInterpreterHealth);

router.use(requireAuth);
router.use(usageGuardFeature("code_interpreter"));

router.get("/audit", recentAudit);

router.post("/sessions", execLimit, createSession);
router.get("/sessions", listSessions);
router.get("/sessions/:id", getSession);
router.delete("/sessions/:id", execLimit, destroySession);

router.post(
  "/sessions/:id/execute",
  usageGuard("code_interpreter"),
  execLimit,
  executeCode
);
router.post("/sessions/:id/interrupt", execLimit, interruptExecution);
router.post("/sessions/:id/restart", execLimit, restartKernel);

router.get("/sessions/:id/files", listSessionFiles);
router.post(
  "/sessions/:id/files",
  uploadLimit,
  (req, res, next) => {
    memoryUpload.single("file")(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || "Upload failed" });
      }
      next();
    });
  },
  uploadSessionFile
);
router.get("/sessions/:id/files/:fileId", downloadSessionFile);

router.post("/sessions/:id/publish-canvas", execLimit, publishToCanvas);

export default router;
