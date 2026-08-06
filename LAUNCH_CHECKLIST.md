# VANI AI — Production Launch Checklist

Use this checklist for the first public production launch and for every
subsequent production deploy. No new user-facing features are implied here —
only operational readiness.

Related docs:

- [docs/OPERATIONS.md](docs/OPERATIONS.md) — deploy / monitor / rollback runbook
- [docs/BACKUP.md](docs/BACKUP.md) — Mongo backup & restore
- [backend/.env.example](backend/.env.example) — backend env reference
- [frontend/.env.example](frontend/.env.example) — frontend env reference
- [docs/reports/PRODUCTION_HARDENING_REPORT.md](docs/reports/PRODUCTION_HARDENING_REPORT.md) — RC2-3 hardening evidence

**Legend:** `[x]` = engineering verified in-repo (RC2-3 / RC2.5). Staging/production
operator sign-off boxes remain unchecked until executed in the target environment.

---

## 1. Deployment steps

### Pre-deploy

- [x] Engineering: CI scripts present (backend tests, frontend tests, build, e2e workflow) — operator confirms green on release SHA
- [x] Engineering: Mongo dump + uploads backup documented; tooling: `./scripts/verify-backup.sh` + `./scripts/verify-restore.sh`
- [x] Engineering: Staging probe smoke script: `API_BASE=… ./scripts/staging-smoke.sh` (`/health`, `/ready`, `/version`)
- [ ] Tag the release (`SENTRY_RELEASE` / git tag) and record `GET /version` from staging
- [ ] Operator: Run CI green on the release SHA
- [ ] Operator: Take a Mongo dump + uploads backup ([docs/BACKUP.md](docs/BACKUP.md))
- [ ] Operator: Confirm staging passed smoke checks (`./scripts/staging-smoke.sh` + sign-in + one chat)

### Configure secrets (production)

Set via your orchestrator / secret manager — **never** commit `.env`:

**Backend (required)**

| Variable | Purpose |
|----------|---------|
| `NODE_ENV=production` | Enables strict env validation + HSTS |
| `PORT` | Listen port (default `5001`) |
| `MONGODB_URI` | Primary database |
| `AUTH_JWT_SECRET` | Backend access-token signing (≥32 chars, **distinct** from NextAuth) |
| `NEXTAUTH_SECRET` | Must match frontend (≥32 chars, distinct from JWT) |
| `GOOGLE_CLOUD_PROJECT` | Vertex / Gemini |
| `GOOGLE_CLOUD_LOCATION` | Vertex / Gemini region |
| `VANI_MEMORY_ENCRYPTION_KEY` | Memory at-rest encryption |
| `NEXT_PUBLIC_APP_URL` / `CORS_ORIGINS` | Allowed browser origins |

**Backend (required for Public Beta / multi-replica)**

| Variable | Purpose |
|----------|---------|
| `REDIS_URL` or `REDIS_HOST` | Shared rate limits (Compose sets `REQUIRE_REDIS=true`) |
| `REQUIRE_REDIS=true` | Fail closed if Redis missing |

**Backend (strongly recommended)**

| Variable | Purpose |
|----------|---------|
| `SENTRY_DSN` | Error tracking |
| `SENTRY_RELEASE` | Release correlation (`GET /version`) |
| `LOG_LEVEL=info` | Structured JSON logs |
| `TRUST_PROXY=1` | Real client IP behind LB (default on in prod) |
| `GOOGLE_APPLICATION_CREDENTIALS` or workload identity | GCP auth |
| `TAVILY_API_KEY` if `TAVILY_ENABLED=true` | Research search |

**Frontend (required)**

| Variable | Purpose |
|----------|---------|
| `NEXTAUTH_SECRET` | NextAuth sessions (match backend) |
| `NEXTAUTH_URL` | Canonical site URL |
| `AUTH_JWT_SECRET` | Mint backend tokens (match backend) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth |
| `NEXT_PUBLIC_APP_URL` | Public site URL |
| `NEXT_PUBLIC_API_BASE_URL` | Backend API base when API is on another origin (bake-arg / env) |

**Frontend (recommended)**

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SENTRY_DSN` | Client error reporting (`@sentry/nextjs`) |
| `NEXT_PUBLIC_SENTRY_RELEASE` | Match backend `SENTRY_RELEASE` |

Ensure `ALLOW_DEV_AUTH` / `NEXT_PUBLIC_ALLOW_DEV_AUTH` are **unset or false**.  
Ensure `FEATURE_GATING_DISABLED`, `MCP_DEBUG`, `BROWSER_DEBUG`, `VANI_DEBUG` are **unset or false** (production boot refuses these).

### Deploy

```bash
# Example: Docker Compose self-hosted (see docs/OPERATIONS.md)
cp backend/.env.example backend/.env.docker   # fill secrets
cp frontend/.env.example frontend/.env.docker # fill secrets
# Non-localhost clients:
# export NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api
# export SENTRY_RELEASE=$(git rev-parse --short HEAD)
docker compose up --build -d

