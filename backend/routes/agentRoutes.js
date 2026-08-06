import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { usageGuard, usageGuardFeature } from "../middleware/usageGuard.js";
import {
  listAgents,
  getAgentSession,
  runAgent,
  pauseAgent,
  resumeAgent,
  cancelAgent,
  retryAgentStep,
  agentRunRateLimit,
} from "../controllers/agentController.js";

const router = express.Router();

router.use(requireAuth);
router.use(usageGuardFeature("agents"));

router.get("/", listAgents);
router.post("/run", usageGuard("agents"), agentRunRateLimit, runAgent);
router.get("/sessions/:sessionId", getAgentSession);
router.post("/sessions/:sessionId/pause", pauseAgent);
router.post("/sessions/:sessionId/resume", resumeAgent);
router.post("/sessions/:sessionId/cancel", cancelAgent);
router.post("/sessions/:sessionId/retry", retryAgentStep);

export default router;
