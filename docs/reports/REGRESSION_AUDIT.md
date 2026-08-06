# VANI AI — Full Regression Audit Report

**Date:** 2026-08-06  
**Role:** Release QA Lead  
**Phase / Task:** RC1-R1 — Full Regression Audit (verify only; no code changes)  
**Companions:** [PERFORMANCE_AUDIT.md](./PERFORMANCE_AUDIT.md), [PERFORMANCE_IMPLEMENTATION_PLAN.md](./PERFORMANCE_IMPLEMENTATION_PLAN.md), [SECURITY_AUDIT.md](./SECURITY_AUDIT.md), [KNOWN_ISSUES.md](../management/KNOWN_ISSUES.md)

---

## Executive summary

Consumer **core journeys are wired and largely green** under automated tests and a live local smoke (login → history → chat stream). Pro tool surfaces remain **functionally wired** but inherit **Critical security blockers** and **performance regressions** that make Public Beta **No-Go** until remediations land.

| | |
|--|--|
| **Overall Regression Score** | **6.2 / 10** |
| **Launch Risk** | **High** |
| **Go / No-Go** | **NO-GO** for Public Beta |
| **Critical regressions** | 5 |
| **Major regressions** | 12 |
| **Minor regressions** | 11 |

### Go / No-Go recommendation

**NO-GO** for Public Beta.

| Gate | Status |
|------|--------|
| Core chat/auth/memory/upload functional | **Pass** (tests + live smoke) |
| Security top blockers cleared | **Fail** — MCP RCE, SSRF, compose DB ports, gating kill-switch still open |
| Performance Phase A executed | **Fail** — first-load ~2.28 MB; TTFT serial; no bundle budget |
| Redis required for multi-replica | **Fail** — live `/ready` shows `redis: not_configured` |
| Playwright full user journey re-run in CI this pass | **Not re-executed** (harness exists; use before go) |

**Conditional Go** only for a **closed, single-instance beta** with MCP stdio **disabled**, browser automation **disabled or network-isolated**, Redis **on**, and security/perf Phase A items scheduled immediately.

---

## Method

1. Read project context + RC1 performance/security audits.  
2. **Automated:** backend unit (480), security (15), focused integration (auth/chat/memory/fileUpload/projectsRag/agents/research — all green this pass); frontend vitest (108 passed, worker pool flaky).  
3. **Live smoke (local FE :3000 + BE :5001):** `/health` `/ready`, unauth API codes, browser login (dev auth), chat history restore, send message → streaming UI with **Stop generating**.  
4. **Static journey trace** for remaining surfaces against C1 reports + KNOWN_ISSUES.  
5. **Not fully live-exercised:** Google OAuth, Stripe/Razorpay checkout, Gemini Live client bridge, full Playwright `userJourney.spec.ts`, Stop/Continue click completion, OCR/PDF UI, MCP/Browser/CI UI end-to-end.

---

## Verification evidence (this pass)

| Suite / check | Result |
|---------------|--------|
| `backend` `npm run test:unit` | **480 passed** / 58 files |
| `backend` `npm run test:security` | **15 passed** |
| Integration: auth, chat, memory, fileUpload | **69 passed** / 4 files |
| Integration: chat, projectsRag, agents, research | **55 passed** / 4 files |
| `frontend` `npm test` | **108 passed**; **7 vitest worker timeout errors** (pool flaky under host memory pressure) |
| `GET /health` | **200** — mongo healthy; **memory.healthy: false** (systemUsedPct **98.8%**); redis not configured |
| `GET /ready` | **200** — `redis: "not_configured"` |
| Unauth `POST /api/chat` | **401** |
| Unauth `GET /api/models` | **401** |
| `GET /api/chat/shared/:id` missing | **404** |
| Live UI login (Continue as developer) | **Pass** → workspace “Good Evening, Dev” |
| Live chat history | **Pass** — prior chats listed in sidebar |
| Live chat send | **Pass** — stream started; Stop generating visible; input disabled during generation |
| Full Playwright E2E | **Not re-run** this pass |
| `npm run test:ci` (coverage) | **Unreliable** — mongodb-memory-server start timeout under load |

---

## Journey matrix

