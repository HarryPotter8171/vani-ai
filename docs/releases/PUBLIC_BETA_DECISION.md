# VANI AI — Public Beta Release Decision

**Role:** Release Manager  
**Decision date:** 2026-08-06  
**Constraint:** Release decision only — **no application source code modified**  
**Evidence:** [FINAL_VERIFICATION_REPORT.md](../reports/FINAL_VERIFICATION_REPORT.md), [RC25_CRITICAL_FIX_REPORT.md](../reports/RC25_CRITICAL_FIX_REPORT.md), [PRODUCTION_HARDENING_REPORT.md](../reports/PRODUCTION_HARDENING_REPORT.md), [RC1_BLOCKERS.md](../reports/RC1_BLOCKERS.md)  
**Ops companions:** [LAUNCH_CHECKLIST.md](../../LAUNCH_CHECKLIST.md), [docs/OPERATIONS.md](../OPERATIONS.md)

---

## 1. Release Version

| | |
|--|--|
| **Version** | **`1.0.0-beta.1`** |
| **Codename** | Public Beta |
| **Tag (when cut)** | `v1.0.0-beta.1` |
| **SENTRY_RELEASE** | Match git tag / short SHA at deploy time |

---

## 2. Release Date

**TBD** — pending operator staging sign-off and deploy window.

Engineering freeze for Critical Public Beta blockers is complete (RC2.5). Calendar date is owned by the operator after checklist boxes in [LAUNCH_CHECKLIST.md](../../LAUNCH_CHECKLIST.md) are signed.

---

## 3. Overall Product Score

| Metric | Value |
|--------|------:|
| **Overall Product Score** | **7.6 / 10** |
| Product journeys / regression | ~7.5 |
| Security (Critical residual closed) | ~7.5 |
| Performance (Phase A) | ~7.2 |
| Production ops scaffolding | ~7.0 |

Score lifted from RC2-4 **7.2** after RC2.5 closed XSS, research/MCP SSRF redirects, Redis JWT denylist, and engineering staging tooling. High Must-Fix items and unexecuted operator gates still temper open-signup confidence.

---

## 4. Current Status

### **Conditional GO**

| Path | Decision |
|------|----------|
| **Public Beta (open signup)** | **Conditional GO** |
| **Private / staging dogfood** | **GO** once operator probe + sign-in smoke complete |
| **Compose on a public IP** | **NO-GO** unless Mongo/Redis remain unpublished (current Compose) |

**Rationale**

- Remaining **Critical blockers in application code: 0** (RC1-B06, B07, B11 denylist, B25 eng slice closed in RC2.5).
- Automated evidence is green: backend `test:ci` PASS, FE **192** passed, production build PASS, Playwright `userJourney.spec.ts` PASS, backup/restore tooling OK.
- **Operator-owned gates remain open:** live staging secrets manager, interactive sign-in + chat smoke, checklist sign-off, live restore drill, Sentry sample + alerts/uptime.
- **High Must-Fix** items remain (query-string bearer, Next ≥16.3.0, rate-limit XFF, unsigned webhooks fail-closed, soft-sandbox isolation flags, etc.) — mitigated for beta by deploy constraints below, not closed in code.

**Hard conditions before flipping open signup**

1. Operator completes staging smoke + [LAUNCH_CHECKLIST.md](../../LAUNCH_CHECKLIST.md) sign-off.  
2. Redis on (`REQUIRE_REDIS=true`); JWT denylist path live.  
3. MCP stdio **off** (no `MCP_ALLOW_STDIO` in prod).  
4. Browser **off or network-isolated** until RC1-B28 closes.  
5. Strong distinct `AUTH_JWT_SECRET` / `NEXTAUTH_SECRET` (≥32 chars) in secrets manager.  
6. LB / probes on `GET /ready`; gating/debug kill-switches unset.  
7. FE + BE Sentry DSNs set; `SENTRY_RELEASE` matches deploy.

