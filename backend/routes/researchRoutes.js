import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { usageGuard } from "../middleware/usageGuard.js";
import {
  runResearch,
  getResearch,
  pauseResearch,
  resumeResearch,
  cancelResearch,
  listResearch,
  researchRunRateLimit,
} from "../controllers/researchController.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", listResearch);
router.post(
  "/run",
  usageGuard("research"),
  researchRunRateLimit,
  runResearch
);
router.get("/sessions/:sessionId", getResearch);
router.post("/sessions/:sessionId/pause", pauseResearch);
router.post("/sessions/:sessionId/resume", resumeResearch);
router.post("/sessions/:sessionId/cancel", cancelResearch);

export default router;
