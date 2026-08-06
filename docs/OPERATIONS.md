# VANI AI — Operational Runbook

**Audience:** on-call / release engineering  
**Companions:** [LAUNCH_CHECKLIST.md](../LAUNCH_CHECKLIST.md), [BACKUP.md](./BACKUP.md), [PRODUCTION_HARDENING_REPORT.md](./reports/PRODUCTION_HARDENING_REPORT.md)

This runbook covers day-2 operations for production-shaped deploys. It does
**not** introduce product features — only deploy, observe, recover, and roll back.

---

## 1. Deployment

### Compose (self-hosted)

```bash
cp backend/.env.example backend/.env.docker   # fill secrets (≥32 chars, distinct JWT/NextAuth)
cp frontend/.env.example frontend/.env.docker
# Optional override for non-localhost clients:
# export NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api
# export SENTRY_RELEASE=$(git rev-parse --short HEAD)
docker compose up --build -d
curl -fsS http://localhost:5001/ready | jq .
curl -fsS http://localhost:5001/version | jq .
```

Compose sets `REQUIRE_REDIS=true` and keeps Mongo/Redis **off the host network**.
Backend readiness probe is `GET /ready`; frontend has its own HTTP healthcheck.

### Probe map

| Probe | Endpoint | Use |
|-------|----------|-----|
| Liveness | `GET /health` | Process up; prod omits disk/memory unless `VANI_HEALTH_DETAILED=true` |
| Readiness | `GET /ready` | **LB / k8s / Compose** — Mongo + Redis (if configured) |
| Release | `GET /version` | `version` + `release` (`SENTRY_RELEASE`) |

### Startup / shutdown

- Boot: `validateEnvironment()` → Sentry init → HTTP listen → async Mongo/Redis.
- Traffic must wait on `/ready` (Mongo may still be connecting when the port opens).
- SIGTERM/SIGINT: stop HTTP → close voice WS, Mongo, Redis, browser, MCP, OCR → flush Sentry → exit (15s force).
- Backend and frontend images use `dumb-init` so signals reach Node.

---

## 2. Monitoring

| Layer | Config | Notes |
|-------|--------|-------|
| Backend Sentry | `SENTRY_DSN`, `SENTRY_RELEASE` | `backend/utils/errorTracking.js` — no-op without DSN |
| Frontend Sentry | `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_RELEASE` | `frontend/lib/monitoring.ts` via `@sentry/nextjs` |
| Logs | stdout JSON (Pino) | Redacts auth headers; scrubs `access_token`/`token` query params |
| Correlation | `X-Request-Id` / `errorId` | Present on 5xx JSON bodies |

**Staging smoke for Sentry:** trigger a handled 500 (or temporary throw), confirm
issue appears with matching `SENTRY_RELEASE`.

**Alerts (minimum):** `/ready` failing >2m, 5xx rate, OOM/restarts, Mongo errors,
disk on uploads + Mongo volume.

---

## 3. Redis

- Production-shaped Compose: `REDIS_URL=redis://redis:6379` + `REQUIRE_REDIS=true`.
- Multi-replica without Redis: `validateEnv` refuses boot.
- `/ready` reports `redis: not_configured` only when Redis is intentionally unset
  (single-instance local without `REQUIRE_REDIS`).
- JWT logout/revoke denylist: local Map + Redis keys `jwt:deny:jti:*` /
  `jwt:deny:tok:*` when Redis is configured (RC2.5).

Verify:

```bash
curl -fsS "$API/ready" | jq '.checks.redis'   # expect true when configured
```

---

## 4. Backup & restore

1. Pre-deploy: `mongodump` (+ uploads volume) — [BACKUP.md](./BACKUP.md).
2. Tooling check: `./scripts/verify-backup.sh` and `./scripts/verify-restore.sh`
3. Optional local dump: `MONGODB_URI=… ./scripts/verify-backup.sh --dump`
4. Validate dump shape: `./scripts/verify-restore.sh --check-dump "$BACKUP_DIR"`
5. Restore drill (staging only, last 30 days):
   `STAGING_MONGODB_URI=… DUMP_DIR=… RESTORE_CONFIRM=YES ./scripts/verify-restore.sh --restore`
   → `API_BASE=… ./scripts/staging-smoke.sh` → sign-in → open known chat → memory decrypt with same `VANI_MEMORY_ENCRYPTION_KEY`.

## 4b. Staging probe smoke

```bash
API_BASE=http://127.0.0.1:5001 ./scripts/staging-smoke.sh
# Expects HTTP 200 from /health, /ready, /version
```

Interactive OAuth + chat remain operator-owned ([LAUNCH_CHECKLIST.md](../LAUNCH_CHECKLIST.md)).

---

## 5. Rollback

1. Redeploy previous immutable image tag / revision.
2. Confirm `GET /version` matches prior release.
3. If schema/data corruption → restore pre-deploy dump (+ uploads).
4. Verify `/ready`, OAuth, one chat stream, Sentry error rate.
5. Postmortem within 24h with `requestId` / `errorId` samples.

Keep prior two releases pullable ≥14 days.

---

## 6. Incident triage (5 minutes)

1. `/health` + `/ready` + recent deploy `/version`
2. Sentry + log drain filtered by `requestId`
3. Contain: disable optional features (`VANI_ENABLE_*`), tighten rate limits, or roll back
4. Never hand-edit prod Mongo without a fresh dump

---

## 7. Public Beta gate reminders

Before open signup, confirm remaining Must-Fix from
[RC1_BLOCKERS.md](./reports/RC1_BLOCKERS.md) (XSS, research/MCP redirect SSRF,
query JWT restrict, Next upgrade, soft-sandbox flags, staging smoke sign-off).
Ops scaffolding in this runbook is necessary but **not sufficient** alone.

---

*RC2-3 Production Hardening Sprint*