Until those conditions are met, marketing / open signup stays held. Code is Conditional GO; **release execution waits on the operator**.

---

## 5. Remaining High Priority Items

Must clear or explicitly accept risk before promoting from Public Beta toward GA. Tracked in [RC1_BLOCKERS.md](../reports/RC1_BLOCKERS.md).

| ID | Item | Owner |
|----|------|-------|
| RC1-B25 (ops) | Live staging: secrets manager, sign-in + chat smoke, checklist operator sign-off | Operator |
| RC1-B26 (ops) | Live restore drill + Sentry sample + alerts/uptime | Operator |
| RC1-B12 | Restrict query-string bearer acceptance (logs already scrubbed) | Eng |
| RC1-B14 | Upgrade Next.js ≥16.3.0 (still on **16.2.10**) | Eng |
| RC1-B15 | Rate-limit IP keying (XFF hop) | Eng |
| RC1-B16 | Unsigned billing webhooks fail closed in production | Eng |
| RC1-B27 | Stop/Continue dedicated integration coverage (E2E journey green; IT gap remains) | Eng |
| RC1-B28 | Isolate / feature-flag soft sandboxes for Public Beta tenants | Eng / Product |

Should-Fix High (v1.0 track, not beta blockers if marketed honestly): RC1-B29+ (vector RAG, message storage, CDN, metrics sink, xlsx, hard sandbox isolation).

---

## 6. Known Limitations

Document honestly in beta messaging. Do **not** market as GA-complete.

| Area | Limitation |
|------|------------|
| Business / Enterprise | Teams UI, Org Admin UI, Shared Projects, Enterprise Dashboard, Seat Management — **paused for v1** |
| MCP stdio | Disabled in production (host RCE posture); remote MCP preferred |
| Browser / Code Interpreter | Soft sandboxes — keep off or isolated for open beta tenants until RC1-B28 |
| Next.js | Pinned **16.2.10**; known advisories addressed by ≥16.3.0 (RC1-B14) |
| Query-string JWT | Accept path still exists; prefer `Authorization` header (RC1-B12) |
| Research | No session-history UI; Resume restarts from saved query (KI-004, KI-005) |
| Agents | Plan/verify Gemini-only; in-memory sessions; retry re-runs full request (KI-006, KI-007) |
| Browser | PDF action unimplemented; process-local runs; Chromium default (KI-008–010) |
| MCP | Process-local live connections; remote transports less soak-tested (KI-011–013) |
| PDF Intelligence | Backend ask/search/tables exist; dedicated product UI incomplete |
| Voice Live | Non-default until client bridge ships |
| RAG scale | In-app cosine over embeddings — no Atlas Vector Search yet |
| Message storage | Embedded `messages[]` — long-chat BSON risk at power-user scale |
| Compose | Not safe on a public IP if DB ports were ever republished |

Full product KI list: [KNOWN_ISSUES.md](../management/KNOWN_ISSUES.md).

---

## 7. Deployment Checklist

Execute in order. Full detail: [LAUNCH_CHECKLIST.md](../../LAUNCH_CHECKLIST.md) + [docs/OPERATIONS.md](../OPERATIONS.md).

### Pre-deploy

- [ ] CI green on release SHA (backend `test:ci`, FE unit + build, e2e as applicable)
- [ ] Tag `v1.0.0-beta.1`; set `SENTRY_RELEASE` / `NEXT_PUBLIC_SENTRY_RELEASE`
- [ ] Pre-deploy Mongo dump + uploads backup ([docs/BACKUP.md](../BACKUP.md))
- [ ] Secrets manager loaded: distinct ≥32-char JWT/NextAuth secrets; Redis; provider keys; memory encryption key
- [ ] Confirm unset: `FEATURE_GATING_DISABLED`, `MCP_ALLOW_STDIO`, `MCP_DEBUG`, `BROWSER_DEBUG`, `VANI_DEBUG`, `ALLOW_DEV_AUTH`
- [ ] Confirm set: `REQUIRE_REDIS=true`, FE/BE Sentry DSNs, `CORS_ORIGINS` / `NEXT_PUBLIC_APP_URL`

