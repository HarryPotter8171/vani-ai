/**
 * ExportService — CSV (and structured rows for PDF clients) for analytics.
 */

function csvEscape(value) {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers, rows) {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  return lines.join("\n") + "\n";
}

export class ExportService {
  userAnalyticsToCsv(analytics) {
    const totals = analytics.totals || {};
    const summaryHeaders = ["metric", "value"];
    const summaryRows = [
      { metric: "plan", value: analytics.plan?.planId || "" },
      { metric: "chats", value: totals.chats },
      { metric: "tokens", value: totals.tokens },
      { metric: "images_generated", value: totals.imagesGenerated },
      { metric: "voice_minutes", value: totals.voiceMinutes },
      { metric: "deep_research_sessions", value: totals.deepResearchSessions },
      { metric: "browser_sessions", value: totals.browserSessions },
      { metric: "mcp_calls", value: totals.mcpCalls },
      { metric: "code_interpreter_runs", value: totals.codeInterpreterRuns },
      { metric: "file_storage_bytes", value: totals.fileStorageBytes },
    ];

    const dailyHeaders = [
      "date",
      "chat_requests",
      "tokens",
      "image_generation",
      "voice_minutes",
      "research_runs",
      "browser_sessions",
      "code_executions",
      "mcp_calls",
      "total",
    ];
    const dailyRows = (analytics.charts?.daily || []).map((d) => ({
      date: d.date,
      chat_requests: d.metrics?.chat_requests || 0,
      tokens: d.metrics?.tokens || 0,
      image_generation: d.metrics?.image_generation || 0,
      voice_minutes: d.metrics?.voice_minutes || 0,
      research_runs: d.metrics?.research_runs || 0,
      browser_sessions: d.metrics?.browser_sessions || 0,
      code_executions: d.metrics?.code_executions || 0,
      mcp_calls: d.metrics?.mcp_calls || 0,
      total: d.total || 0,
    }));

    const remainingHeaders = [
      "metric",
      "used",
      "limit",
      "remaining",
      "unlimited",
      "percent_used",
    ];
    const remainingRows = (analytics.remaining || []).map((r) => ({
      metric: r.metric,
      used: r.used,
      limit: r.limit,
      remaining: r.remaining,
      unlimited: r.unlimited,
      percent_used: r.percentUsed,
    }));

    return [
      "# VANI AI — User Analytics Summary",
      toCsv(summaryHeaders, summaryRows).trimEnd(),
      "",
      "# Remaining Quotas",
      toCsv(remainingHeaders, remainingRows).trimEnd(),
      "",
      "# Daily Usage",
      toCsv(dailyHeaders, dailyRows).trimEnd(),
      "",
    ].join("\n");
  }

  adminDashboardToCsv(dashboard) {
    const u = dashboard.users || {};
    const f = dashboard.finance || {};
    const p = dashboard.performance || {};
    const usage = dashboard.usage || {};

    const summary = toCsv(
      ["metric", "value"],
      [
        { metric: "total_users", value: u.total },
        { metric: "active_users", value: u.active },
        { metric: "new_users", value: u.new },
        { metric: "paid_users", value: u.paid },
        { metric: "revenue_cents", value: f.revenueCents },
        { metric: "api_cost_cents", value: f.apiCostCents },
        { metric: "profit_estimate_cents", value: f.profitEstimateCents },
        { metric: "error_rate_pct", value: p.errorRate },
        { metric: "avg_response_ms", value: p.averageResponseTimeMs },
        { metric: "tokens", value: usage.tokens },
        { metric: "images", value: usage.images },
        { metric: "voice_minutes", value: usage.voiceMinutes },
        { metric: "mcp_calls", value: usage.mcp },
      ]
    );

    const modelRows = Object.entries(dashboard.modelUsage || {}).map(
      ([model, tokens]) => ({ model, tokens })
    );
    const models = toCsv(["model", "tokens"], modelRows);

    const dailyRows = (dashboard.charts?.daily || []).map((d) => ({
      date: d.date,
      api_requests: d.metrics?.api_requests || 0,
      errors: d.metrics?.errors || 0,
      tokens: d.metrics?.tokens || 0,
      chat_requests: d.metrics?.chat_requests || 0,
    }));
    const daily = toCsv(
      ["date", "api_requests", "errors", "tokens", "chat_requests"],
      dailyRows
    );

    return [
      "# VANI AI — Admin Dashboard",
      summary.trimEnd(),
      "",
      "# Model Usage",
      models.trimEnd(),
      "",
      "# Daily Platform Usage",
      daily.trimEnd(),
      "",
    ].join("\n");
  }

  /** Flat rows suitable for client-side PDF tables. */
  userAnalyticsToRows(analytics) {
    const t = analytics.totals || {};
    return [
      ["Plan", analytics.plan?.name || analytics.plan?.planId || ""],
      ["Total Chats", t.chats],
      ["Total Tokens", t.tokens],
      ["Images Generated", t.imagesGenerated],
      ["Voice Minutes", t.voiceMinutes],
      ["Deep Research Sessions", t.deepResearchSessions],
      ["Browser Sessions", t.browserSessions],
      ["MCP Calls", t.mcpCalls],
      ["Code Interpreter Runs", t.codeInterpreterRuns],
      ["File Storage (bytes)", t.fileStorageBytes],
    ];
  }

  adminDashboardToRows(dashboard) {
    const u = dashboard.users || {};
    const f = dashboard.finance || {};
    const p = dashboard.performance || {};
    const usage = dashboard.usage || {};
    return [
      ["Total Users", u.total],
      ["Active Users", u.active],
      ["New Users (30d)", u.new],
      ["Paid Users", u.paid],
      ["Revenue (cents)", f.revenueCents],
      ["API Cost (cents)", f.apiCostCents],
      ["Profit Estimate (cents)", f.profitEstimateCents],
      ["Error Rate (%)", p.errorRate],
      ["Avg Response (ms)", p.averageResponseTimeMs],
      ["Token Usage", usage.tokens],
      ["Image Usage", usage.images],
      ["Voice Minutes", usage.voiceMinutes],
    ];
  }
}

export const exportService = new ExportService();
