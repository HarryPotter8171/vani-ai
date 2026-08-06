# VANI AI — Production Hardening Report (RC2-3)

**Date:** 2026-08-06  
**Role:** Release Engineering Lead  
**Phase / Task:** RC2-3 Production Hardening Sprint  
**Sources:** [RC1_BLOCKERS.md](./RC1_BLOCKERS.md), [PRODUCTION_READINESS_AUDIT.md](./PRODUCTION_READINESS_AUDIT.md), [SECURITY_FIX_REPORT.md](./SECURITY_FIX_REPORT.md), [PERFORMANCE_FIX_REPORT.md](./PERFORMANCE_FIX_REPORT.md)

**Constraint:** No new features, no UI redesign, no unrelated refactors — ops / monitoring / infra / launch gates only.

---

## Executive summary

RC2-3 closes the **engineering** side of production hardening called out for Public Beta ops: frontend Sentry is real (no longer a stub), production env validation is stricter, Redis is required in the production-shaped Compose stack, `/health` no longer leaks capacity diagnostics by default, logs scrub query tokens, and launch/ops docs are executable.

**Staging operator gates** (live Sentry sample, restore drill, alert wiring, signed smoke) remain **unchecked** — they need a real environment. Public Beta stays **No-Go** until remaining Must-Fix security/product blockers also clear.

| Area | Result |
|------|--------|
| Launch checklist | Updated; engineering items checked; obsolete gaps clarified |
| Frontend Sentry | `@sentry/nextjs` wired via `lib/monitoring.ts` |
| Backend Sentry | Validated with unit tests (init / no-op / no double-init) |
| Health / logging | Prod `/health` minimal; URL token scrub in access logs |
| Redis / Docker | Compose `REQUIRE_REDIS=true`; FE healthcheck; bake-arg overrides |
| Ops | `docs/OPERATIONS.md` + `scripts/verify-backup.sh` |
| **Readiness (ops scaffolding)** | Audit **4.8 → ~6.5 / 10** (est.) |
| **Public Beta** | **No-Go** (remaining Must-Fix) / **Conditional Go** staging |

---

## Items completed

### 1. Launch checklist (RC1-B25 engineering slice)

- Rewrote [LAUNCH_CHECKLIST.md](../../LAUNCH_CHECKLIST.md):
  - Separates **engineering verified** vs **operator** checkboxes
  - Documents Public Beta Redis requirement, distinct ≥32-char secrets, debug-flag refuse
  - Links [docs/OPERATIONS.md](../OPERATIONS.md) and this report
  - Marks RC2-2 perf gates + RC2-3 infra gates `[x]` where code proves them
  - Removes implicit claim that “docs exist = ops done”
- Staging smoke / secrets-manager / alert sign-off still **operator-owned** (unchecked)

### 2. Monitoring (RC1-B26 / PR-D1 engineering slice)

| Item | Change |
|------|--------|
| Frontend Sentry | Installed `@sentry/nextjs`; `initMonitoring` dynamically inits SDK when `NEXT_PUBLIC_SENTRY_DSN` set; `captureException` / `captureMessage` forward to Sentry |
| FE Dockerfile / Compose | Bake-args for `NEXT_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_RELEASE` |
| Backend Sentry | Existing `@sentry/node` path covered by new unit tests |
| Logging | `scrubUrlForLogs` redacts `access_token` / `token` (and related) query params in HTTP access logs |
| Health | Production `/health` returns mongo/redis only; set `VANI_HEALTH_DETAILED=true` for capacity (PR-I4) |

### 3. Infrastructure

| Item | Change |
|------|--------|
| Redis | Compose sets `REQUIRE_REDIS=true` + `REDIS_URL`; fail-closed when missing |
| Secret strength (PR-C2 / RC1-B13) | Production requires distinct `AUTH_JWT_SECRET` and `NEXTAUTH_SECRET`, each ≥32 chars, no weak placeholders |
| Debug flags (PR-C5) | Production refuses `MCP_DEBUG` / `BROWSER_DEBUG` / `VANI_DEBUG` when truthy |
| Docker FE | Compose frontend `healthcheck`; API URL build-arg overridable via env |
| Probes | Backend HEALTHCHECK already `/ready` (RC2-2); documented in runbook |

### 4. Operations

| Artifact | Purpose |
|----------|---------|
| [docs/OPERATIONS.md](../OPERATIONS.md) | Deploy, probes, Redis, monitoring, backup, rollback, incident triage |
| [scripts/verify-backup.sh](../../scripts/verify-backup.sh) | Confirms `mongodump`/`mongorestore` present; optional `--dump` |
| Launch checklist §3 / §5 | Rollback + backup operator steps retained |

**Backup tooling verification this pass:** `./scripts/verify-backup.sh` → **OK** (`mongodump` / `mongorestore` present). Full restore drill to staging **not** executed (no staging DB in this sprint).