| Journey | Verdict | Evidence |
|---------|---------|----------|
| Authentication (login/logout/session) | **PASS_WITH_RISKS** | Live login + history; auth IT green; logout multi-instance revoke risk (SEC-H7) |
| Chat stream / Stop / Continue / History | **PASS_WITH_RISKS** | Live stream + Stop UI; chat IT green; Continue/Stop lack dedicated IT; TTFT slow |
| Voice STT / TTS / Live | **PASS_WITH_RISKS** | Tests + E2E harness; Live client not default (`VOICE_REPORT`) |
| Memory capture / recall | **PASS** | Memory IT + E2E step; live Settings path wired |
| Projects upload / RAG / delete | **PASS_WITH_RISKS** | `projectsRag` IT green; shared share **501** (KI-003); no vector index |
| Deep Research | **PASS_WITH_RISKS** | Research IT green; KI-004/005; SSRF redirect risk |
| AI Agents | **PARTIAL** | Agents IT green; Gemini-only planner; in-memory sessions |
| Browser | **PASS_WITH_RISKS** | Browser IT + E2E approve path; **SEC-C3** SSRF |
| MCP | **PASS_WITH_RISKS** | MCP IT + E2E echo; **SEC-C1** stdio RCE |
| Code Interpreter | **PASS_WITH_RISKS** | CI IT; soft sandbox (SEC-H11) |
| OCR / PDF | **PARTIAL** | OCR/PDF IT exist; PDF ask/search UI missing |
| Image Generation | **PASS_WITH_RISKS** | Image gen IT; Gemini-only text-to-image |
| Image Editing | **PASS** | Image edit IT (Gemini + OpenAI edit) |
| File Uploads | **PASS** | File upload IT; live attach affordance present |
| Billing | **PASS_WITH_RISKS** | Plans public **200**; upgrade UI present; live checkout not verified; SEC-C4 |
| Settings | **PASS** | Live Settings + VANI Pro controls visible |
| Sharing | **PASS_WITH_RISKS** | Share API 404 for missing id; markdown XSS risk on share page |
| Exports | **PASS_WITH_RISKS** | Export menu present live; jspdf first-load regression |

---

## Critical regressions

### REG-C1. MCP stdio still enables host RCE (security blocker blocks Pro journey)
| | |
|--|--|
| **Steps** | Pro user → Settings → MCP → register stdio transport with arbitrary `command` |
| **Expected** | Sandboxed / disallowlisted host execution |
| **Actual** | Backend spawns user command on API host (`SECURITY_AUDIT` SEC-C1) |
| **Severity** | **Critical** |
| **Recommendation** | Disable stdio in multi-tenant prod before enabling MCP for Public Beta |

### REG-C2. Browser navigation still allows private / metadata SSRF
| | |
|--|--|
| **Steps** | Start browser run → navigate to `http://169.254.169.254/` or LAN admin |
| **Expected** | Blocked non-public hosts |
| **Actual** | `assertHttpUrl` allows any http(s) (`SECURITY_AUDIT` SEC-C3) |
| **Severity** | **Critical** |
| **Recommendation** | Apply research `validatePublicUrl`; isolate browser process |

### REG-C3. Compose still publishes unauthenticated Mongo/Redis
| | |
|--|--|
| **Steps** | `docker compose up` on reachable host → connect `:27017` / `:6379` |
| **Expected** | Data stores internal-only / authenticated |
| **Actual** | Host ports published without auth (`SECURITY_AUDIT` SEC-C2) |
| **Severity** | **Critical** |
| **Recommendation** | Remove host ports; add Mongo auth + Redis password for any exposure |

### REG-C4. First-load JS regression vs Sprint 1 (chat interactivity)
| | |
|--|--|
| **Steps** | Cold load `/` on mid-tier mobile |
| **Expected** | ≤ ~1.8 MB first-load (Sprint 1 after) |
| **Actual** | **~2.28 MB** uncompressed; jspdf/canvas barrel + KaTeX on critical path |
| **Severity** | **Critical** (launch UX) |
| **Recommendation** | Execute Performance Phase A items A1–A4 before Public Beta |

### REG-C5. Chat TTFT still blocked by serial pre-stream work
| | |
|--|--|
| **Steps** | Send chat message (live smoke this pass) |
| **Expected** | First token promptly after SSE headers |
| **Actual** | Stream UI entered (Stop visible) but generation remained in-flight for extended period; audit maps serial User/RAG/memory/OCR before model (`PERFORMANCE_AUDIT` BE-C1). Live host also reported **98.8%** system memory used (`memory.healthy: false`) |
| **Severity** | **Critical** (perceived product quality) |
| **Recommendation** | Parallelize chat pre-work; OCR/RAG Phase A; ensure staging hosts have headroom |

---

## Major regressions

