# Production Analytics & Admin Dashboard — Implementation Report

Complete analytics system for VANI AI users and platform administrators: usage metrics, charts, system health, durable logging, and CSV/PDF exports — **without redesigning** the existing application chrome.

## Status

| Area | Status |
|------|--------|
| User analytics API + UI | Done |
| Admin dashboard API + UI | Done |
| System health panel | Done |
| Request / model / tool / error logging | Done |
| Daily / weekly / monthly charts | Done |
| CSV + PDF exports | Done |
| Platform admin security | Done (`role: admin` + `VANI_ADMIN_EMAILS`) |
| Backend build/lint | Passed (`265 files`) |
| Frontend build | Passed (Next.js) |
| Frontend lint | Pre-existing failures only (AuthGate, VirtualizedMessageList, …); new analytics files clean |

---

## Architecture

```
backend/
├── models/
│   ├── AnalyticsEvent.js     # Raw events (TTL ~90d)
│   ├── DailyUsage.js         # Per-user daily rollups + model maps
│   └── User.js               # + role: user | admin
├── services/analytics/
│   ├── AnalyticsService.js   # User totals, charts, event writers
│   ├── AdminAnalyticsService.js
│   ├── ExportService.js      # CSV + PDF row payloads
│   └── config.js             # Cost estimates, sampling
├── middleware/
│   ├── analyticsLogging.js   # Non-blocking request logging
│   └── requirePlatformAdmin.js
├── controllers/analyticsController.js
└── routes/analyticsRoutes.js → /api/analytics

frontend/
├── lib/analytics/            # Types, API client, PDF helper
├── hooks/useAnalytics.ts
├── hooks/useAdminAnalytics.ts
└── components/analytics/
    ├── AnalyticsPanel.tsx    # User analytics modal
    ├── AdminDashboard.tsx    # Admin modal
    └── UsageChart.tsx        # Lightweight bar chart
```

Integration points (no redesign):

| Piece | How |
|-------|-----|
| Sidebar | New **Analytics** nav item (alongside Memory / Settings) |
| Panels | Lazy-loaded modals via `FeaturePanels.tsx` (same pattern as Billing) |
| Billing | Reuses `Usage` / `Subscription` / `Invoice` / plan quotas |
| Health | Extends `runHealthChecks()` for Mongo / Redis / disk / memory |

---

## User analytics

Shown in **Analytics** panel:

| Metric | Source |
|--------|--------|
| Total Chats | `Usage.metrics.chat_requests` |
| Total Tokens | `Usage.metrics.tokens` |
| Images Generated | `Usage.metrics.image_generation` |
| Voice Minutes | `Usage.metrics.voice_minutes` |
| Deep Research Sessions | `Usage.metrics.research_runs` |
| Browser Sessions | `Usage.metrics.browser_sessions` |
| MCP Calls | `DailyUsage.metrics.mcp_calls` (period sum) |
| Code Interpreter Runs | `Usage.metrics.code_executions` |
| File Storage Used | `Usage.metrics.file_storage_bytes` |
| Current Plan | Billing overview |
| Monthly Usage / Remaining Quotas | Billing `remaining` |

### Charts

| Chart | Bucketing |
|-------|-----------|
| Daily | Last 30 UTC days |
| Weekly | 7-day aggregates over the daily series |
| Monthly | 30-day aggregates over last 90 days |

---

## Admin dashboard

**Platform admin only** (`User.role === "admin"`). Distinct from Business plan org-admin stubs at `/api/admin`.

| Metric | Notes |
|--------|-------|
| Total / Active / New / Paid Users | Active = users with `DailyUsage` in last N days |
| Revenue | Paid invoices this month, else estimated MRR from subscriptions |
| API Cost | Token / image / voice cost model (`VANI_ANALYTICS_*`) |
| Profit Estimate | Revenue − API cost |
| Error Rate / Avg Response Time | From daily latency + error counters |
| Token / Image / Voice / Model usage | Aggregated Usage + DailyUsage model maps |

Tabs: **Overview** · **System health** · **Logs**

---

## System health

| Check | Detail |
|-------|--------|
| MongoDB | Connection + ping |
| Redis | Optional; unconfigured = healthy fallback |
| Queue | In-process HTTP load (no external job queue yet) |
| Storage | Disk `statfs` when available |
| CPU | Host CPU estimate + load average |
| Memory | Process RSS/heap + system used % |
| Uptime | `process.uptime()` |

---

## Logging

| Tracked | Mechanism |
|---------|-----------|
| Every API request | `analyticsLoggingMiddleware` → DailyUsage always; AnalyticsEvent sampled |
| Errors | Always persisted (`type: error`) |
| Latency | Per-request ms on finish |
| Model calls | `recordModelAnalytics()` + token hints from `res.locals.billingTokens` |
| Tool invocations | Tool registry → `recordToolAnalytics()` |

Sampling: successful API events use `VANI_ANALYTICS_SAMPLE_RATE` (default 0.25 in production, 1.0 otherwise). Raw events TTL ≈ 90 days (`VANI_ANALYTICS_TTL_DAYS`).

---

## Exports

| Format | User | Admin |
|--------|------|-------|
| CSV | `GET /api/analytics/export?format=csv` | `GET /api/analytics/admin/export?format=csv` |
| PDF | Client-side jsPDF from export payload rows | Same |

---

## Security

1. All `/api/analytics/*` routes require `requireAuth`.
2. Admin routes additionally require `requirePlatformAdmin`.
3. Bootstrap admins via env (promote-only, never auto-demote):

```bash
VANI_ADMIN_EMAILS=you@example.com,ops@example.com
```

Role is returned on `POST /api/auth/sync` and `GET /api/auth/me`. Admin button in the Analytics panel appears only when `isPlatformAdmin` is true.

---

## API surface

| Method | Path | Access |
|--------|------|--------|
| GET | `/api/analytics/me` | Auth |
| GET | `/api/analytics/overview` | Auth |
| GET | `/api/analytics/charts` | Auth |
| GET | `/api/analytics/export` | Auth |
| GET | `/api/analytics/admin/dashboard` | Platform admin |
| GET | `/api/analytics/admin/health` | Platform admin |
| GET | `/api/analytics/admin/logs` | Platform admin |
| GET | `/api/analytics/admin/export` | Platform admin |

---

## Env knobs

See `backend/.env.example`:

- `VANI_ADMIN_EMAILS`
- `VANI_ANALYTICS_SAMPLE_RATE`
- `VANI_ANALYTICS_TTL_DAYS`
- `VANI_ANALYTICS_ACTIVE_DAYS`
- `VANI_ANALYTICS_TOKEN_COST_PER_M`
- `VANI_ANALYTICS_IMAGE_COST`
- `VANI_ANALYTICS_VOICE_COST_PER_MIN`

---

## Verification

```bash
cd backend && npm run build && npm run lint
cd frontend && npm run build && npm run lint
```
