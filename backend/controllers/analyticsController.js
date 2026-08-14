import { toPublicErrorMessage } from "../utils/errors.js";
/**
 * Analytics HTTP handlers — user analytics + platform admin dashboard.
 */

import {
  analyticsService,
  adminAnalyticsService,
  exportService,
} from "../services/analytics/index.js";

function userIdOf(req) {
  return String(req.user?._id || req.user?.id || "");
}

export const getMyAnalytics = async (req, res) => {
  try {
    const userId = userIdOf(req);
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const analytics = await analyticsService.getUserAnalytics(userId);
    res.json({ analytics });
  } catch (err) {
    console.error("[analytics]", err);
    res.status(err.status || 500).json({
      error: toPublicErrorMessage(err, "Unable to load analytics"),
    });
  }
};

export const getMyCharts = async (req, res) => {
  try {
    const userId = userIdOf(req);
    const days = Number(req.query.days) || 30;
    const daily = await analyticsService.getDailySeries(userId, days);
    res.json({
      charts: {
        daily,
        weekly: analyticsService.aggregateSeries(daily, 7),
        monthly: analyticsService.aggregateSeries(
          await analyticsService.getDailySeries(userId, 90),
          30
        ),
      },
    });
  } catch (err) {
    res.status(500).json({ error: toPublicErrorMessage(err, "Unable to load charts") });
  }
};

export const exportMyAnalytics = async (req, res) => {
  try {
    const userId = userIdOf(req);
    const format = String(req.query.format || "csv").toLowerCase();
    const analytics = await analyticsService.getUserAnalytics(userId);

    if (format === "json") {
      return res.json({ analytics, rows: exportService.userAnalyticsToRows(analytics) });
    }

    // PDF is rendered client-side; CSV streams from the API.
    if (format === "pdf") {
      return res.json({
        format: "pdf",
        title: "VANI AI — Usage Analytics",
        rows: exportService.userAnalyticsToRows(analytics),
        analytics,
      });
    }

    const csv = exportService.userAnalyticsToCsv(analytics);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="vani-analytics-${stamp}.csv"`
    );
    res.send(csv);
  } catch (err) {
    console.error("[analytics:export]", err);
    res.status(500).json({ error: toPublicErrorMessage(err, "Unable to export analytics") });
  }
};

export const getAdminDashboard = async (req, res) => {
  try {
    const dashboard = await adminAnalyticsService.getDashboard();
    res.json({ dashboard });
  } catch (err) {
    console.error("[analytics:admin]", err);
    res.status(500).json({ error: toPublicErrorMessage(err, "Unable to load admin dashboard") });
  }
};

export const getAdminHealth = async (req, res) => {
  try {
    const health = await adminAnalyticsService.getSystemHealth();
    res.json({ health });
  } catch (err) {
    res.status(500).json({ error: toPublicErrorMessage(err, "Unable to load system health") });
  }
};

export const getAdminLogs = async (req, res) => {
  try {
    const logs = await adminAnalyticsService.listRecentLogs({
      limit: req.query.limit,
      type: req.query.type,
      userId: req.query.userId,
    });
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: toPublicErrorMessage(err, "Unable to load logs") });
  }
};

export const exportAdminAnalytics = async (req, res) => {
  try {
    const format = String(req.query.format || "csv").toLowerCase();
    const dashboard = await adminAnalyticsService.getDashboard();

    if (format === "json" || format === "pdf") {
      return res.json({
        format,
        title: "VANI AI — Admin Dashboard",
        rows: exportService.adminDashboardToRows(dashboard),
        dashboard,
      });
    }

    const csv = exportService.adminDashboardToCsv(dashboard);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="vani-admin-analytics-${stamp}.csv"`
    );
    res.send(csv);
  } catch (err) {
    console.error("[analytics:admin:export]", err);
    res.status(500).json({ error: toPublicErrorMessage(err, "Unable to export admin analytics") });
  }
};

/** Lightweight probe — am I a platform admin? */
export const getAnalyticsMe = async (req, res) => {
  res.json({
    userId: userIdOf(req),
    role: req.user?.role || "user",
    isPlatformAdmin: req.user?.role === "admin",
  });
};
