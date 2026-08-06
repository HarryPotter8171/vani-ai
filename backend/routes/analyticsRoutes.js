import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { requirePlatformAdmin } from "../middleware/requirePlatformAdmin.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import {
  getMyAnalytics,
  getMyCharts,
  exportMyAnalytics,
  getAdminDashboard,
  getAdminHealth,
  getAdminLogs,
  exportAdminAnalytics,
  getAnalyticsMe,
} from "../controllers/analyticsController.js";

const router = express.Router();

const exportLimit = createRateLimiter({
  windowMs: 60_000,
  max: 20,
  message: "Too many export requests. Please try again shortly.",
});

router.use(requireAuth);

router.get("/me", getAnalyticsMe);
router.get("/overview", getMyAnalytics);
router.get("/charts", getMyCharts);
router.get("/export", exportLimit, exportMyAnalytics);

// Platform admin — role check (not Business plan feature gate).
router.get("/admin/dashboard", requirePlatformAdmin, getAdminDashboard);
router.get("/admin/health", requirePlatformAdmin, getAdminHealth);
router.get("/admin/logs", requirePlatformAdmin, getAdminLogs);
router.get("/admin/export", requirePlatformAdmin, exportLimit, exportAdminAnalytics);

export default router;