### REG-M1. Frontend vitest worker pool flaky under load
| | |
|--|--|
| **Steps** | `cd frontend && npm test` |
| **Expected** | Stable green CI |
| **Actual** | 108 tests passed but **7** “Timeout waiting for worker” errors; exit code still 0 |
| **Severity** | **Major** |
| **Recommendation** | Cap workers; fail CI on pool errors; free host memory before RC gates |

### REG-M2. Redis not configured on running backend
| | |
|--|--|
| **Steps** | `GET /ready` on live backend |
| **Expected** | Redis healthy for production-shaped deploy |
| **Actual** | `"redis":"not_configured"` — rate limits / revoke stay process-local |
| **Severity** | **Major** |
| **Recommendation** | Require Redis for any Public Beta / multi-replica (Perf Phase A + Sec) |

### REG-M3. JWT logout revoke ineffective across instances
| | |
|--|--|
| **Steps** | Logout on instance A; use token on instance B |
| **Expected** | Immediate revoke |
| **Actual** | In-memory denylist only (`SECURITY_AUDIT` SEC-H7) |
| **Severity** | **Major** |
| **Recommendation** | Redis `jti` denylist |

### REG-M4. Canvas richtext XSS + markdown dangerous hrefs
| | |
|--|--|
| **Steps** | Render malicious richtext canvas / `javascript:` markdown link (chat or share) |
| **Expected** | Sanitized / scheme-blocked |
| **Actual** | Unsanitized `dangerouslySetInnerHTML`; href pass-through (`SECURITY_AUDIT` SEC-H4/H5) |
| **Severity** | **Major** |
| **Recommendation** | DOMPurify + protocol allowlist before Public Beta |

### REG-M5. Research redirect SSRF bypass
| | |
|--|--|
| **Steps** | Deep Research fetch URL that redirects to private IP |
| **Expected** | Blocked |
| **Actual** | `redirect: "follow"` after initial public check (`SECURITY_AUDIT` SEC-H3) |
| **Severity** | **Major** |
| **Recommendation** | Manual redirects + re-validate each hop |

### REG-M6. PDF Intelligence APIs lack product UI
| | |
|--|--|
| **Steps** | User expects PDF ask/search/tables from product chrome |
| **Expected** | UI for `/api/files/:id/pdf/*` |
| **Actual** | Backend verified; **no FE panel** — upload understand only |
| **Severity** | **Major** (if marketed) |
| **Recommendation** | Ship UI or remove marketing claims |

### REG-M7. Shared project share returns 501
| | |
|--|--|
| **Steps** | Call project share collaboration API |
| **Expected** | Working share or hidden surface |
| **Actual** | **501** stub; KI-003 paused |
| **Severity** | **Major** if exposed in UI |
| **Recommendation** | Keep UI hidden for v1 (already paused) |

### REG-M8. Chat Stop / Continue lack dedicated automated guards
| | |
|--|--|
| **Steps** | Stop mid-stream; Continue interrupted reply |
| **Expected** | Covered by integration/E2E |
| **Actual** | Code wired; live Stop button observed; **no dedicated IT** this pass; Continue not live-clicked |
| **Severity** | **Major** (regression risk) |
| **Recommendation** | Add abort + continue-merge integration tests |

### REG-M9. Browser approval poll always on
| | |
|--|--|
| **Steps** | Login and idle without opening Browser |
| **Expected** | No continuous polling |
| **Actual** | `useBrowser({ enabled: true })` polls ≥8s (`PERFORMANCE_AUDIT` FE-M4) |
| **Severity** | **Major** |
| **Recommendation** | Gate poll to panel open / first use |

### REG-M10. Voice Live engine not client-default
| | |
|--|--|
| **Steps** | Enable `VOICE_ENGINE=live` expecting Gemini Live UX |
| **Expected** | Matching client bridge |
| **Actual** | Backend Phase 1; client still legacy STT/SSE/TTS path |
| **Severity** | **Major** if flag flipped in prod |
| **Recommendation** | Keep legacy default until Live bridge complete |

### REG-M11. Image text-to-image Gemini-only
| | |
|--|--|
| **Steps** | Generate image when Gemini unavailable |
| **Expected** | Provider fallback |
| **Actual** | No OpenAI text-to-image; edit path has OpenAI |
| **Severity** | **Major** (resilience) |
| **Recommendation** | Document limitation or add fallback |

### REG-M12. `FEATURE_GATING_DISABLED` still a production footgun
| | |
|--|--|
| **Steps** | Deploy with env flag set |
| **Expected** | Fail closed |
| **Actual** | All plan gates open (`SECURITY_AUDIT` SEC-C4) |
| **Severity** | **Major**/Critical ops |
| **Recommendation** | Refuse boot in production |

