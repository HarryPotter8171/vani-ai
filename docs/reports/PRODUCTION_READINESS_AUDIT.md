# VANI AI — Production Readiness Audit

**Date:** 2026-08-06  
**Role:** Release Engineering Lead  
**Phase / Task:** RC1-L1 — Production Readiness Audit (inspect & report only; no application source changes)  
**Companions:** [PERFORMANCE_AUDIT.md](./PERFORMANCE_AUDIT.md), [PERFORMANCE_IMPLEMENTATION_PLAN.md](./PERFORMANCE_IMPLEMENTATION_PLAN.md), [SECURITY_AUDIT.md](./SECURITY_AUDIT.md), [REGRESSION_AUDIT.md](./REGRESSION_AUDIT.md), [LAUNCH_CHECKLIST.md](../../LAUNCH_CHECKLIST.md), [docs/BACKUP.md](../BACKUP.md)

---

## Executive summary

Infrastructure **scaffolding is solid** (multi-stage Docker, non-root, env fail-closed for core secrets, `/health` `/ready` `/version`, CI, graceful shutdown, backup runbook). **Operational and security gates are not closed**: launch checklist is **0/24 checked**, Redis often absent, compose publishes unauthenticated data stores, MCP/browser privileged surfaces remain dangerous, and prior RC1 audits still say **NO-GO** for Public Beta.

| | |
|--|--|
| **Overall Readiness Score** | **4.8 / 10** |
| **Verdict** | **No-Go** for Public Beta |
| **Conditional Go** | Locked **private/staging** only — Redis on, MCP stdio off, browser isolated/off, secrets in manager, LB on `/ready` |
| **Public Beta blockers** | See below (security + ops + performance Phase A) |

### Score breakdown

| Area | Score | Notes |
|------|------:|-------|
| Production build artifacts | 7.0 | FE standalone build present; BE syntax “build”; Dockerfiles exist; compose untested in CI |
| Configuration / secrets | 5.5 | Core validateEnv fail-closed; kill-switches & weak-secret checks missing |
| Infrastructure | 5.0 | Mongo/probes good; Redis optional; backups documented not proven |
| Deployment / CI | 6.0 | CI covers tests+build+e2e; no Docker image job; perf non-blocking |
| Monitoring | 4.0 | Backend Sentry optional; FE Sentry stub; metrics sink unwired; alerts unchecked |
| Release ops | 3.0 | Checklist 0/24; rollback doc only; no automated backup evidence |

---

## Method

1. Read RC1 performance, security, and regression audits + launch/backup docs.  
2. Inspect Dockerfiles, `docker-compose.yml`, `validateEnv.js`, CI, `server.js`, health/Sentry/monitoring, env examples.  
3. Live probe (local): `/ready` → mongo true, **redis not_configured**; `/version` → `env: development`, `release: null`.  
4. Confirm prior FE build: `.next/BUILD_ID` + `standalone` present.  
5. Count `LAUNCH_CHECKLIST.md` items: **24 unchecked, 0 checked**.  

**Not executed this pass:** fresh `docker compose build`, full production `NODE_ENV=production` boot with all secrets, restore drill, live Sentry issue.

---

## 1. Production build

| Check | Status | Evidence |
|-------|--------|----------|
| Frontend `next build` | **Capable** | Scripts `build`/`start`; `output: 'standalone'`; prior `.next/standalone` + BUILD_ID `nWO1ACnXEwNP6yLrqgRGS` |
| Frontend Dockerfile | **Present** | Multi-stage, non-root `vani`, HEALTHCHECK `/` |
| Backend start | **Capable** | `node server.js`; Dockerfile + `dumb-init` |
| Backend “build” | **Syntax only** | `scripts/checkSyntax.js` — not a TS compile gate for all modules |
| Docker Compose | **Present / risky** | `NODE_ENV=production`, health deps; **publishes 27017/6379** unauthenticated |
| CI Build job | **Present** | Backend syntax + frontend `next build` |
| Docker image in CI | **Missing** | No `docker build` job |