# Verify probes
curl -fsS "$API/health" | jq .
curl -fsS "$API/ready"  | jq .
curl -fsS "$API/version"| jq .
```

Or your platform equivalent (Cloud Run / Fly / k8s). Wire:

- Liveness → `GET /health` (or process check)
- Readiness → `GET /ready` (Compose + backend Dockerfile HEALTHCHECK)
- Deploy verification → `GET /version` matches the intended release

### Post-deploy smoke

Engineering tooling (run against a live API):

```bash
API_BASE=http://127.0.0.1:5001 ./scripts/staging-smoke.sh
```

Operator (per environment):

- [ ] `GET /ready` → `200` with Redis healthy when `REQUIRE_REDIS=true` (or via `staging-smoke.sh`)
- [ ] `GET /version` → expected `version` / `release`
- [ ] Security headers present (`Content-Security-Policy`, `X-Frame-Options`,
      `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security` on HTTPS)
      — API via `securityHeaders`; app origin via Next `headers()` (RC2.5)
- [ ] Google sign-in works
- [ ] Create a chat, send a message, receive a stream
- [ ] Upload a small file
- [ ] Confirm structured JSON logs include `requestId` (`X-Request-Id`)
- [ ] Trigger a handled 500 in staging and confirm `errorId` in the JSON body + logs (+ Sentry if DSN set)

---

## 2. Required environment variables (summary)

Validated strictly when `NODE_ENV=production` by
`backend/config/validateEnv.js`:

1. `AUTH_JWT_SECRET` **and** `NEXTAUTH_SECRET` — distinct, each ≥32 characters
2. `MONGODB_URI`
3. `GOOGLE_CLOUD_PROJECT` + `GOOGLE_CLOUD_LOCATION`
4. `GOOGLE_APPLICATION_CREDENTIALS` — only if set, must be readable
5. `TAVILY_API_KEY` — only if `TAVILY_ENABLED=true`
6. `VANI_MEMORY_ENCRYPTION_KEY`
7. `FEATURE_GATING_DISABLED` must not be `true`
8. `REDIS_URL` / `REDIS_HOST` when `REQUIRE_REDIS=true` or replica count > 1
9. Debug flags (`MCP_DEBUG`, `BROWSER_DEBUG`, `VANI_DEBUG`) must not be enabled

Full annotated lists: `backend/.env.example`, `frontend/.env.example`.

---

## 3. Rollback plan

See [docs/OPERATIONS.md](docs/OPERATIONS.md) §5. Summary:

1. **Stop the bad deploy** (scale to previous revision / redeploy prior image tag).
2. **Confirm identity**: previous image digest + prior `GET /version` release.
3. **Data decision**:
   - No schema/data corruption → app rollback only.
   - Corruption / bad migrations → restore pre-deploy Mongo dump (+ uploads)
     per [docs/BACKUP.md](docs/BACKUP.md).
4. **Re-point DNS / LB** only if the rollback target is a different service.
5. **Verify**: `/ready`, sign-in, one chat, Sentry/error rate back to baseline.
6. **Postmortem** within 24h — capture `errorId` / `requestId` samples.

Keep the previous two release artifacts (images + env snapshot) immutable and
pullable for at least 14 days.

---

## 4. Monitoring checklist

Engineering (in-repo):

- [x] Backend Sentry module present (`@sentry/node` + `errorTracking.js`); activates when `SENTRY_DSN` set
- [x] Frontend Sentry wired (`@sentry/nextjs` via `lib/monitoring.ts`); activates when `NEXT_PUBLIC_SENTRY_DSN` set
- [x] Access-log URL scrubbing for `access_token` / `token` query params
- [x] `/health` capacity detail gated in production (`VANI_HEALTH_DETAILED` for internal use)

Operator (per environment):

- [ ] `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` set; sample issue received from staging
- [ ] `SENTRY_RELEASE` / `NEXT_PUBLIC_SENTRY_RELEASE` match deploy tag
- [ ] Log drain shipping stdout JSON (CloudWatch / Datadog / GCP Logging)
- [ ] Alerts on:
  - [ ] `/ready` failing for > 2 minutes
  - [ ] 5xx rate above baseline
  - [ ] Process restarts / OOM
  - [ ] Mongo connection errors in logs (`[mongo]`)
  - [ ] Disk / volume usage on uploads + Mongo
- [ ] Uptime check hitting `/health` or `/ready` from outside the cluster
- [ ] Metrics hooks active (`http.requests`, `http.errors`,
      `http.request.duration` via `backend/utils/metrics.js` — wire an external
      sink with `setMetricsSink` when you add Prometheus/Datadog) — **v1.0 / Should-Fix**

---

## 5. Backup checklist

Engineering (in-repo):

- [x] Backup/restore documented ([docs/BACKUP.md](docs/BACKUP.md))
- [x] Tooling verifier script (`./scripts/verify-backup.sh`)
- [x] Restore tooling verifier (`./scripts/verify-restore.sh`) — dry-run recipe + gated `--restore`
- [x] Staging probe smoke (`./scripts/staging-smoke.sh`)

Operator (per environment):

- [ ] Daily automated `mongodump` (or Atlas continuous backup) verified this week
- [ ] Pre-deploy dump completed and stored off-box
- [ ] Uploads volume included when files are on disk
- [ ] `VANI_MEMORY_ENCRYPTION_KEY` backed up in secret manager (separate from git)
- [ ] Restore drill to staging succeeded in the last 30 days
- [ ] Retention ≥ 14 days; access limited to on-call + platform admins

---

## 6. Incident response checklist

1. **Detect** — alert, Sentry issue, or user report.
2. **Triage** (5 min) — check `/health`, `/ready`, error rate, recent deploy.
3. **Contain** — feature-flag off (`VANI_ENABLE_*`), rate-limit tighten, or
   rollback if a release is implicated.
4. **Correlate** — grab `requestId` (`X-Request-Id`) and `errorId` from the
   API error body / logs / Sentry tags.
5. **Communicate** — status page / known-issue note if user-visible.
6. **Remediate** — fix forward or restore from backup; never “fix” prod data
   by hand without a dump.
7. **Verify** — smoke checklist above green; alerts cleared.
8. **Document** — timeline, root cause, follow-ups within 24h.

On-call tips: [docs/OPERATIONS.md](docs/OPERATIONS.md) §6.

---

## 7. Security headers (verify)

Production API responses should include:

| Header | Expected |
|--------|----------|
| `Content-Security-Policy` | `default-src 'none'; … frame-ancestors 'none'` |
| `Strict-Transport-Security` | present on HTTPS (`NODE_ENV=production`) |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `no-referrer` |
| `Permissions-Policy` | camera/microphone/geolocation disabled |
| `X-Content-Type-Options` | `nosniff` |

Implemented in `backend/middleware/securityHeaders.js`.

---

## 8. Probe reference

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /health` | none | Liveness; prod omits disk/memory unless `VANI_HEALTH_DETAILED=true` |
| `GET /ready` | none | **LB / k8s / Compose readiness gate** |
| `GET /version` | none | Build / release identity |

