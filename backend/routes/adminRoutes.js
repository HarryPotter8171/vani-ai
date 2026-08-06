import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { usageGuardFeature } from "../middleware/usageGuard.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import {
  getAdminOverview,
  listMembers,
  updateOrgSettings,
} from "../controllers/adminController.js";

const router = express.Router();

const writeLimit = createRateLimiter({
  windowMs: 60_000,
  max: 30,
  message: "Too many Admin requests. Please try again shortly.",
});

router.use(requireAuth);
router.use(usageGuardFeature("admin"));

router.get("/", getAdminOverview);
router.get("/members", listMembers);
router.patch("/settings", writeLimit, updateOrgSettings);

export default router;