### Gaps

| ID | Severity | Description | Recommendation | Effort |
|----|----------|-------------|----------------|--------|
| PR-B1 | High | Compose publishes Mongo/Redis host ports without auth | Remove host ports or bind `127.0.0.1` + auth | S |
| PR-B2 | Medium | Compose FE bake-args `NEXT_PUBLIC_API_BASE_URL=http://localhost:5001/api` | Per-env public API URL build-arg | S |
| PR-B3 | Medium | Backend image defaults install Playwright + CI Python | Lean defaults / slim vs full images | S |
| PR-B4 | Medium | No Docker build/smoke in CI | Add image build (+ optional compose smoke) | M |
| PR-B5 | Low | `next.config` does not pin `compress` / `productionBrowserSourceMaps` / `poweredByHeader` | Explicit prod flags | XS |

---

## 2. Configuration

| Check | Status | Evidence |
|-------|--------|----------|
| Env validation (core) | **Pass** | `validateEnv.js` fails closed in production for JWT/NEXTAUTH, Mongo, GCP, memory key |
| `.env.example` | **Pass** | Backend/frontend annotated |
| Dev auth in prod | **Pass** | `ALLOW_DEV_AUTH` gated off when `NODE_ENV=production` |
| Feature gating kill-switch | **Fail** | `FEATURE_GATING_DISABLED` not blocked by validateEnv |
| Secret strength | **Fail** | Presence only — no entropy / placeholder rejection |
| Logging | **Pass** | Pino JSON, redaction of auth/cookie/token fields |
| Redis required | **Partial** | Recommended in checklist; not required by validateEnv |

### Gaps

| ID | Severity | Description | Recommendation | Effort |
|----|----------|-------------|----------------|--------|
| PR-C1 | Critical | `FEATURE_GATING_DISABLED` can open all plans in prod | Refuse boot in production if set | S |
| PR-C2 | High | Weak/shared secrets allowed | Min length + distinct JWT vs NextAuth secrets | S |
| PR-C3 | High | Redis not required → process-local rate limit / revoke | Require `REDIS_URL` for multi-replica / Public Beta | S |
| PR-C4 | Medium | Billing webhook unsigned path soft-accepts | Fail closed when gateways enabled | S |
| PR-C5 | Medium | Debug flags (`MCP_DEBUG`, etc.) can leak if set | Forbid in prod compose / checklist | XS |

---

## 3. Infrastructure

| Check | Status | Evidence |
|-------|--------|----------|
| Mongo | **Pass** | Required; live `/ready` mongo true |
| Redis | **Gap** | Live `redis: not_configured`; compose has Redis but local smoke without it |
| Health / ready / version | **Pass** | Implemented; compose backend probes `/ready` |
| Backups | **Doc only** | `docs/BACKUP.md` mongodump/restore + uploads + memory key |
| Restore drill | **Unchecked** | Launch checklist not executed |
| Indexes | **Pass (code)** | Mongoose indexes on core models; no formal migration framework |
| Migrations | **Absent** | Schema evolution via code + dumps only; Chat/ChatV2 dual exists |

### Gaps

| ID | Severity | Description | Recommendation | Effort |
|----|----------|-------------|----------------|--------|
| PR-I1 | High | No evidence of automated daily backup / restore drill | Automate mongodump; run restore drill before beta | M (ops) |
| PR-I2 | Medium | No migration framework; Chat vs ChatV2 dual | Document SoR; pre-deploy dumps; avoid dual-write surprises | M |
| PR-I3 | Medium | Listen before Mongo ready | LB must use `/ready`; optional delay listen | S |
| PR-I4 | Medium | `/health` exposes capacity diagnostics unauthenticated | Restrict rich health to internal network | S |
| PR-I5 | Low | Version `release: null` on live instance | Set `SENTRY_RELEASE` / git tag on deploys | S |

---

