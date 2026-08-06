# Feature Gating Report — Production Billing Sprint 2

Hard plan entitlements and monthly quotas are enforced across API routes and model-callable tools via a single **UsageGuard** middleware. Soft usage metering remains for analytics; denials return structured responses (never crash the request).

## Status

| Capability | Status |
|------------|--------|
| UsageGuard (subscription + trial + quota) | Done |
| Free limited chats / images / voice / research | Done |
| Pro unlimited + Browser / Agents / MCP / Code Interpreter / priority routing | Done |
| Business Teams + Shared projects + Admin | Done |
| Enterprise unlimited + custom limits | Done |
| Premium HTTP endpoint protection | Done |
| Tool-path protection (chat-invoked tools) | Done |
| Frontend quota banner (remaining / reset / upgrade) | Done |
| Entitlements API for clients | Done |
| Soft usage metering (post-success) | Preserved |

---

## Plan matrix

| Feature | Free | Pro | Business | Enterprise |
|---------|------|-----|----------|------------|
| Chat | 100/mo | Unlimited | Unlimited | Unlimited |
| Images | 20/mo | Unlimited | Unlimited | Unlimited |
| Voice | 10 min/mo | Unlimited | Unlimited | Unlimited |
| Research | 5/mo | Unlimited | Unlimited | Unlimited |
| Canvas | ✓ | ✓ | ✓ | ✓ |
| File upload | 100 MB | 5 GB | 50 GB | Unlimited |
| Browser | — | ✓ | ✓ | ✓ |
| Agents | — | ✓ | ✓ | ✓ |
| MCP | — | ✓ | ✓ | ✓ |
| Code Interpreter | — | ✓ | ✓ | ✓ |
| Priority model routing | — | ✓ | ✓ | ✓ |
| Teams | — | — | ✓ | ✓ |
| Shared projects | — | — | ✓ | ✓ |
| Admin | — | — | ✓ | ✓ |

`-1` in plan quotas = unlimited. `0` = not included (blocked by feature and/or quota).

Free defaults are configurable via `VANI_PLAN_FREE_*` env vars (re-seeded on `initBilling()` / `ensureSeeded()`).

---

## Architecture

```
billing/
├── featureMatrix.ts   # FEATURE_MIN_PLAN + FEATURE_QUOTA_METRIC
├── FeatureGate.ts     # subscription / trial / feature / quota checks
├── PlanService.ts     # Free / Pro / Business / Enterprise + env overrides
└── BillingService.ts  # overview includes entitlements

middleware/
└── usageGuard.js      # usageGuard / usageGuardFeature / usageGuardQuota / usageGuardPlan
    featureGating.js   # re-exports UsageGuard (Sprint 1 aliases)
```

Denial payload shape:

```json
{
  "error": "Monthly chat_requests quota exceeded",
  "code": "QUOTA_EXCEEDED",
  "feature": "chat",
  "metric": "chat_requests",
  "requiredPlan": "pro",
  "currentPlan": "free",
  "used": 100,
  "limit": 100,
  "remaining": 0,
  "resetDate": "2026-09-01T00:00:00.000Z",
  "upgradeHint": "Upgrade to Pro to unlock this feature."
}
```

| Code | HTTP | Meaning |
|------|------|---------|
| `QUOTA_EXCEEDED` | 402 | Monthly quota exhausted or limit 0 |
| `PLAN_REQUIRED` | 403 | Feature needs a higher plan |
| `SUBSCRIPTION_INACTIVE` | 403 | past due / paused / incomplete / canceled |
| `TRIAL_EXPIRED` | 403 | Trialing status with `trialEnd` in the past |
| `AUTH_REQUIRED` | 401 | Missing user |

---

## Protected endpoints

| Area | Paths | Gate |
|------|-------|------|
| Chat | `POST /api/chat/` | `usageGuard("chat")` |
| Image generation | tool `image_generation` | FeatureGate in tool registry |
| Voice | `/api/voice/*` (auth) | `usageGuardFeature("voice")` + `usageGuard("voice")` on session/stt/tts |
| Browser | `/api/browser/*` (auth) | `usageGuardFeature("browser")` + `usageGuard("browser")` on `POST /runs` |
| MCP | `/api/mcp/*` | `usageGuardFeature("mcp")` + `usageGuard("mcp")` on tool/resource call |
| Agents | `/api/agents/*` | `usageGuardFeature("agents")` + `usageGuard("agents")` on `/run` |
| Deep Research | `POST /api/research/run` | `usageGuard("research")` |
| Canvas | `/api/canvas/*` | `usageGuardFeature("canvas")` + `usageGuard("canvas")` on AI edit |
| File upload | `POST /api/files/upload` | `usageGuard("file_upload", uploadBytes)` |
| Code Interpreter | `/api/code/*` (auth) | `usageGuardFeature("code_interpreter")` + `usageGuard(...)` on execute |
| Teams | `/api/teams/*` | `usageGuardFeature("teams")` (Business+) |
| Shared projects | `POST /api/projects/:id/share` | `usageGuardFeature("shared_projects")` (stub) |
| Admin | `/api/admin/*` | `usageGuardFeature("admin")` (Business+) |

