# VANI AI — RC2.5 Critical Fix Report

**Date:** 2026-08-06  
**Role:** Principal Engineer / Security Lead  
**Phase / Task:** RC2.5 — Public Beta Critical Blockers  
**Constraint:** Critical blockers only — no features, UI redesign, or unrelated refactors  
**Companions:** [RC1_BLOCKERS.md](./RC1_BLOCKERS.md), [FINAL_VERIFICATION_REPORT.md](./FINAL_VERIFICATION_REPORT.md), [SECURITY_AUDIT.md](./SECURITY_AUDIT.md)

---

## Executive summary

RC2.5 closed the **four remaining Critical** Public Beta blockers identified after RC2-4:

1. XSS (canvas richtext + markdown hrefs + app CSP)  
2. Research / MCP SSRF redirect + remote URL policy  
3. Redis JWT `jti` denylist (multi-replica logout)  
4. Engineering-controlled staging / backup / restore / probe tooling

| Metric | Result |
|--------|--------|
| Critical blockers addressed | **4 / 4** (RC1-B06, B07, B11 denylist, B25 eng slice) |
| Backend `test:ci` | **PASS** |
| Frontend unit | **24 files · 192 passed** |
| Frontend production build | **PASS** (Next.js 16.2.10) |
| Playwright `userJourney.spec.ts` | **PASS** (43.6s) |
| Backup / restore tooling | **OK** (`verify-backup.sh`, `verify-restore.sh`) |
| **Remaining Critical (code)** | **0** |
| **Remaining Critical (operator)** | Staging interactive smoke / secrets-manager / live restore drill / alerts |
| **Public Beta recommendation** | **Conditional Go** (see below) |

---

## Implemented fixes

### 1. XSS protection (RC1-B07)

| Change | Detail |
|--------|--------|
| Canvas richtext | `sanitizeRichtextHtmlSafe` via `isomorphic-dompurify` before `dangerouslySetInnerHTML` |
| Markdown / share / artifacts | `safeHref` allowlist (`http`/`https`/`mailto` + relative); `urlTransform` on `ReactMarkdown`; dangerous schemes render as plain text |
| Citation chips | Same `safeHref` gate |
| CSP | Next.js `headers()` CSP + `X-Frame-Options` / `nosniff` / `Referrer-Policy` / `Permissions-Policy`; prod omits `unsafe-eval` |

**Tests:** `frontend/tests/unit/lib/xssSanitize.test.ts` (7 passed).

### 2. Research / MCP SSRF redirects (RC1-B06)

| Change | Detail |
|--------|--------|
| `urlSafety.js` | Expanded host/IP blocklist; IPv6 ULA/link-local; internal suffixes (`.local`, `.internal`, …) |
| DNS rebinding | `assertResolvedPublicHost` / `validatePublicUrlResolved` reject private A/AAAA answers |
| Research fetch | `fetchWithSafeRedirects` — `redirect: "manual"`, re-validate every `Location` hop |
| Remote MCP | `MCPRegistry` + `MCPTransport` require public http(s)/ws(s) via `validatePublicUrl` |

**Tests:** `urlSafety.test.js`, `MCPRegistry.test.js` SSRF cases, existing `browserSafety` SSRF (53 focused tests green with auth/JWT suite).

### 3. Redis JWT denylist (RC1-B11)

| Change | Detail |
|--------|--------|
| Dual store | In-memory Map (L1 / single-instance) + Redis `jwt:deny:jti:*` / `jwt:deny:tok:*` with TTL to token expiry |
| Auth paths | `logout` / `revoke` await Redis write; `verifyAccessToken` awaits denylist check |
| Multi-session | Distinct `jti` values — revoking one token does not kill others |

**Tests:** `tokenRevocation.test.js` (incl. Redis mock cross-replica) + `auth.test.js` logout/revoke/expired.

### 4. Production staging sign-off — engineering slice (RC1-B25)

| Artifact | Purpose |
|----------|---------|
| `scripts/staging-smoke.sh` | `/health` + `/ready` + `/version` probe smoke |
| `scripts/verify-restore.sh` | Restore tooling presence + dump shape check + gated `--restore` |
| `LAUNCH_CHECKLIST.md` | Engineering gates checked; operator boxes remain |
| `docs/OPERATIONS.md` | Redis denylist note; staging smoke + restore recipe |

Operator-owned (still open): secrets manager wiring, interactive sign-in + chat smoke, live restore drill against staging DB, Sentry sample + alerts/uptime.

---

## Tests executed

| Suite | Result |
|-------|--------|
| Frontend XSS unit | **7 passed** |
| Backend SSRF / MCP / JWT / auth focused | **53 passed** |
| Backend `npm run test:ci` | **PASS** |
| Frontend `npm test` | **192 passed** (24 files) |
| Frontend `npm run build` | **PASS** |
| `./scripts/verify-backup.sh` | **OK** |
| `./scripts/verify-restore.sh` | **OK** |
| Playwright `userJourney.spec.ts` | **PASS** |

---

## Remaining Critical blockers

| ID | Item | Owner |
|----|------|-------|
| — | **None in application code** for the RC2.5 Critical set | — |
| RC1-B25 (ops) | Live staging: secrets manager, sign-in + chat smoke, checklist operator sign-off | Operator |
| RC1-B26 (ops) | Live restore drill + Sentry sample + alerts/uptime | Operator |

High Must-Fix items (not Critical) remain open: query-string bearer restrict (RC1-B12), Next ≥16.3.0 (RC1-B14), rate-limit XFF (RC1-B15), unsigned webhook fail-closed (RC1-B16), soft-sandbox isolation flags (RC1-B28), etc. See [RC1_BLOCKERS.md](./RC1_BLOCKERS.md).

---

## Updated Public Beta recommendation

| Path | Decision |
|------|----------|
| **Public Beta (open signup)** | **Conditional Go** — Critical code blockers cleared; require Redis on, MCP stdio off, browser off or network-isolated until High sandbox items close, strong distinct secrets, LB on `/ready`, gating/debug unset, FE/BE Sentry DSNs, and **operator staging smoke signed** |
| **Private / staging dogfood** | **Go** once operator probe + sign-in smoke complete |
| **Compose on a public IP** | **No-Go** unless Mongo/Redis stay unpublished (current Compose) |

**Overall product score (est.):** **7.6 / 10** (was 7.2) — security Critical residual closed; High auth/deps/sandbox items still temper open signup confidence.

---

## Board transition

| From | To |
|------|----|
| RC2.5 Public Beta Critical Blockers | **Review** |
| Next Current Task | **Public Beta Decision** |

---

*End of RC2.5 Critical Fix Report.*