### Deploy

- [ ] Deploy immutable images (Compose / Cloud Run / k8s per ops runbook)
- [ ] LB liveness → `/health`; readiness → `/ready`
- [ ] `API_BASE=… ./scripts/staging-smoke.sh` → `/health` `/ready` `/version` OK
- [ ] `GET /version` matches intended release

### Post-deploy smoke (operator)

- [ ] Google sign-in
- [ ] Create chat → stream reply
- [ ] Small file upload
- [ ] Security headers present (CSP, frame options, referrer, permissions, HSTS on HTTPS)
- [ ] Structured logs include `requestId`; staging 500 yields `errorId` (+ Sentry if DSN set)
- [ ] Sign [LAUNCH_CHECKLIST.md](../../LAUNCH_CHECKLIST.md) operator boxes

### Public Beta feature posture

| Feature | Public Beta posture |
|---------|---------------------|
| Chat / auth / memory / projects / research / agents / images / uploads / billing | **On** (gated by plan) |
| MCP stdio | **Off** |
| Browser automation | **Off or network-isolated** |
| Code Interpreter | Prefer **off** or isolated until RC1-B28 |
| Teams / Org Admin / Shared Projects UI | **Hidden** (paused) |

---

## 8. Rollback Plan

Source: [LAUNCH_CHECKLIST.md](../../LAUNCH_CHECKLIST.md) §3, [docs/OPERATIONS.md](../OPERATIONS.md) §5.

1. **Stop the bad deploy** — scale to previous revision / redeploy prior immutable image tag.  
2. **Confirm identity** — prior image digest + `GET /version` matches previous release.  
3. **Data decision**  
   - No schema/data corruption → app rollback only.  
   - Corruption / bad migration → restore pre-deploy Mongo dump (+ uploads) per [docs/BACKUP.md](../BACKUP.md).  
4. **Re-point DNS / LB** only if rollback target is a different service.  
5. **Verify** — `/ready`, OAuth sign-in, one chat stream, Sentry/error rate back to baseline.  
6. **Postmortem** within 24h — capture `errorId` / `requestId` samples.  

Keep the previous **two** release artifacts (images + env snapshot) immutable and pullable for **≥14 days**.

**Beta-specific abort triggers (immediate rollback or traffic freeze)**

- Auth outage or widespread session forgery suspicion  
- Confirmed XSS / SSRF exploitation in production  
- Redis unavailable with multi-replica traffic (rate-limit / logout broken)  
- Billing webhook storm mutating entitlements incorrectly  
- Data loss / restore required  

---

## 9. First Week Monitoring Plan

| Day | Focus |
|-----|--------|
| **D0 (launch)** | Continuous watch: `/ready`, 5xx rate, Sentry new issues, OAuth failure rate, chat stream errors; on-call within 15 min of page |
| **D1** | Review first-night Sentry + logs; confirm Redis healthy; sample 10 user journeys (signup → chat → upload) |
| **D2–D3** | TTFT / latency anecdotal baseline; rate-limit hits; provider (Gemini) error rates; upload failures |
| **D4–D5** | Billing webhook delivery (Stripe/Razorpay if enabled); feature-gate denials vs upgrades; memory/encryption errors |
| **D6–D7** | Weekly ops review: restore-drill schedule confirmation, alert noise tune, decide hold vs continue open signup |

**Always-on alerts (from launch checklist)**

- `/ready` failing > 2 minutes  
- 5xx above baseline  
- Process restarts / OOM  
- Mongo connection errors  
- Disk / volume on uploads + Mongo  
- External uptime on `/health` or `/ready`  
- Sentry issue spike on release tag  

**Daily operator ritual (15 min)**

