# Billing Foundation — Implementation Report

Production billing architecture for VANI AI: plans, subscriptions, usage metering, invoices, and webhook stubs — **without a payment gateway** and without changing existing product features.

## Status

| Area | Status |
|------|--------|
| Billing services (`billing/`) | Done |
| Models: Plan, Subscription, Usage, Invoice | Done |
| Plans: Free / Pro / Business / Enterprise | Done |
| Usage tracking middleware | Done (soft, non-enforcing) |
| Billing API | Done |
| Settings → Billing UI | Done |
| Payment gateway | **Not connected** (by design) |
| Backend build/lint | Passed |
| Frontend build | Passed |

---

## Architecture

```
billing/
├── BillingService.ts       # Facade
├── SubscriptionService.ts  # Per-user plan assignment
├── UsageService.ts         # Period metrics + remaining quota
├── PlanService.ts          # Catalog seed + lookups
├── InvoiceService.ts       # Draft / $0 invoices
└── WebhookService.ts       # Future gateway event sink
```

Supporting pieces:

| Piece | Path |
|-------|------|
| Models | `backend/models/{Plan,Subscription,Usage,Invoice}.js` |
| Middleware | `backend/middleware/usageTracking.js` |
| Routes | `backend/routes/billingRoutes.js` → `/api/billing` |
| Controller | `backend/controllers/billingController.js` |
| Init | `backend/billing/init.js` (seeded after Mongo connect) |
| Frontend | `frontend/components/settings/BillingSettings.tsx` |
| Hook / API | `frontend/hooks/useBilling.ts`, `frontend/lib/billing/` |

---

## Plans

| Plan | Price (display) | Soft monthly quotas (highlights) |
|------|-----------------|----------------------------------|
| **Free** | $0 | 100 chats, 500K tokens, 5 images, 10 voice min, 2 research, 3 browser, 20 code, 100MB storage |
| **Pro** | $20/mo | 2K chats, 10M tokens, 100 images, 300 voice min, 40 research, 50 browser, 500 code, 5GB |
| **Business** | $50/mo | 10K chats, 50M tokens, 500 images, 1.5K voice min, 200 research, 250 browser, 2.5K code, 50GB |
| **Enterprise** | Contact sales | Unlimited soft quotas (`-1`) |

Quotas are **soft** — tracked and shown in UI, not enforced. Existing features keep working regardless of usage.

---

## Usage tracking

Metrics:

- `chat_requests`
- `tokens`
- `image_generation`
- `voice_minutes`
- `research_runs`
- `browser_sessions`
- `code_executions`
- `file_storage_bytes`

### Middleware

`usageTrackingMiddleware` is mounted in `createApp()` after body parsers. On `res.finish` with **2xx** and an authenticated `req.user`, it matches the route and `$inc`s the corresponding metric.

| Route | Metric |
|-------|--------|
| `POST /api/chat` | `chat_requests` |
| `POST /api/agents/run` | `chat_requests` |
| `POST /api/research/run` | `research_runs` |
| `POST /api/browser/runs` | `browser_sessions` |
| `POST /api/code/sessions/:id/execute` | `code_executions` |
| `POST /api/voice/stt` / `tts` / `session` | `voice_minutes` |
| `POST /api/files/upload` | `file_storage_bytes` (upload size) |

Optional precise amounts via `res.locals.billingTokens` / `res.locals.billingImages` (or `req.billingTokens` / `req.billingImages`) — ready for chat/image controllers without requiring changes today.

Recording is fire-and-forget and never fails the request.

---

## Database models

- **Plan** — catalog document (`planId` unique)
- **Subscription** — one per user (unique `user`); period + status; Stripe id placeholders
- **Usage** — one per `(user, periodStart)` with atomic `$inc` metrics
- **Invoice** — draft/paid period invoices; free plans get $0 `paid` rows

Billing period: **UTC calendar month** (foundation; gateway can switch later).

---

## API (`/api/billing`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/plans` | No | Public catalog |
| POST | `/webhooks` | No | Future gateway sink |
| GET | `/overview` | Yes | Plan + usage + remaining + catalog |
| GET | `/subscription` | Yes | Current subscription |
| GET | `/usage` | Yes | Usage + remaining |
| GET | `/invoices` | Yes | Invoice history |
| POST | `/upgrade` | Yes | Local plan change (no charge) |
| POST | `/cancel` | Yes | `cancelAtPeriodEnd` flag |

Upgrade is explicitly a **placeholder**: updates Mongo subscription only and returns `checkout: null`.

---

## Frontend

**Settings → Billing** (Sidebar Settings + VANI Pro card):

- Current plan card
- Usage meters with remaining quota
- Upgrade grid (Free / Pro / Business / Enterprise)
- Integrations tab → opens existing MCP settings

MCP remains fully available; Settings now opens Billing first (Integrations tab links to MCP).

---

## What did not change

- No payment provider SDK or secrets
- No quota hard-blocks on chat, research, browser, code, voice, or files
- Existing routes/controllers unchanged except global middleware + new `/api/billing` mount
- Feature flags for browser / code interpreter untouched

---

## Verification

```bash
cd backend && npm run build && npm run lint
cd backend && npx vitest run tests/unit/billing.test.js
cd frontend && npm run build
# lint billing-related frontend paths
```

---

## Next steps (when adding a gateway)

1. Wire Stripe/Paddle Checkout from `POST /upgrade` → return real `checkout.url`
2. Verify signatures in `WebhookService.ingest`
3. Sync `externalCustomerId` / `externalSubscriptionId` on subscription
4. Optionally enforce soft quotas with 402/429 once product wants hard limits
5. Feed exact token/image counts from model router into `res.locals.billingTokens`
