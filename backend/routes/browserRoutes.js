import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { usageGuard } from "../middleware/usageGuard.js";
import {
  startRun,
  listRuns,
  getRun,
  pauseRun,
  resumeRun,
  stopRun,
  cleanupRun,
  getScreenshot,
  listApprovals,
  resolveApproval,
  listPermissions,
  revokePermission,
  browserHealth,
} from "../controllers/browserController.js";

const router = express.Router();

const browserWriteLimit = createRateLimiter({
  windowMs: 60_000,
  max: 30,
  message: "Too many browser automation requests. Please try again shortly.",
});

router.get("/health", browserHealth);

// Auth is required for all non-health routes. Do NOT apply the Pro browser
// feature gate to read/poll endpoints — the frontend polls GET /approvals on
// every page load, and free users must receive 200 (empty) rather than 403.
// Premium enforcement stays on session-start (POST /runs) via usageGuard.
router.use(requireAuth);

router.post("/runs", usageGuard("browser"), browserWriteLimit, startRun);
router.get("/runs", listRuns);
router.get("/runs/:id", getRun);
router.post("/runs/:id/pause", browserWriteLimit, pauseRun);
router.post("/runs/:id/resume", browserWriteLimit, resumeRun);
router.post("/runs/:id/stop", browserWriteLimit, stopRun);
router.delete("/runs/:id", browserWriteLimit, cleanupRun);
router.get("/runs/:id/screenshots/:screenshotId", getScreenshot);

router.get("/approvals", listApprovals);
router.post("/approvals/:id", browserWriteLimit, resolveApproval);

router.get("/permissions", listPermissions);
router.post("/permissions/revoke", browserWriteLimit, revokePermission);

export default router;