## 4. Deployment

| Check | Status | Evidence |
|-------|--------|----------|
| CI/CD | **Partial** | Unit/integration/security, FE tests, build, e2e; perf `continue-on-error: true` |
| Startup | **Pass w/ race** | validateEnv → createApp → listen → async Mongo/Redis |
| Graceful shutdown | **Pass** | SIGTERM/SIGINT closes HTTP, Mongo, Redis, browser, MCP, OCR; 15s force |
| Monitoring | **Partial** | Backend Sentry when DSN set; FE `lib/monitoring.ts` is **stub** (no `@sentry/nextjs`) |
| Metrics | **Stub** | `setMetricsSink` unwired |
| Rate limiting | **Pass w/ caveat** | Redis Lua when configured; memory fallback otherwise |
| HTTPS | **Assumed** | HSTS on API in prod; NextAuth secure cookie when HTTPS/`production` |

### Gaps

| ID | Severity | Description | Recommendation | Effort |
|----|----------|-------------|----------------|--------|
| PR-D1 | High | Frontend Sentry not actually wired | Install `@sentry/nextjs` or remove DSN expectation | S |
| PR-D2 | High | Alerts / log drain / uptime unchecked | Execute monitoring checklist §4 | M (ops) |
| PR-D3 | Medium | SSE can delay shutdown up to 15s | Drain + client reconnect signal | M |
| PR-D4 | Medium | CI performance non-blocking; no Docker job | Block on critical budgets; add image build | M |
| PR-D5 | Medium | Rate-limit XFF spoof risk (security audit) | Key by `req.ip` / user id correctly | S |
| PR-D6 | Low | Metrics sink optional | Wire Prometheus/Datadog before scale | M |

---

## 5. Release

| Check | Status | Evidence |
|-------|--------|----------|
| Launch checklist | **Fail** | **0 / 24** items checked |
| Operational checklist | **Doc present** | Pre/post deploy steps written |
| Rollback readiness (docs) | **Pass** | Checklist §3 + BACKUP.md pairing |
| Rollback readiness (ops) | **Fail** | No proven recent dump / immutable prior images evidenced |
| Recovery plan | **Doc present** | Restore steps in BACKUP.md |

### Gaps

| ID | Severity | Description | Recommendation | Effort |
|----|----------|-------------|----------------|--------|
| PR-R1 | High | Entire launch checklist unchecked | Execute before any Public Beta claim | S–M (ops) |
| PR-R2 | High | No signed-off staging smoke this audit | Staging: `/ready`, OAuth, chat, upload | S |
| PR-R3 | Medium | No release tag / `SENTRY_RELEASE` discipline evidenced | Tag + record `/version` | S |

---

## Cross-cutting Public Beta blockers (from RC1 audits — still open)

These are **production readiness blockers**, not newly invented:

| # | Blocker | Source |
|---|---------|--------|
| 1 | MCP stdio host RCE | SECURITY SEC-C1 |
| 2 | Unauthenticated compose Mongo/Redis ports | SECURITY SEC-C2 / PR-B1 |
| 3 | Browser SSRF (private/metadata) | SECURITY SEC-C3 |
| 4 | `FEATURE_GATING_DISABLED` kill-switch | SECURITY SEC-C4 / PR-C1 |
| 5 | Canvas XSS + markdown dangerous hrefs | SECURITY SEC-H4/H5 |
| 6 | First-load JS ~2.28 MB regression | PERFORMANCE FE-C1 / Phase A |
| 7 | Chat TTFT serial pre-stream / OCR | PERFORMANCE BE-C1 / Phase A |
| 8 | Redis optional under multi-replica (limits + logout) | PERF INF-C2 / SEC-H7 / PR-C3 |
| 9 | Launch checklist + backups not operationally proven | PR-R1 / PR-I1 |
| 10 | Regression verdict **NO-GO** until 1–9 addressed | REGRESSION_AUDIT |

---

## Must Fix Before Beta

