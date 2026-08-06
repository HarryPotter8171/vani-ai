# VANI AI — Final Verification Report (RC2-4)

**Date:** 2026-08-06  
**Role:** Release QA Lead  
**Phase / Task:** RC2-4 Final Verification Sprint  
**Constraint:** Verification only — regressions fixed; no features, UI redesign, or refactors  
**Companions:** [RC1_BLOCKERS.md](./RC1_BLOCKERS.md), [SECURITY_FIX_REPORT.md](./SECURITY_FIX_REPORT.md), [PERFORMANCE_FIX_REPORT.md](./PERFORMANCE_FIX_REPORT.md), [PRODUCTION_HARDENING_REPORT.md](./PRODUCTION_HARDENING_REPORT.md)

---

## Executive summary

Post-RC2 verification is **green on automated suites and the full Playwright user journey**. RC2-1 security Criticals, RC2-2 Phase A performance, and RC2-3 ops hardening remain intact. Several **test/harness regressions** discovered during this pass were fixed (stale FE unit assertions, E2E API port, MCP stdio opt-in, Pro bootstrap for E2E, auth sync race, usage `periodEnd` conflict, Account menu clickability).

**Public Beta (open signup) remains No-Go** — residual Must-Fix security (XSS, research/MCP redirect SSRF), Redis JWT denylist completion, Next upgrade, and operator staging gates are still open.

| Metric | Result |
|--------|--------|
| **Overall Product Score** | **7.2 / 10** |
| **Remaining Critical** | **4** |
| **Remaining High** | **10** |
| **Remaining Medium** | **18** (approx. Must-Fix + process Mediums still open) |
| **Public Beta Recommendation** | **No-Go** |
| Private / staging dogfood | **Conditional Go** (Redis on, MCP stdio off, browser off/isolated, strong distinct secrets, LB on `/ready`, gating/debug unset, Sentry DSNs) |

---

## Test evidence

| Suite | Result |
|-------|--------|
| Backend `npm run test:ci` (unit + integration + security) | **81 files · 752 passed · 11 skipped** |
| Backend RC2 security / hardening / performance focused | **14 files · 76 passed** |
| Backend smoke (`npm run smoke:test`) | **PASS** (`/health` 200, `/ready` 200, graceful SIGTERM) |
| Backend build (`checkSyntax.js`) | **321 files OK** |
| Frontend unit | **23 files · 185 passed** (4 stale assertions fixed this pass) |
| Frontend production build | **PASS** (Next.js 16.2.10) |
| Bundle budget | **PASS** — `/` first-load JS **1.254 MB** (budget ≤ 1.8 MB) |
| Frontend monitoring unit | **4 passed** |
| Backup tooling (`scripts/verify-backup.sh`) | **OK** |
| Docker Compose YAML | Mongo/Redis **unpublished**; `REQUIRE_REDIS=true` present; **Docker CLI not installed** on this host — image build not executed |
| Playwright `userJourney.spec.ts` | **PASS** (login → chat → memory → upload → image → voice → research → MCP → browser → logout) |

---

## User journey matrix

| Journey | Evidence | Status |
|---------|----------|--------|
| Authentication (login / logout / session) | Integration auth + E2E login/logout | **Pass** |
| Chat streaming | Integration chat + E2E mock stream | **Pass** |
| Stop / Continue | `useChat` AbortController + continue path; continue covered in chat integration; dedicated Stop IT still thin (RC1-B27 residual) | **Pass** (code + partial auto) |
| History | Chat list lean/`$text` + E2E sidebar history | **Pass** |
| Voice | Integration voice/WS + E2E STT/TTS session | **Pass** |
| Memory | Integration memory + E2E Memory manager | **Pass** |
| Projects / RAG | Integration `projectsRag` | **Pass** |
| Research | Integration research + E2E run-to-completed | **Pass** |
| Agents | Integration agents | **Pass** |
| Browser | Integration browser + E2E approve→run (SSRF policy intact) | **Pass** |
| MCP | Integration MCP + E2E echo stdio (non-prod `MCP_ALLOW_STDIO`) | **Pass** |
| Code Interpreter | Integration CI | **Pass** (feature disabled in default smoke image) |
| OCR / PDF | Integration documentUnderstanding / pdfIntelligence | **Pass** |
| Image generation / editing | Integration + E2E generate | **Pass** |
| Uploads | Integration fileUpload + E2E attach | **Pass** |
| Billing | Unit billing / Stripe / Razorpay / feature gating | **Pass** (usage `periodEnd` upsert conflict fixed this pass) |
| Settings / Share / Export | Share integration; FE export unit; Settings chrome in E2E | **Pass** |

---

