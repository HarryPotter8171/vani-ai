import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { usageGuardFeature } from "../middleware/usageGuard.js";
import { PROJECTS_RATE_LIMIT } from "../config/rateLimits.js";
import {
  archive,
  create,
  createMemory,
  deleteFile,
  duplicate,
  editMemory,
  getOne,
  list,
  listChats,
  listFiles,
  listMemories,
  pin,
  pinned,
  recent,
  remove,
  removeMemory,
  rename,
  searchKnowledge,
  unarchive,
  unpin,
  update,
  uploadFile,
} from "../controllers/projectController.js";

const router = express.Router();

// Scoped to "/projects" (not a bare `router.use(requireAuth)`): this router
// is mounted at the broad "/api" prefix, so an unscoped middleware here
// would intercept every request under "/api" that reaches this router —
// including unrelated, intentionally-public routes like GET /api/voice/health
// and GET /api/browser/health — before they ever reach their own router.
router.use("/projects", requireAuth);
router.use(
  "/projects",
  createRateLimiter({
    ...PROJECTS_RATE_LIMIT,
    message: "Too many project requests. Please slow down and try again shortly.",
    keyFn: (req) => req.user?.id || req.ip || "unknown",
    prefix: "rl:projects",
  })
);

router.get("/projects", list);
router.get("/projects/recent", recent);
router.get("/projects/pinned", pinned);
router.post("/projects", create);

// Shared-project collaboration endpoints (Business+) — stub until product lands.
router.post(
  "/projects/:id/share",
  usageGuardFeature("shared_projects"),
  (req, res) => {
    res.status(501).json({
      error: "Shared projects are coming soon on Business and Enterprise plans.",
      code: "NOT_IMPLEMENTED",
      feature: "shared_projects",
      requiredPlan: "business",
      currentPlan: req.plan?.planId || null,
      upgradeHint:
        "Upgrade to Business for team workspaces, shared projects, and admin controls.",
    });
  }
);

router.get("/projects/:id", getOne);
router.put("/projects/:id", update);
router.put("/projects/:id/rename", rename);
router.post("/projects/:id/pin", pin);
router.post("/projects/:id/unpin", unpin);
router.post("/projects/:id/archive", archive);
router.post("/projects/:id/unarchive", unarchive);
router.post("/projects/:id/duplicate", duplicate);
router.delete("/projects/:id", remove);

router.get("/projects/:id/files", listFiles);
router.post("/projects/:id/files", uploadFile);
router.delete("/projects/:id/files/:fileId", deleteFile);
router.post("/projects/:id/knowledge/search", searchKnowledge);

router.get("/projects/:id/memories", listMemories);
router.post("/projects/:id/memories", createMemory);
router.put("/projects/:id/memories/:memoryId", editMemory);
router.delete("/projects/:id/memories/:memoryId", removeMemory);

router.get("/projects/:id/chats", listChats);

export default router;