Public health probes (`/voice/health`, `/browser/health`, `/code/health`) stay ungated.

### Tool-path gates (bypass-proof)

| Tool | Feature | Quota |
|------|---------|-------|
| `image_generation` | `image_generation` | `image_generation` |
| `browser_automation` | `browser` | `browser_sessions` |
| `code_execution` | `code_interpreter` | `code_executions` |

Successful metered tool runs also record usage via `recordBillingUsage`.

### Priority model routing (Pro+)

When the user has not selected an explicit non-default model, Pro+ plans resolve to `VANI_PRIORITY_MODEL` (default `gemini/gemini-2.5-pro`) via `ModelRouter` reason `priority_plan`. `planId` is threaded from `usageGuard` → `chatController` → orchestrator.

---

## Frontend

When UsageGuard denies a request:

1. Toast with message + remaining + reset date
2. Compact `QuotaExceededBanner` above the composer (remaining, reset date, **Upgrade plan** CTA → Billing settings)
3. Request does not crash — empty assistant placeholders are removed on chat denials

Helpers: `frontend/lib/billing/gateError.ts`, `frontend/components/billing/QuotaExceededBanner.tsx`.

---

## API additions (unchanged paths)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/billing/entitlements` | Feature flags + remaining quotas + `resetDate` / `trialActive` |
| GET | `/api/billing/overview` | Includes `entitlements` summary |

---

## Environment

```bash
# Deploy-time kill switches (still apply in addition to plan gates)
VANI_ENABLE_BROWSER_AUTOMATION=false
VANI_ENABLE_CODE_EXECUTION=false
VANI_DISABLE_IMAGE_GEN=false

# Free plan quotas (optional overrides)
VANI_PLAN_FREE_CHAT_REQUESTS=100
VANI_PLAN_FREE_IMAGE_GENERATION=20
VANI_PLAN_FREE_VOICE_MINUTES=10
VANI_PLAN_FREE_RESEARCH_RUNS=5
VANI_PLAN_FREE_BROWSER_SESSIONS=0
VANI_PLAN_FREE_CODE_EXECUTIONS=0

# Pro+ default model when no explicit pick
VANI_PRIORITY_MODEL=gemini/gemini-2.5-pro

# Emergency only — disables plan/quota checks
# FEATURE_GATING_DISABLED=true
```

Layering: env feature flag → subscription/trial → plan feature → monthly quota.

---

## Remaining TODOs

- [ ] Team invite / role-change / leave APIs + Teams UI (list/create/get + owner membership now persist; see `docs/reports/TEAMS_PERSISTENCE_REPORT.md`)
- [ ] Shared project collaboration UI + persistence (share endpoint returns 501 when gated through)
- [ ] Org member invite / role-change / audit APIs + Admin UI (overview/members/settings + seats now persist; see `docs/reports/ORG_ADMIN_REPORT.md`)
- [ ] Enterprise custom quota overrides stored per-org (catalog is unlimited today; env/seed supports Free overrides)
- [ ] Per-tool MCP metering (currently plan-gated only)
- [ ] Canvas AI edit monthly meter (currently feature-gated; chat tokens still soft-metered)
- [ ] Voice minute precision from STT/TTS duration (middleware still records after 2xx)
- [ ] Wire file-upload storage enforcement on project file uploads (`/api/projects/:id/files`)
- [ ] Surface entitlements prefetch in Sidebar for proactive low-quota warnings

---

## Verification

```bash
cd backend && npm run lint && npm run build
cd backend && npx vitest run tests/unit/featureGating.test.js tests/unit/billing.test.js
cd frontend && npm run lint && npm run build
```

---

## Notes

- Business inherits Pro capabilities and adds Teams / Shared projects / Admin.
- Agents and MCP have no separate meters — Pro+ is unlimited for those features.
- `usageTrackingMiddleware` still records after 2xx; it does not enforce.
- Plan catalog in Mongo is re-seeded on `initBilling()` / `ensureSeeded()` with Sprint 2 quotas.
- Sprint 1 aliases `requireAccess` / `requireFeature` / `requireQuota` remain as re-exports of UsageGuard.