---

## 9. Performance gates (Public Beta)

Engineering (RC2-2):

- [x] `/` first-load uncompressed JS ≤ **1.8 MB** (measured **1.252 MB**; CI `frontend npm run bundle:budget`)
- [x] Express compression enabled; SSE (`text/event-stream`) not compressed
- [x] Redis required when replica count > 1 or `REQUIRE_REDIS=true` (Compose sets it)
- [x] OCR sidecar skip when `extractedText` present; worker pool default 2
- [x] Slim Docker: browser/CI install args default **false**; FE `dumb-init` + healthcheck

Operator:

- [ ] Staging chat TTFT smoke (no-file path) recorded vs pre-RC2-2 baseline

---

## 10. Infrastructure gates (RC2-3 / RC2.5)

- [x] Compose Mongo/Redis not published to host (internal network only)
- [x] Compose backend `REQUIRE_REDIS=true` + FE healthcheck
- [x] Backend Dockerfile HEALTHCHECK → `/ready`
- [x] Frontend Dockerfile `dumb-init` + HEALTHCHECK
- [x] Production secret strength + distinct JWT/NextAuth enforced at boot
- [x] Production debug-flag refuse at boot
- [x] Operational runbook published (`docs/OPERATIONS.md`)
- [x] Redis JWT denylist (local + Redis) for multi-replica logout (RC2.5 / RC1-B11)
- [x] Frontend CSP headers (RC2.5 / RC1-B07)
- [x] Staging probe + restore tooling scripts (RC2.5 / RC1-B25 eng slice)

---

## Sign-off

| Role | Name | Date | Notes |
|------|------|------|-------|
| Eng | | | RC2-3 + RC2.5 engineering items checked above |
| On-call | | | Staging smoke + alerts |
| Launch approval | | | Public Beta — remaining High Must-Fix may still apply (see RC25 report) |