---

## Minor regressions

| ID | Steps | Expected | Actual | Severity | Recommendation |
|----|-------|----------|--------|----------|----------------|
| REG-m1 | Open research history | List prior runs | No history UI (KI-004) | Minor | Document / later UI |
| REG-m2 | Resume research | Mid-phase continue | Restart from query (KI-005) | Minor | Document |
| REG-m3 | Switch agent provider | ModelRouter | Gemini-only plan/verify (KI-006) | Minor | Document |
| REG-m4 | Retry agent HTTP | Resume steps | UI re-runs full request (KI-007) | Minor | Document |
| REG-m5 | Browser PDF action | Generate PDF | Not implemented (KI-008) | Minor | Document |
| REG-m6 | Restart with active browser/MCP | Persist live sessions | Process-local (KI-010/011) | Minor | Document multi-replica |
| REG-m7 | Project knowledge search UI | Console | API only | Minor | Optional UI |
| REG-m8 | Creative agents in selector | Available | “Coming soon” | Minor | Keep gated |
| REG-m9 | Export PDF first load | Deferred jspdf | On critical path (FE-C2/C3) | Minor/Major perf | Dynamic import |
| REG-m10 | Duplicate Mongoose indexes | Clean boot | Warnings on Subscription/Invoice/DailyUsage | Minor | Clean schema defs |
| REG-m11 | Deprecated `findOneAndUpdate` `new` | No deprecation noise | Repeated mongoose warnings | Minor | Use `returnDocument: 'after'` |

---

## Cross-cutting launch blockers (from prior RC1 audits — still open)

These are **not fixed** as of this regression pass (audit-only constraint):

| Source | Blocker |
|--------|---------|
| Security | MCP stdio RCE, browser/MCP/research SSRF, query JWT leakage, Next/xlsx highs |
| Performance | Bundle regression, TTFT, OCR serial, Redis optional, no compression |
| Ops | Compose DB ports; live Redis absent; host memory pressure |

---

## What passed cleanly

- Auth gate UI + developer login → workspace  
- Chat history restore after session  
- Chat send enters streaming state with Stop affordance  
- Unauthenticated API rejection (401)  
- Shared chat missing → 404  
- Backend unit + security suites green  
- Integration coverage green for auth, chat, memory, files, projects/RAG, agents, research  
- Image editing, file upload, memory paths test-backed  
- Settings / Pro upgrade entry points present in chrome  
- Export menu visible on active chat  

---

## Overall Regression Score: **6.2 / 10**

| Dimension | Score | Notes |
|-----------|------:|-------|
| Functional wiring | 8.0 | Core + Pro surfaces exist and test-backed |
| Live smoke confidence | 6.5 | Login/history/stream OK; deep tools not fully live |
| Automated stability | 5.5 | FE worker flakiness; CI coverage run unreliable |
| Security posture for journeys | 4.0 | Critical tool/ops blockers open |
| Performance posture for journeys | 4.5 | Bundle + TTFT regressions open |

---

## Launch Risk: **High**

| Audience | Risk |
|----------|------|
| Internal dogfood (MCP/browser off, single instance, Redis on) | **Medium** |
| Public Beta with Pro tools | **High → Critical** |
| Compose-exposed DB ports | **Critical** |

---

## Go / No-Go

### **NO-GO — Public Beta**

Must clear before flipping to Go:

1. Security blockers 1–7 from [SECURITY_AUDIT.md](./SECURITY_AUDIT.md) (at minimum MCP stdio off, SSRF, XSS, compose ports, gating/secrets)  
2. Performance Phase A from [PERFORMANCE_IMPLEMENTATION_PLAN.md](./PERFORMANCE_IMPLEMENTATION_PLAN.md) (bundle ≤1.8 MB, TTFT, Redis, compression)  
3. Re-run Playwright `e2e/tests/userJourney.spec.ts` green on staging  
4. Dedicated Stop/Continue integration coverage  
5. Staging `/ready` with Redis configured and healthy memory headroom  

### Next board task

**RC1-L1 — Production Readiness Audit** (ops checklist, secrets, probes, backups, release gates) — do **not** treat as a substitute for security/perf fixes.

---

## Audit constraints

- **No source code modified**  
- **No bugs fixed**  
- Findings from tests, live smoke, prior audits, and journey tracing only  

---

*End of RC1-R1 Full Regression Audit.*
