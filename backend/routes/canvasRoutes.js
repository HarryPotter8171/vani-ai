import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { usageGuard, usageGuardFeature } from "../middleware/usageGuard.js";
import {
  aiEdit,
  autosave,
  close,
  create,
  duplicate,
  getOne,
  getVersionOne,
  list,
  pin,
  remove,
  rename,
  reopen,
  restore,
  unpin,
  update,
  versions,
} from "../controllers/canvasController.js";

const router = express.Router();

router.use(requireAuth);
router.use(usageGuardFeature("canvas"));

const writeLimit = createRateLimiter({
  windowMs: 60_000,
  max: 120,
  message: "Too many canvas writes. Please try again shortly.",
});

const aiLimit = createRateLimiter({
  windowMs: 60_000,
  max: 20,
  message: "Too many Canvas AI edits. Please try again shortly.",
});

router.get("/", list);
router.post("/", writeLimit, create);

router.get("/:id", getOne);
router.patch("/:id", writeLimit, update);
router.put("/:id/autosave", writeLimit, autosave);
router.patch("/:id/title", writeLimit, rename);
router.post("/:id/pin", writeLimit, pin);
router.post("/:id/unpin", writeLimit, unpin);
router.post("/:id/close", writeLimit, close);
router.post("/:id/reopen", writeLimit, reopen);
router.post("/:id/duplicate", writeLimit, duplicate);
router.delete("/:id", writeLimit, remove);

router.get("/:id/versions", versions);
router.get("/:id/versions/:versionId", getVersionOne);
router.post("/:id/versions/:versionId/restore", writeLimit, restore);

router.post("/:id/ai-edit", usageGuard("canvas"), aiLimit, aiEdit);

export default router;