1. Sentry unresolved for `v1.0.0-beta.1`  
2. Uptime / probe dashboard  
3. Top 5 API error codes from logs  
4. Support inbox / Discord / email triage  

---

## 10. Success Metrics

| Metric | Public Beta target (first 7–14 days) |
|--------|--------------------------------------|
| Core chat success | ≥ **95%** of authenticated chat turns complete without 5xx |
| Auth | Google sign-in success ≥ **98%** of attempts (excl. user cancel) |
| Availability | `/ready` uptime ≥ **99.5%** (excluding planned maintenance) |
| Latency (chat) | Median TTFT acceptable vs staging baseline; no sustained P95 collapse |
| Client errors | No Critical/P0 Sentry issues open > **24h** without mitigation |
| Security | Zero confirmed XSS/SSRF/RCE incidents; stdio remains disabled |
| Support | P0 response &lt; **1h**; P1 &lt; **4h** (business hours if stated) |
| Growth (directional) | Track signups, D1 retention, Pro conversion — no hard gate for beta hold |
| Ops | At least one successful restore drill within **30 days** of launch |

Failure to hold availability/security targets → freeze signup and execute rollback / contain per §8.

---

## 11. Support Plan

| Channel | Use |
|---------|-----|
| In-app / email | Primary beta support inbox (operator to publish address) |
| Status | Status page or pinned incident note for outages |
| Severity | P0 = outage/security/data; P1 = major feature broken; P2 = degraded; P3 = polish |

**On-call**

- Single primary on-call for first week of open signup.  
- Escalation: eng lead → Release Manager for go/hold/rollback.  
- Use `requestId` / `errorId` from API JSON + Sentry release filter.

**Beta user expectations (publish with invite)**

- Consumer product; Teams/Admin collaboration not shipped.  
- Soft tools (browser / CI / MCP stdio) may be limited.  
- Feedback welcome; breaking changes possible before GA.  
- Known gaps listed in §6 / [KNOWN_ISSUES.md](../management/KNOWN_ISSUES.md).

**Do not promise**

- SLA / uptime contract at GA level  
- Business collaboration features  
- Hard-isolated sandboxes until RC1-B36  

---

## 12. Public Beta Exit Criteria

Promote to **GA / v1.0.0** (or next named release) only when all of the following are true:

| # | Criterion |
|---|-----------|
| 1 | Operator launch checklist fully signed; restore drill completed in last 30 days |
| 2 | Remaining **Must-Fix High** closed or explicitly waived in writing: RC1-B12, B14, B15, B16, B27, B28 (+ any new Criticals) |
| 3 | No open Critical security findings in production |
| 4 | Soft sandboxes isolated or remain feature-flagged off for general tenants |
| 5 | Success metrics (§10) held for **≥14 consecutive days** without signup freeze |
| 6 | Support load sustainable (P0/P1 backlog clearable within severity SLAs) |
| 7 | Product messaging matches shipped surface (no PDF Intelligence / Live Voice / Teams overclaims) |
| 8 | Should-Fix track scheduled for v1.0 where required for scale (RAG vector, message storage, CDN, metrics sink) — or accepted with capacity limits |
| 9 | Release Manager signs **GO** for GA; tag cut as `v1.0.0` (or agreed SemVer) |

**Exit outcomes**

| Outcome | When |
|---------|------|
| **Promote to GA** | Exit criteria met |
| **Extend Public Beta** | Metrics soft-miss or High items still open; keep Conditional GO posture |
| **Hold / rollback signup** | Security incident, sustained outage, or Critical regression |

---

## Decision summary

| Field | Value |
|-------|-------|
| Release version | `1.0.0-beta.1` |
| Release date | **TBD** |
| Overall product score | **7.6 / 10** |
| Status | **Conditional GO** |
| Next action | **Waiting For Operator Release** |

---

*End of Public Beta Decision. No application code was modified for this document.*
