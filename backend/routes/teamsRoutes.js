import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { usageGuardFeature } from "../middleware/usageGuard.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import {
  listTeams,
  createTeam,
  getTeam,
} from "../controllers/teamsController.js";

const router = express.Router();

const writeLimit = createRateLimiter({
  windowMs: 60_000,
  max: 30,
  message: "Too many Teams requests. Please try again shortly.",
});

router.use(requireAuth);
router.use(usageGuardFeature("teams"));

router.get("/", listTeams);
router.post("/", writeLimit, createTeam);
router.get("/:id", getTeam);

export default router;