1. **Disable MCP stdio** (or allowlist + scrubbed env) for multi-tenant.  
2. **Unpublish / authenticate** Mongo & Redis in any internet-reachable compose.  
3. **SSRF-harden** browser + research redirects + remote MCP.  
4. **Fail closed** on `FEATURE_GATING_DISABLED` + weak secrets in production.  
5. **Sanitize** canvas richtext + markdown URL schemes.  
6. **Require Redis** for Public Beta / any multi-replica; shared JWT denylist.  
7. **Performance Phase A** (bundle ≤1.8 MB, TTFT, OCR dedupe, compression).  
8. **Execute launch checklist**: staging smoke, secrets manager, pre-deploy dump, Sentry sample, alerts.  
9. **Wire FE monitoring** or stop claiming Sentry client coverage.  
10. **Re-run** Playwright user journey + Stop/Continue coverage on staging.

---

## Should Fix

| Item | Why |
|------|-----|
| Upgrade Next (≥16.3.0); isolate/replace `xlsx` | Known high advisories |
| Docker build in CI + lean image defaults | Late deploy failures / surface |
| Unsigned billing webhooks → 400 in prod | Silent misconfig |
| Align probes (`/ready` everywhere); delay listen or grace period | Flaky deploys |
| Scope 30mb JSON; tighten rate limits | DoS posture |
| Document Chat/ChatV2 SoR; pre-deploy dump discipline | Rollback safety |
| SSE drain on shutdown | Cleaner rolling deploys |
| Frontend compose API URL for non-localhost | Broken remote clients |
| Restrict public `/health` diagnostics | Recon |

---

## Nice To Have

| Item | Why |
|------|-----|
| Pin Next `compress` / hide `X-Powered-By` / explicit no browser source maps | Explicit posture |
| Prometheus/Datadog metrics sink | SLOs |
| Formal migration tooling | Schema evolution |
| `VOICE_ENGINE=live` soak before default | Voice risk |
| Backend `tsc` gate for TS modules | Stronger “build” |
| PDF Intelligence product UI (or drop claims) | Product honesty |
| Agent/browser warm pools | Latency polish |

---

## Already production-capable (keep)

- Core env fail-closed for chat/GCP/memory secrets  
- API security headers + prod HSTS  
- Structured logging with redaction + request IDs  
- `/health`, `/ready`, `/version`  
- Backend graceful shutdown + `dumb-init`  
- Multi-stage non-root Dockerfiles + `.dockerignore` excluding `.env`  
- Redis-backed rate limits when configured  
- CI: backend tests, frontend tests, FE production build, Playwright e2e  
- Backup/restore documentation + rollback narrative  
- Dev auth disabled when `NODE_ENV=production`  
- Ownership / JWT auth foundations (prior hardening)  
- Prior FE standalone build artifact present  

---

## Overall Readiness Score: **4.8 / 10**

Weighted for a public multi-tenant AI SaaS:

- Code/infra scaffolding above average (+)  
- Security Criticals + unchecked ops (−−)  
- Performance Phase A not started (−)  
- Monitoring incomplete (−)  
- Regression already **NO-GO** (−)

---

## Verdict: **No-Go** (Public Beta)

| Path | Decision |
|------|----------|
| **Public Beta** | **No-Go** |
| **Private dogfood / staging** | **Conditional Go** if Redis on, MCP stdio off, browser off or isolated, secrets in manager, LB on `/ready`, FEATURE_GATING_DISABLED unset |
| **Compose “production” on a public IP as-is** | **No-Go** (DB ports) |

---

## Suggested next step

**RC1-FINAL — Release Blocker Consolidation:** single ranked blocker list merging this report with Performance Phase A, Security top 10, and Regression Must-Fix into one executable board.

---

## Audit constraints

- **No application source code modified**  
- Findings from inspection, prior RC1 audits, live local probes, and checklist counts only  

---

*End of RC1-L1 Production Readiness Audit.*