---

## Verification evidence

```
# Backup tooling
./scripts/verify-backup.sh
→ OK: mongodump / mongorestore

# Backend unit
npx vitest run \
  tests/unit/config/validateEnv.test.js \
  tests/unit/controllers/healthController.test.js \
  tests/unit/utils/errorTracking.test.js \
  tests/unit/utils/loggerScrub.test.js \
  tests/unit/app/probesAndHeaders.test.js
→ Test Files  5 passed · Tests  31 passed

# Frontend unit
npx vitest run tests/unit/lib/monitoring.test.ts
→ Test Files  1 passed · Tests  4 passed
```

---

## Remaining production blockers

Still required before **Public Beta** open signup (from [RC1_BLOCKERS.md](./RC1_BLOCKERS.md); not in RC2-3 scope):

| ID | Item | Severity |
|----|------|----------|
| RC1-B06 | Research + remote MCP SSRF (redirects / DNS) | Critical |
| RC1-B07 | Canvas richtext XSS + markdown dangerous hrefs | Critical |
| RC1-B11 (complete) | Redis JWT `jti` denylist across replicas | Critical (policy slice done; denylist open) |
| RC1-B12 | Restrict query-string bearer tokens (logs scrubbed; accept path remains) | High |
| RC1-B14 | Upgrade Next.js ≥16.3.0 | High |
| RC1-B15 | Rate-limit IP keying (XFF) | High |
| RC1-B16 | Unsigned billing webhooks fail closed | High |
| RC1-B25 (ops) | Staging smoke + secrets manager + checklist operator sign-off | Critical |
| RC1-B26 (ops) | Live restore drill + Sentry sample issue + alerts/uptime | High |
| RC1-B27 | Playwright journey + Stop/Continue coverage | High |
| RC1-B28 | Isolate / flag soft sandboxes for Public Beta tenants | High |

**Should-Fix / Can-Wait** (v1.0+): metrics sink, CDN, vector RAG, message storage, xlsx, etc. — unchanged.

---

## Updated readiness assessment

| Area | RC1-L1 audit | After RC2-3 |
|------|-------------:|------------:|
| Production build artifacts | 7.0 | **~7.5** (FE healthcheck, Sentry bake-args) |
| Configuration / secrets | 5.5 | **~8.0** (strength, distinct secrets, debug refuse, Redis gate) |
| Infrastructure | 5.0 | **~7.0** (Redis required in Compose; health gated) |
| Deployment / CI | 6.0 | **~6.5** (docs/runbook; Docker CI image job still open) |
| Monitoring | 4.0 | **~7.0** (FE Sentry wired; BE tested; alerts still operator) |
| Release ops | 3.0 | **~6.0** (checklist + runbook + backup script; drills unchecked) |
| **Overall (est.)** | **4.8** | **~6.5 / 10** |

Security Criticals (RC2-1) and Phase A perf (RC2-2) already applied; residual Must-Fix security/XSS/SSRF and unexecuted staging gates keep the score below launch-ready.

---

## Public Beta recommendation

| Path | Decision |
|------|----------|
| **Public Beta (open signup)** | **No-Go** |
| **Private / staging dogfood** | **Conditional Go** if Redis on (`REQUIRE_REDIS`), MCP stdio off, browser off or isolated, secrets in manager (strong + distinct), LB on `/ready`, gating/debug kill-switches unset, FE/BE Sentry DSNs set |
| **Compose on a public IP** | **No-Go** unless Mongo/Redis stay unpublished (current Compose) **and** remaining Must-Fix closed |

**Next:** **RC2-4 Final Verification Sprint** — re-run journey/regression evidence, staging smoke sign-off, residual Must-Fix triage, and go/no-go re-score.

---

## Files touched (high level)

- `frontend/lib/monitoring.ts`, `frontend/package.json` (+ lock), `frontend/Dockerfile`, `frontend/.env.example`, `frontend/tests/unit/lib/monitoring.test.ts`
- `backend/config/validateEnv.js`, `backend/controllers/healthController.js`, `backend/utils/logger.js`, `backend/.env.example`
- `backend/tests/unit/config/validateEnv.test.js`, `healthController.test.js`, `utils/errorTracking.test.js`, `utils/loggerScrub.test.js`
- `docker-compose.yml`, `LAUNCH_CHECKLIST.md`, `docs/OPERATIONS.md`, `scripts/verify-backup.sh`
- This report; `CURRENT_STATUS.md`, `docs/management/CHANGELOG.md`, `docs/management/SPRINT_BOARD.md`

---

## Board transition

| From | To |
|------|----|
| RC2-3 Production Hardening Sprint | **Review** |
| Next Current Task | **RC2-4 Final Verification Sprint** |

---

*End of RC2-3 Production Hardening Report.*
