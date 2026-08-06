import express from "express";
import {
  getMe,
  logout,
  revokeToken,
  syncUser,
} from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { AUTH_RATE_LIMIT } from "../config/rateLimits.js";

const router = express.Router();

// Keyed by IP — identity isn't established yet for /sync.
const authRateLimit = createRateLimiter({
  ...AUTH_RATE_LIMIT,
  message: "Too many authentication requests. Please try again shortly.",
  prefix: "rl:auth",
});
router.use(authRateLimit);

// JWT-verified sync — creates the Mongo user from token claims only.
router.post("/sync", syncUser);

// Ownership/account lookup (Mongo). Not used for UI identity — NextAuth is SoT.
router.get("/me", requireAuth, getMe);
router.post("/revoke", revokeToken);
router.post("/logout", logout);

export default router;