## RC2 fix integrity

| Slice | Verified |
|-------|----------|
| **RC2-1 Security** | Stdio guard + scrubbed env; browser `validatePublicUrl`; compose DB ports unpublished; production refuses `FEATURE_GATING_DISABLED` |
| **RC2-2 Performance** | Bundle **1.254 MB**; TTFT `Promise.all` pre-stream; OCR pool; SSE rAF batching; compression (SSE excluded); Redis multi-replica gate |
| **RC2-3 Hardening** | FE Sentry wiring; secret strength / distinct secrets; Compose `REQUIRE_REDIS`; gated `/health`; log URL scrub; ops runbook + backup verifier |

---

## Regressions fixed in this sprint

| Issue | Fix |
|-------|-----|
| FE unit: voice aria-label / pin / active accent classes | Updated tests to match UI polish |
| E2E: composer placeholder `Message VANI AI...` | Aligned to `Message VANI…` |
| E2E: FE always called `:5001` | `NEXT_PUBLIC_API_PORT` honor in `constants.ts` + Playwright env |
| E2E: MCP stdio refused after RC2-1 | `MCP_ALLOW_STDIO=true` on E2E backend only |
| E2E: Free plan blocked MCP | `VANI_E2E_MODE` Pro bootstrap on auth sync |
| Auth sync E11000 race | Catch duplicate key → re-find |
| Usage upsert `periodEnd` conflict | Remove duplicate `$setOnInsert.periodEnd` |
| Sidebar Account menu unclickable | Open menu downward + higher z-index |
| E2E Memory under collapsed More | Expand More before Memory |
| E2E logout assertion strict-mode dual buttons | Assert developer continue button |

---

## Remaining Critical

| ID | Item |
|----|------|
| RC1-B06 | Research redirect-follow + remote MCP SSRF (DNS/rebind) |
| RC1-B07 | Canvas richtext unsanitized HTML + markdown `javascript:`/`data:` hrefs |
| RC1-B11 | Redis JWT `jti` denylist across replicas (policy/require-Redis done; denylist open) |
| RC1-B25 | Operator staging smoke / secrets-manager / checklist sign-off |

---

## Remaining High (selected Must-Fix)

| ID | Item |
|----|------|
| RC1-B12 | Restrict query-string bearer acceptance (logs scrubbed; accept path remains) |
| RC1-B14 | Upgrade Next.js ≥16.3.0 (still on **16.2.10**) |
| RC1-B15 | Rate-limit IP keying (XFF hop) |
| RC1-B16 | Unsigned billing webhooks fail closed in production |
| RC1-B26 | Live restore drill + Sentry sample + alerts/uptime |
| RC1-B27 | Stop/Continue dedicated integration coverage (journey E2E now green; IT gap remains) |
| RC1-B28 | Isolate / feature-flag soft sandboxes for Public Beta tenants |
| RC1-B29+ | Vector RAG / message storage / CDN / metrics sink (Should-Fix High track) |

---

## Remaining Medium

Includes Must-Fix Mediums still open (browser poll already gated; chat lean/`$text` done) plus Should-Fix / process Mediums: agent TTFB, sandbox warm pools, analytics batching, JSON body scope, FE CSP, Zod boundaries, upload AV, PDF Intelligence product UI, live TTFT staging baseline, vitest worker flakiness, etc. Full list: [RC1_BLOCKERS.md](./RC1_BLOCKERS.md).

---

## Scores (updated)

| Dimension | Prior | After RC2-4 verify |
|-----------|------:|-------------------:|
| Product journeys / regression | 6.2 | **~7.5** |
| Security (code Criticals) | 5.5 → RC2-1 | **~6.8** (XSS/SSRF residual) |
| Performance | 5.8 → RC2-2 ~7.2 | **~7.2** (bundle confirmed) |
| Production ops scaffolding | 4.8 → RC2-3 ~6.5 | **~6.5** (operator gates open) |
| **Overall Product Score** | — | **7.2 / 10** |

---

## Public Beta recommendation

| Path | Decision |
|------|----------|
| **Public Beta (open signup)** | **No-Go** |
| **Private / staging dogfood** | **Conditional Go** — Redis required, MCP stdio off, browser off or network-isolated, secrets manager with strong distinct JWT/NextAuth secrets, LB on `/ready`, gating/debug kill-switches unset, FE/BE Sentry DSNs set |
| **Compose on a public IP** | **No-Go** until remaining Must-Fix closed (DB ports already unpublished) |

---

## Board transition

| From | To |
|------|----|
| RC2-4 Final Verification Sprint | **Review** |
| Next Current Task | **Release Decision** |

---

*End of Final Verification Report.*
