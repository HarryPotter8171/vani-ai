# VANI AI — RC1 Release Blockers

**Date:** 2026-08-06  
**Role:** Release Manager  
**Phase / Task:** RC1-FINAL — Release Blocker Consolidation  
**Constraint:** Consolidation only — **no application source code modified**  
**Sources:** [PERFORMANCE_AUDIT.md](./PERFORMANCE_AUDIT.md), [PERFORMANCE_IMPLEMENTATION_PLAN.md](./PERFORMANCE_IMPLEMENTATION_PLAN.md), [SECURITY_AUDIT.md](./SECURITY_AUDIT.md), [REGRESSION_AUDIT.md](./REGRESSION_AUDIT.md), [PRODUCTION_READINESS_AUDIT.md](./PRODUCTION_READINESS_AUDIT.md)

---

## Executive summary

All five RC1 audits agree: **Public Beta is No-Go**. Core chat/auth journeys work and test suites are largely green, but Critical security (MCP RCE, SSRF, compose DB ports, gating kill-switch), first-load/TTFT regressions, and unexecuted ops gates block open signup.

| Metric | Value |
|--------|------:|
| Must Fix Before Public Beta | **28** |
| Should Fix Before v1.0 | **22** |
| Can Wait Until After Launch | **16** |
| **Total Critical** | **12** |
| **Total High** | **24** |
| **Total Medium** | **30** |
| **Overall Release Status** | **No-Go** |

**Conditional Go** remains valid only for locked private/staging dogfood: Redis on, MCP stdio off, browser off or network-isolated, secrets in a manager, LB on `/ready`, `FEATURE_GATING_DISABLED` unset.

---

# Must Fix Before Public Beta

These items must clear before Public Beta marketing / open signup.

---

### RC1-B01 — Disable or lock down MCP stdio (host RCE)

| | |
|--|--|
| **Priority** | Critical |
| **Area** | Security / MCP |
| **Description** | Authenticated MCP users can register `transport.type: "stdio"` with arbitrary `command`/`args`/`cwd`/`env`; backend spawns on the API host. `test-transport` is equally dangerous. |
| **Why it matters** | Remote code execution as the backend user — secrets, Mongo/Redis, lateral movement. Blocks enabling MCP for Public Beta. |
| **Related audit report(s)** | SECURITY SEC-C1; REGRESSION REG-C1; PRODUCTION Must-Fix #1 |
| **Estimated effort** | M–L |
| **Dependencies** | Prefer before any multi-tenant MCP enablement; pair with RC1-B02 |

---

### RC1-B02 — Scrub MCP stdio child environment

| | |
|--|--|
| **Priority** | Critical |
| **Area** | Security / MCP |
| **Description** | When `transport.env` is omitted, stdio spawn may inherit full `process.env` (API keys, JWT secrets, `MONGODB_URI`). |
| **Why it matters** | Even a “benign” binary receives production secrets; catastrophic with stdio RCE. |
| **Related audit report(s)** | SECURITY SEC-H1 |
| **Estimated effort** | S |
| **Dependencies** | RC1-B01 (disable or allowlist path) |

---

### RC1-B03 — Unpublish / authenticate Mongo & Redis in compose

| | |
|--|--|
| **Priority** | Critical |
| **Area** | Ops / Infrastructure |
| **Description** | `docker-compose.yml` maps `27017` and `6379` with no Mongo auth and no Redis `requirepass`. |
| **Why it matters** | On any reachable host, full DB read/write and rate-limit cache abuse — Critical data-store compromise. |
| **Related audit report(s)** | SECURITY SEC-C2; REGRESSION REG-C3; PRODUCTION PR-B1 |
| **Estimated effort** | S |
| **Dependencies** | Prod-shaped compose overlay; document compose as not internet-safe |

---

### RC1-B04 — Browser automation SSRF (private / metadata URLs)

| | |
|--|--|
| **Priority** | Critical |
| **Area** | Security / Browser |
| **Description** | `assertHttpUrl` allows any `http:`/`https:` including `169.254.169.254`, RFC1918, loopback; Chromium launches with `--no-sandbox`. |
| **Why it matters** | Entitled users can steal cloud IAM tokens / hit internal admin UIs; browser compromise ≈ host compromise. |
| **Related audit report(s)** | SECURITY SEC-C3; REGRESSION REG-C2; PRODUCTION Must-Fix #3 |
| **Estimated effort** | M |
| **Dependencies** | Reuse research `validatePublicUrl`; consider isolating browser container |

---

### RC1-B05 — Fail closed on `FEATURE_GATING_DISABLED` in production

| | |
|--|--|
| **Priority** | Critical |
| **Area** | Security / Billing |
| **Description** | When set, `FeatureGate` allows every feature for every authenticated user; `validateEnv` does not refuse boot. |
| **Why it matters** | Free users can exercise Pro/Business APIs — revenue and abuse bypass. |
| **Related audit report(s)** | SECURITY SEC-C4; REGRESSION REG-M12; PRODUCTION PR-C1 |
| **Estimated effort** | S |
| **Dependencies** | Launch checklist gate; dual-confirm / startup alert |

---

### RC1-B06 — Research + remote MCP SSRF (redirects / private hosts)

| | |
|--|--|
| **Priority** | Critical |
| **Area** | Security / Research / MCP |
| **Description** | Research validates the initial URL then `redirect: "follow"` without re-checking hops; no DNS rebinding pin. Remote MCP HTTP/SSE/WS URLs lack public-host policy. |
| **Why it matters** | Classic SSRF to internal hosts via open redirects / DNS rebinding / attacker-controlled MCP URLs. |
| **Related audit report(s)** | SECURITY SEC-H2, SEC-H3, SEC-M12; REGRESSION REG-M5 |
| **Estimated effort** | S–M |
| **Dependencies** | Align policy with RC1-B04; AbortSignal / provider limits for research |

---

### RC1-B07 — Canvas richtext XSS + markdown dangerous hrefs

| | |
|--|--|
| **Priority** | Critical |
| **Area** | Security / Frontend XSS |
| **Description** | Canvas `richtext` uses unsanitized `dangerouslySetInnerHTML`; markdown `a` passes `javascript:`/`data:` hrefs (chat + share). |
| **Why it matters** | Stored XSS on app origin (session theft); share-page phishing/XSS. |
| **Related audit report(s)** | SECURITY SEC-H4, SEC-H5; REGRESSION REG-M4; PRODUCTION Must-Fix #5 |
| **Estimated effort** | S |
| **Dependencies** | Prefer before Public Beta share marketing; CSP (v1.0) reduces blast radius |

---

### RC1-B08 — First-load JS regression (~2.28 MB)

| | |
|--|--|
| **Priority** | Critical |
| **Area** | Performance / Frontend |
| **Description** | `/` first-load uncompressed JS is **~2.28 MB** (Sprint 1 after was **1.77 MB**). Eager edges: Sidebar→ExportMenu→jspdf; `useCanvas`→`@/lib/canvas` barrel (jspdf/docx); KaTeX/markdown on critical path. |
| **Why it matters** | Every session pays parse/compile before chat is interactive — mobile/mid-tier TTI failure. |
| **Related audit report(s)** | PERFORMANCE FE-C1–C3, FE-M1; Plan A1–A4; REGRESSION REG-C4 |
| **Estimated effort** | S–M (quick wins) / M (KaTeX) |
| **Dependencies** | Measure residual after jspdf/barrel split before setting ≤1.8 MB CI budget |

---

### RC1-B09 — Chat TTFT blocked by serial pre-stream work

| | |
|--|--|
| **Priority** | Critical |
| **Area** | Performance / Backend Chat |
| **Description** | After SSE headers, first tokens wait on serial User reload → chat hydrate → project RAG → memory → prepareMessages/OCR → model. Redundant User fetch + multi-round FeatureGate. |
| **Why it matters** | High perceived latency on every chat turn — primary product path. |
| **Related audit report(s)** | PERFORMANCE BE-C1, BE-M4, BE-M5; Plan A5; REGRESSION REG-C5 |
| **Estimated effort** | M |
| **Dependencies** | Prefer after security auth/JWT claim changes if overlapping; coordinate with OCR work |

---

### RC1-B10 — OCR serial lock + re-OCR on chat path

| | |
|--|--|
| **Priority** | Critical |
| **Area** | Performance / OCR |
| **Description** | Single Tesseract worker + global lock; multi-page OCR sequential; attachment parse/OCR and force-OCR can double work before first token. |
| **Why it matters** | File chats and concurrent docs stall TTFT; queues under load. |
| **Related audit report(s)** | PERFORMANCE BE-C3, BE-M1, BE-M2; Plan A6–A7 |
| **Estimated effort** | M |
| **Dependencies** | Upload sidecar already exists; memory budget for worker pool |

---

### RC1-B11 — Require Redis for Public Beta / multi-replica

| | |
|--|--|
| **Priority** | Critical |
| **Area** | Ops / Security / Performance |
| **Description** | Redis optional; rate limits and JWT revoke are process-local. Live `/ready` often shows `redis: not_configured`. |
| **Why it matters** | N replicas → N× rate-limit allowance; logout ineffective across instances — fairness and session security failure. |
| **Related audit report(s)** | PERFORMANCE INF-C2; SECURITY SEC-H7, SEC-M14; REGRESSION REG-M2, REG-M3; PRODUCTION PR-C3 |
| **Estimated effort** | S (policy + validateEnv) / M (Redis `jti` denylist) |
| **Dependencies** | Ops Redis provisioning; fail-fast when replicas > 1 |

---

### RC1-B12 — Restrict query-string bearer tokens + strip from logs

| | |
|--|--|
| **Priority** | High |
| **Area** | Security / Auth |
| **Description** | `extractAccessToken` accepts `?access_token=` / `?token=` on all `requireAuth` routes; loggers may serialize full URLs. |
| **Why it matters** | Tokens leak via access logs, proxies, Referer, history → session impersonation. |
| **Related audit report(s)** | SECURITY SEC-H6 |
| **Estimated effort** | S–M |
| **Dependencies** | Keep file content / WS exceptions intentional; prefer `Authorization` / `Sec-WebSocket-Protocol` |

---

### RC1-B13 — Enforce secret strength + distinct JWT vs NextAuth secrets

| | |
|--|--|
| **Priority** | High |
| **Area** | Security / Config |
| **Description** | `validateEnv` checks presence only; `AUTH_JWT_SECRET` can fall back to `NEXTAUTH_SECRET`. |
| **Why it matters** | Weak/shared secrets forge sessions and API JWTs with one compromise. |
| **Related audit report(s)** | SECURITY SEC-H8; PRODUCTION PR-C2 |
| **Estimated effort** | S |
| **Dependencies** | Pair with RC1-B05 fail-closed gates |

---

### RC1-B14 — Upgrade Next.js ≥16.3.0

| | |
|--|--|
| **Priority** | High |
| **Area** | Security / Dependencies |
| **Description** | Frontend pins `next@16.2.10` with high-severity advisories (middleware/proxy bypass, Server Actions DoS/SSRF). Fix in ≥16.3.0. |
| **Why it matters** | Known high CVEs on the app origin before Public Beta traffic. |
| **Related audit report(s)** | SECURITY SEC-H9; PRODUCTION Should-Fix |
| **Estimated effort** | S–M |
| **Dependencies** | Re-audit after upgrade; coordinate with frontend build/CI |

---

### RC1-B15 — Fix rate-limit IP keying (XFF spoof)

| | |
|--|--|
| **Priority** | High |
| **Area** | Security / API |
| **Description** | Rate-limit key uses leftmost `X-Forwarded-For`; production enables trust proxy by default. |
| **Why it matters** | Clients spoof IPs to bypass or exhaust another user’s bucket. |
| **Related audit report(s)** | SECURITY SEC-H12; PRODUCTION PR-D5 |
| **Estimated effort** | S |
| **Dependencies** | Correct proxy hop count; prefer user-id keys on authed routes |

---

### RC1-B16 — Unsigned billing webhooks fail closed in production

| | |
|--|--|
| **Priority** | High |
| **Area** | Security / Billing |
| **Description** | Missing Stripe/Razorpay signatures may return `ok: true` without mutating entitlements. |
| **Why it matters** | Hides misconfiguration; weakens monitoring of payment integrity. |
| **Related audit report(s)** | SECURITY SEC-M4; PRODUCTION PR-C4 |
| **Estimated effort** | S |
| **Dependencies** | Gateways enabled in prod |

---

### RC1-B17 — HTTP compression (exclude SSE/WS)

| | |
|--|--|
| **Priority** | High |
| **Area** | Performance / Infrastructure |
| **Description** | No Express `compression` middleware; package absent. |
| **Why it matters** | Uncompressed JSON APIs burn bandwidth on mobile/WAN. |
| **Related audit report(s)** | PERFORMANCE INF-M1; Plan A11 |
| **Estimated effort** | S |
| **Dependencies** | Must not compress `text/event-stream`; CDN (v1.0) can complement |

---

### RC1-B18 — Batch SSE token UI updates

| | |
|--|--|
| **Priority** | High |
| **Area** | Performance / Frontend |
| **Description** | Per-token `setMessages` re-renders ChatPage; virtualization does not help threads &lt; 40 messages. |
| **Why it matters** | Main-thread jank during the core streaming UX. |
| **Related audit report(s)** | PERFORMANCE FE-M2; Plan A8 |
| **Estimated effort** | M |
| **Dependencies** | Preserve Stop/Abort; share batching with research/agent deltas |

---

### RC1-B19 — Parallelize Deep Research `searchMany`

| | |
|--|--|
| **Priority** | High |
| **Area** | Performance / Research |
| **Description** | `searchMany` awaits queries sequentially; fetch concurrency already 4. |
| **Why it matters** | Searching phase ≈ N × provider latency for a flagship Pro feature. |
| **Related audit report(s)** | PERFORMANCE BE-M3; Plan A9 |
| **Estimated effort** | S |
| **Dependencies** | Provider rate limits / AbortSignal |

---

### RC1-B20 — Slim Docker defaults + frontend `dumb-init` / healthcheck

| | |
|--|--|
| **Priority** | High |
| **Area** | Ops / Infrastructure |
| **Description** | Backend image defaults install Playwright + Code Interpreter Python; frontend PID 1 without compose healthcheck. |
| **Why it matters** | Slow deploys/cold starts; messy SIGTERM on rolling frontend deploys. |
| **Related audit report(s)** | PERFORMANCE INF-C1, INF-M5; Plan A12; PRODUCTION PR-B3 |
| **Estimated effort** | S |
| **Dependencies** | Document slim vs full image when features enabled |

---

### RC1-B21 — CI first-load budget + refresh PERFORMANCE_REPORT + checklist perf gates

| | |
|--|--|
| **Priority** | High |
| **Area** | Performance / Process |
| **Description** | No CI bundle budget; `PERFORMANCE_REPORT.md` still claims 1.77 MB; launch checklist lacks perf acceptance criteria. |
| **Why it matters** | Bundle regressions re-enter unnoticed; RC1 can ship ops-green but perf-blind. |
| **Related audit report(s)** | PERFORMANCE FE-m8/m9, INF-M8; Plan A4, A14 |
| **Estimated effort** | S |
| **Dependencies** | RC1-B08 for realistic ≤1.8 MB budget |

---

### RC1-B22 — Align probes on `/ready` + probe grace

| | |
|--|--|
| **Priority** | High |
| **Area** | Ops / Infrastructure |
| **Description** | HTTP listens before Mongo/Redis ready; Dockerfile HEALTHCHECK uses `/health` while compose uses `/ready`. |
| **Why it matters** | Probe flapping and premature traffic during boot. |
| **Related audit report(s)** | PERFORMANCE INF-M3; PRODUCTION PR-I3 |
| **Estimated effort** | S |
| **Dependencies** | Orchestrator `start_period`; LB must use `/ready` |

---

### RC1-B23 — Gate browser approval poll (panel-open / visibility)

| | |
|--|--|
| **Priority** | Medium |
| **Area** | Performance / Frontend |
| **Description** | `useBrowser({ enabled: true })` polls approvals ≥8s for every logged-in session. |
| **Why it matters** | Continuous network wakeups/battery drain when Browser unused. |
| **Related audit report(s)** | PERFORMANCE FE-M4; Plan A13; REGRESSION REG-M9 |
| **Estimated effort** | S |
| **Dependencies** | Pending-approval UX must still surface when needed |

---

### RC1-B24 — Chat list `.lean()` + `$text` search; avoid multimodal deep-clone

| | |
|--|--|
| **Priority** | Medium |
| **Area** | Performance / Backend |
| **Description** | Chat list missing `.lean()`; `q` uses regex instead of text index. `multiProviderAgent` deep-clones base64 contents before tool loop. |
| **Why it matters** | Hot sidebar path + CPU/memory spike delaying first token on image routes. |
| **Related audit report(s)** | PERFORMANCE BE-M12, BE-M13; Plan A15–A16 |
| **Estimated effort** | S |
| **Dependencies** | None (quick wins alongside TTFT) |

---

### RC1-B25 — Execute launch checklist + staging smoke + secrets manager

| | |
|--|--|
| **Priority** | Critical |
| **Area** | Ops / Release |
| **Description** | `LAUNCH_CHECKLIST.md` is **0/24 checked**; no signed-off staging smoke; secrets manager / alerts unverified. |
| **Why it matters** | Cannot claim production readiness without executed ops gates. |
| **Related audit report(s)** | PRODUCTION PR-R1, PR-R2; REGRESSION Go/No-Go checklist |
| **Estimated effort** | S–M (ops) |
| **Dependencies** | Security/perf Must-Fix code lands first or in parallel for staging |

---

### RC1-B26 — Prove backups + restore drill; wire FE monitoring

| | |
|--|--|
| **Priority** | High |
| **Area** | Ops / Monitoring |
| **Description** | Backups documented not proven; FE Sentry is a stub; alerts/uptime unchecked. |
| **Why it matters** | No recovery evidence and blind client-side errors under Public Beta load. |
| **Related audit report(s)** | PRODUCTION PR-I1, PR-D1, PR-D2 |
| **Estimated effort** | M (ops) / S (FE Sentry) |
| **Dependencies** | Pre-deploy dump discipline; DSN secrets |

---

### RC1-B27 — Re-run Playwright user journey + Stop/Continue coverage

| | |
|--|--|
| **Priority** | High |
| **Area** | QA / Regression |
| **Description** | Full `userJourney.spec.ts` not re-run this RC1 pass; Stop/Continue lack dedicated integration tests. |
| **Why it matters** | Core stream controls can regress without automated guards before go. |
| **Related audit report(s)** | REGRESSION REG-M8; PRODUCTION Must-Fix #10 |
| **Estimated effort** | S–M |
| **Dependencies** | Staging with Redis healthy; after security/perf criticals stabilize |

---

### RC1-B28 — Isolate or feature-flag soft sandboxes for Public Beta tenants

| | |
|--|--|
| **Priority** | High |
| **Area** | Security / Sandboxes |
| **Description** | Code interpreter is userspace hardening on shared host identity; browser `--no-sandbox`. Security audit: do not enable MCP stdio / browser / CI for Public Beta until isolated or flagged off. |
| **Why it matters** | Soft jails make tool escape and SSRF impact catastrophic in multi-tenant. |
| **Related audit report(s)** | SECURITY SEC-H11 + Top blocker #10; PRODUCTION Must-Fix |
| **Estimated effort** | S (feature-flag / disable) / L (hard isolation) |
| **Dependencies** | RC1-B01, RC1-B04; product decision on Pro tool availability at beta |

---

# Should Fix Before v1.0

Required for GA scale, durability, and hardened delivery — not all block a tightly scoped closed beta, but block confident v1.0.

---

### RC1-B29 — Atlas Vector Search (or ANN) for RAG

| | |
|--|--|
| **Priority** | High |
| **Area** | Performance / RAG |
| **Description** | In-app cosine over up to 400 embeddings; no `$vectorSearch` / Atlas vector index. |
| **Why it matters** | Project chats will not scale; blocks TTFT at KB size. |
| **Related audit report(s)** | PERFORMANCE BE-C2; Plan B1–B2 |
| **Estimated effort** | L (+ S interim limits) |
| **Dependencies** | Atlas ops; embedding versioning; Redis gate helpful |

---

### RC1-B30 — Message storage strategy (collection / `$push` / pagination)

| | |
|--|--|
| **Priority** | High |
| **Area** | Backend / Data |
| **Description** | Entire `messages[]` embedded and rewritten; BSON ~16MB risk; large GET payloads. |
| **Why it matters** | Long-chat durability and rewrite cost for power users. |
| **Related audit report(s)** | PERFORMANCE BE-C4; Plan B3; ROADMAP M3 Chat/ChatV2 |
| **Estimated effort** | L–XL |
| **Dependencies** | Chat vs ChatV2 SoR; migration plan |

---

### RC1-B31 — Isolate ChatPage hooks (research / agent / browser)

| | |
|--|--|
| **Priority** | High |
| **Area** | Performance / Frontend |
| **Description** | Monolithic `page.tsx` mounts many always-on hooks; any stream can re-render the shell. |
| **Why it matters** | Runtime jank and idle work after bundle is fixed. |
| **Related audit report(s)** | PERFORMANCE FE-M3; Plan B4 |
| **Estimated effort** | L |
| **Dependencies** | RC1-B18 reduces urgency; panel APIs stable |

---

### RC1-B32 — CDN / immutable `/_next/static` cache

| | |
|--|--|
| **Priority** | High |
| **Area** | Performance / Delivery |
| **Description** | No CDN / `assetPrefix` / long-cache static headers; origin serves first-load JS. |
| **Why it matters** | Even a 1.8 MB budget needs edge delivery for global GA. |
| **Related audit report(s)** | PERFORMANCE INF-M2; Plan B7 |
| **Estimated effort** | M |
| **Dependencies** | CDN vendor; RC1-B21 budget still required |

---

### RC1-B33 — Redis shared caches (memory / entitlements / OCR hashes)

| | |
|--|--|
| **Priority** | High |
| **Area** | Performance / Data |
| **Description** | Memory/research process-local `Map`s; OCR/PDF mostly disk; entitlements uncached across instances. |
| **Why it matters** | Multi-instance cold caches and inconsistent latency after Redis rate-limit gate. |
| **Related audit report(s)** | PERFORMANCE BE-M6, BE-M7; Plan B5–B6 |
| **Estimated effort** | M |
| **Dependencies** | RC1-B11 |

---

### RC1-B34 — Wire metrics sink + replica runbook

| | |
|--|--|
| **Priority** | High |
| **Area** | Ops / Monitoring |
| **Description** | In-process metrics until sink wired; no external TTFT/error histograms. |
| **Why it matters** | Cannot run v1.0 SLOs without external observability. |
| **Related audit report(s)** | PERFORMANCE INF-M9; Plan B15; PRODUCTION PR-D6 |
| **Estimated effort** | M |
| **Dependencies** | Vendor choice; RC1-B11 for multi-replica |

---

### RC1-B35 — Replace or isolate `xlsx` (high vulns, no npm fix)

| | |
|--|--|
| **Priority** | High |
| **Area** | Security / Dependencies |
| **Description** | Direct `xlsx@^0.18.5` — prototype pollution + ReDoS; `fixAvailable: false`. |
| **Why it matters** | Untrusted spreadsheets can DoS or pollute parse path. |
| **Related audit report(s)** | SECURITY SEC-H10 |
| **Estimated effort** | M |
| **Dependencies** | Parser migration (`exceljs` / SheetJS Pro) or worker isolation |

---

### RC1-B36 — Hard-isolate code interpreter / browser (gVisor / dedicated container)

| | |
|--|--|
| **Priority** | High |
| **Area** | Security / Sandboxes |
| **Description** | Beyond feature-flag: run CI/browser in hard jail; fail closed if `unshare` unavailable; avoid `--no-sandbox` when possible. |
| **Why it matters** | Soft isolation is insufficient for GA multi-tenant Pro tools. |
| **Related audit report(s)** | SECURITY SEC-H11, SEC-C3; Plan follow-on from RC1-B28 |
| **Estimated effort** | L |
| **Dependencies** | RC1-B28 interim flags; full Docker image variant |

---

### RC1-B37 — Agent fast-path / stream plan status / skip verify when safe

| | |
|--|--|
| **Priority** | Medium |
| **Area** | Performance / Agents |
| **Description** | Plan → execute → verify (multi-LLM) before final answer stream. |
| **Why it matters** | High TTFB on agent runs. |
| **Related audit report(s)** | PERFORMANCE BE-M8; Plan B9 |
| **Estimated effort** | M |
| **Dependencies** | Product rules for when verify is required |

---

### RC1-B38 — Warm Chromium + Code Interpreter kernel pools

| | |
|--|--|
| **Priority** | Medium |
| **Area** | Performance / Heavy features |
| **Description** | First browser automation and first CI execute pay cold launch/spawn. |
| **Why it matters** | Multi-second cold starts for Pro tool users at GA. |
| **Related audit report(s)** | PERFORMANCE BE-M9, BE-M10; Plan B10–B11 |
| **Estimated effort** | S–M / M |
| **Dependencies** | Full image; security sandbox limits; idle memory cost |

---

### RC1-B39 — Analytics DailyUsage batch; SSE drain on shutdown

| | |
|--|--|
| **Priority** | Medium |
| **Area** | Performance / Ops |
| **Description** | Per-request DailyUsage upsert; graceful shutdown force-exits at 15s while SSE holds connections. |
| **Why it matters** | Write amplification under load; rolling deploys cut streams → reconnect storms. |
| **Related audit report(s)** | PERFORMANCE BE-M11, INF-M6; Plan B12–B13; PRODUCTION PR-D3 |
| **Estimated effort** | S–M / M |
| **Dependencies** | Client reconnect behavior; LB drain |

---

### RC1-B40 — Scope `express.json` 30mb; tighten incomplete rate limits

| | |
|--|--|
| **Priority** | Medium |
| **Area** | Security / Reliability |
| **Description** | Global 30mb JSON; some expensive routes lack limiters. |
| **Why it matters** | Heap/DoS under concurrent large bodies or unthrottled authed endpoints. |
| **Related audit report(s)** | SECURITY SEC-M6; PERFORMANCE INF-M7; Plan B14 |
| **Estimated effort** | S–M |
| **Dependencies** | Audit all large-body routes |

---

### RC1-B41 — Improve virtualization + trim Framer Motion on shell

| | |
|--|--|
| **Priority** | Medium |
| **Area** | Performance / Frontend |
| **Description** | Window only after 40 messages; estimated heights; FM on critical chrome. |
| **Why it matters** | Long-thread scroll jank and extra runtime after bundle work. |
| **Related audit report(s)** | PERFORMANCE FE-M5, FE-M6; Plan B16–B17 |
| **Estimated effort** | M |
| **Dependencies** | RC1-B18 first |

---

### RC1-B42 — CI Docker build + Next/Docker layer caches; blocking perf budgets

| | |
|--|--|
| **Priority** | Medium |
| **Area** | Ops / CI |
| **Description** | No Docker image job; Next cache absent; perf job `continue-on-error`. |
| **Why it matters** | Late deploy failures and silent perf regressions. |
| **Related audit report(s)** | PERFORMANCE INF-M4; Plan B8; PRODUCTION PR-B4, PR-D4 |
| **Estimated effort** | M |
| **Dependencies** | RC1-B21 budget script |

---

### RC1-B43 — Frontend CSP + OAuth `email_verified` + admin demotion

| | |
|--|--|
| **Priority** | Medium |
| **Area** | Security / Auth |
| **Description** | Next origin lacks API-equivalent CSP; OAuth linking without `email_verified`; `VANI_ADMIN_EMAILS` promote-only. |
| **Why it matters** | Larger XSS blast radius; account-linking risk; stale platform admins. |
| **Related audit report(s)** | SECURITY SEC-M13, SEC-M2, SEC-M1 |
| **Estimated effort** | M / M / S |
| **Dependencies** | XSS fixes (RC1-B07) first for CSP value |

---

### RC1-B44 — Zod (or equivalent) at write-route boundaries

| | |
|--|--|
| **Priority** | Medium |
| **Area** | Security / API |
| **Description** | Almost no schema validation library; ad hoc controller checks. |
| **Why it matters** | Inconsistent bounds; mass-assignment / injection regression risk at scale. |
| **Related audit report(s)** | SECURITY SEC-M5 |
| **Estimated effort** | L |
| **Dependencies** | Prioritize chat/upload/MCP write routes |

---

### RC1-B45 — Uploads AV scanning; restrict ZIP; restrict public `/health`

| | |
|--|--|
| **Priority** | Medium |
| **Area** | Security / Ops |
| **Description** | No malware scan; `.zip` allowed; unauthenticated `/health` exposes capacity diagnostics. |
| **Why it matters** | Malware hosting / zip bombs; recon fingerprinting. |
| **Related audit report(s)** | SECURITY SEC-M7, SEC-M8; PRODUCTION PR-I4 |
| **Estimated effort** | M–L / S |
| **Dependencies** | Ops AV vendor for full scan |

---

### RC1-B46 — Stable public error codes; shorten NextAuth session; document Chat/ChatV2 SoR

| | |
|--|--|
| **Priority** | Medium |
| **Area** | Security / Platform |
| **Description** | Controllers sometimes return `err.message`; session ~30d vs API JWT 1h; dual Chat models undocumented as SoR. |
| **Why it matters** | Info leak; stolen cookie remints tokens for weeks; migration/rollback risk. |
| **Related audit report(s)** | SECURITY SEC-M9, SEC-M3; PRODUCTION PR-I2; ROADMAP M3 |
| **Estimated effort** | M / S / M |
| **Dependencies** | RC1-B30 for full message migration |

---

### RC1-B47 — Dynamic-import lightboxes/workspaces; agent/research unmount abort

| | |
|--|--|
| **Priority** | Medium |
| **Area** | Performance / Frontend |
| **Description** | Eager lightbox/workspace imports; missing abort on agent/research unmount. |
| **Why it matters** | Extra always-parsed UI; stale setState on remount. |
| **Related audit report(s)** | PERFORMANCE FE-m6, FE-m4; Plan B18 |
| **Estimated effort** | S–M |
| **Dependencies** | Complements RC1-B31 |

---

### RC1-B48 — Frontend compose bake-arg API URL; release tag / `SENTRY_RELEASE` discipline

| | |
|--|--|
| **Priority** | Medium |
| **Area** | Ops / Release |
| **Description** | Compose FE bake-arg points at `localhost:5001`; live `/version` `release: null`. |
| **Why it matters** | Broken remote clients; untraceable deploys. |
| **Related audit report(s)** | PRODUCTION PR-B2, PR-I5, PR-R3 |
| **Estimated effort** | S |
| **Dependencies** | Per-env build pipeline |

---

### RC1-B49 — PDF Intelligence product UI (or drop marketing claims)

| | |
|--|--|
| **Priority** | Medium |
| **Area** | Product / QA |
| **Description** | Backend PDF ask/search/tables verified; no FE panel — upload understand only. |
| **Why it matters** | Marketed capability without product chrome is a trust regression. |
| **Related audit report(s)** | REGRESSION REG-M6; PRODUCTION Nice-to-have |
| **Estimated effort** | M–L (UI) / XS (docs-only) |
| **Dependencies** | Product decision: ship UI vs remove claims |

---

### RC1-B50 — Image text-to-image provider fallback; keep Voice Live non-default until bridge

| | |
|--|--|
| **Priority** | Medium |
| **Area** | Product / Resilience |
| **Description** | Text-to-image Gemini-only; `VOICE_ENGINE=live` lacks matching client bridge. |
| **Why it matters** | Resilience and accidental prod flag risk. |
| **Related audit report(s)** | REGRESSION REG-M11, REG-M10 |
| **Estimated effort** | M / document |
| **Dependencies** | Provider keys; Live client work |

---

# Can Wait Until After Launch

Polish, secondary surfaces, and opportunistic gains — schedule after Public Beta / v1.0 gates.

---

### RC1-B51 — Mermaid CDN / lighter diagram path

| | |
|--|--|
| **Priority** | Low |
| **Area** | Performance / Frontend |
| **Description** | Mermaid correctly deferred but cold open is heavy. |
| **Why it matters** | Infrequent path; already dynamic. |
| **Related audit report(s)** | PERFORMANCE FE-m7; Plan C1 |
| **Estimated effort** | M |
| **Dependencies** | Artifact preview already dynamic |

---

### RC1-B52 — Browser screenshot lazy/async; `next/image` for marketing assets

| | |
|--|--|
| **Priority** | Low |
| **Area** | Performance / Frontend |
| **Description** | Screenshots lack `loading="lazy"`; no `next/image` pipeline for static pages. |
| **Why it matters** | Minor bandwidth; chat blobs are API-served. |
| **Related audit report(s)** | PERFORMANCE FE-m2, INF-m2; Plan C2–C3 |
| **Estimated effort** | S |
| **Dependencies** | Marketing surfaces if any |

---

### RC1-B53 — Pin Next compress / source maps / poweredBy; prefer edge Brotli

| | |
|--|--|
| **Priority** | Low |
| **Area** | Ops / Frontend |
| **Description** | Explicit `compress`, `productionBrowserSourceMaps: false`, hide `X-Powered-By`. |
| **Why it matters** | Explicit posture; edge already preferred via CDN. |
| **Related audit report(s)** | PERFORMANCE INF-m1; SECURITY SEC-L8; PRODUCTION PR-B5; Plan C4 |
| **Estimated effort** | XS |
| **Dependencies** | RC1-B32 CDN |

---

### RC1-B54 — Parallel MCP health checks; cache Playwright browsers in GHA

| | |
|--|--|
| **Priority** | Low |
| **Area** | Performance / CI |
| **Description** | Sequential MCP health adds Settings latency; e2e re-downloads browsers. |
| **Why it matters** | Eng/CI time and Settings polish only. |
| **Related audit report(s)** | PERFORMANCE BE-m2, INF-m6; Plan C7–C8 |
| **Estimated effort** | S |
| **Dependencies** | RC1-B42 CI work helpful |

---

### RC1-B55 — Gated live TTFT smoke in staging

| | |
|--|--|
| **Priority** | Medium (process) |
| **Area** | QA / Performance |
| **Description** | Perf tests mock Gemini — blind to real latency. |
| **Why it matters** | Process quality for SLOs; not user-direct. |
| **Related audit report(s)** | PERFORMANCE BE-m5; Plan C9 |
| **Estimated effort** | M |
| **Dependencies** | Staging keys; cost controls; after Phase A baselines |

---

### RC1-B56 — Client-shell RSC architecture rethink

| | |
|--|--|
| **Priority** | Low |
| **Area** | Frontend / Architecture |
| **Description** | Entire `/` is `'use client'`; little RSC benefit. |
| **Why it matters** | Long-term architecture; not required if client graph shrinks via Must/Should fixes. |
| **Related audit report(s)** | PERFORMANCE FE-M7; Plan C10 |
| **Estimated effort** | L–XL |
| **Dependencies** | RC1-B31 isolation first |

---

### RC1-B57 — Memory / PDF vector index alignment (beyond RAG)

| | |
|--|--|
| **Priority** | Medium |
| **Area** | Performance / Data |
| **Description** | Same in-app embedding pattern as RAG for Memory/PDF intelligence search. |
| **Why it matters** | Scale gap if candidate sets grow; less urgent if limits stay small. |
| **Related audit report(s)** | PERFORMANCE BE-C2 related; Plan C11 |
| **Estimated effort** | L |
| **Dependencies** | RC1-B29 patterns/tooling |

---

### RC1-B58 — Frontend vitest worker pool flaky under load

| | |
|--|--|
| **Priority** | Medium |
| **Area** | QA / CI |
| **Description** | 108 tests passed but 7 “Timeout waiting for worker” errors; exit still 0. |
| **Why it matters** | Masks real CI failures under host memory pressure. |
| **Related audit report(s)** | REGRESSION REG-M1 |
| **Estimated effort** | S |
| **Dependencies** | Cap workers; fail on pool errors |

---

### RC1-B59 — Known Issues polish (research history/resume, agent retry, browser PDF, session persistence)

| | |
|--|--|
| **Priority** | Low |
| **Area** | Product / Known Issues |
| **Description** | Research history UI missing; research restart-only; Gemini-only agent plan; agent HTTP retry re-runs; browser PDF unimplemented; browser/MCP process-local sessions. |
| **Why it matters** | Documented gaps (KI-004…011); not Public Beta blockers if marketed honestly. |
| **Related audit report(s)** | REGRESSION REG-m1–m6; KNOWN_ISSUES |
| **Estimated effort** | Variable |
| **Dependencies** | Product prioritization post-launch |

---

### RC1-B60 — Mongoose index / deprecation cleanup

| | |
|--|--|
| **Priority** | Low |
| **Area** | Backend / Hygiene |
| **Description** | Duplicate index warnings on Subscription/Invoice/DailyUsage; deprecated `findOneAndUpdate` `new` option. |
| **Why it matters** | Boot noise; future mongoose breakage. |
| **Related audit report(s)** | REGRESSION REG-m10, REG-m11 |
| **Estimated effort** | S |
| **Dependencies** | None |

---

### RC1-B61 — Mermaid SVG sanitize; mongoose `sanitizeFilter`; share expiry/password

| | |
|--|--|
| **Priority** | Low |
| **Area** | Security / Hardening |
| **Description** | Residual Mermaid SVG XSS; no global `sanitizeFilter`; share is unguessable link-only. |
| **Why it matters** | Defense-in-depth; low today given artifact sandbox / ownership. |
| **Related audit report(s)** | SECURITY SEC-L4, SEC-L5, SEC-L6 |
| **Estimated effort** | S |
| **Dependencies** | None |

---

### RC1-B62 — Org member email roster restriction; artifact CSP invariant docs

| | |
|--|--|
| **Priority** | Low |
| **Area** | Security / Privacy |
| **Description** | Any org member sees roster emails (Business APIs; UI paused); artifact sanitizer minimal inside sandbox. |
| **Why it matters** | PII within org; residual if sandbox flags change. |
| **Related audit report(s)** | SECURITY SEC-M10, SEC-M11 |
| **Estimated effort** | S |
| **Dependencies** | Business UI still paused for v1 |

---

### RC1-B63 — Defer browser path existsSync; forbid debug env flags in prod compose

| | |
|--|--|
| **Priority** | Low |
| **Area** | Ops |
| **Description** | Tiny boot IO for browser path check; `MCP_DEBUG` etc. can leak if set. |
| **Why it matters** | Tight boot budgets / log hygiene. |
| **Related audit report(s)** | PERFORMANCE INF-m5; SECURITY SEC-L9; PRODUCTION PR-C5 |
| **Estimated effort** | XS |
| **Dependencies** | Prod compose overlay |

---

### RC1-B64 — Backend `tsc` gate for TypeScript modules

| | |
|--|--|
| **Priority** | Low |
| **Area** | CI / Build |
| **Description** | Backend “build” is syntax-only (`checkSyntax.js`), not full TS compile. |
| **Why it matters** | Stronger compile gate for TS-heavy modules. |
| **Related audit report(s)** | PRODUCTION Nice-to-have |
| **Estimated effort** | M |
| **Dependencies** | Mixed JS/TS tree |

---

### RC1-B65 — Shared project share 501 / keep UI hidden; creative agents “coming soon”

| | |
|--|--|
| **Priority** | Low |
| **Area** | Product |
| **Description** | Project collaboration share returns 501 (paused); creative agents gated as coming soon. |
| **Why it matters** | Already paused for v1 — verify UI stays hidden. |
| **Related audit report(s)** | REGRESSION REG-M7, REG-m8 |
| **Estimated effort** | XS (verify) |
| **Dependencies** | Business pause remains |

---

### RC1-B66 — Extend FeaturePanels lazy pattern (maintain)

| | |
|--|--|
| **Priority** | Low |
| **Area** | Performance / Frontend |
| **Description** | FeaturePanels registry is healthy — keep extending rather than one-shot rewrite. |
| **Why it matters** | Incremental delivery hygiene. |
| **Related audit report(s)** | PERFORMANCE FE-m1; Plan C12 |
| **Estimated effort** | Ongoing / S per panel |
| **Dependencies** | RC1-B08, RC1-B47 |

---

## Summary counts

| Severity | Count | Notes |
|----------|------:|-------|
| **Total Critical** | **12** | B01–B06, B07–B11, B25 (RCE/SSRF/ports/gating/XSS/bundle/TTFT/OCR/Redis/ops checklist) |
| **Total High** | **24** | Remaining Must-Fix Highs + Should-Fix Highs (auth, deps, delivery, sandboxes, RAG, messages, CDN, metrics, …) |
| **Total Medium** | **30** | Must-Fix Mediums + Should-Fix Mediums + process Mediums in Can Wait |

*(Low-priority Can Wait items are tracked but not included in the Critical/High/Medium totals above.)*

### Overall Release Status

**No-Go**

| Path | Decision |
|------|----------|
| **Public Beta** | **No-Go** |
| **Private dogfood / staging** | **Conditional Go** if Redis on, MCP stdio off, browser off/isolated, secrets in manager, LB on `/ready`, gating kill-switch unset |
| **Compose “production” on a public IP as-is** | **No-Go** (DB ports) |

---

## Recommended Implementation Order

Assumes ~1–2 engineers; security and performance streams parallelize where they do not collide on auth/middleware.

### Week 1 — Security kill-switches + ops footguns

1. **RC1-B01 / B02** — Disable MCP stdio (or allowlist) + scrub env  
2. **RC1-B03** — Unpublish / authenticate Mongo & Redis ports  
3. **RC1-B05 / B13** — Fail closed on gating kill-switch + secret strength  
4. **RC1-B07** — Canvas richtext sanitize + markdown href allowlist  
5. **RC1-B11** (policy slice) — Require Redis for multi-replica / Public Beta; document single-instance  
6. **RC1-B28** (interim) — Feature-flag / disable soft-sandbox Pro tools for beta tenants if not isolated  
7. Start **RC1-B04 / B06** SSRF design (browser + research redirects + remote MCP)

**Exit:** No host RCE path via MCP stdio; no open DB ports; no gating/secret footguns; XSS on primary surfaces closed or in PR.

### Week 2 — SSRF / auth hardening + frontend bundle

1. Finish **RC1-B04 / B06** — Browser + research + MCP SSRF  
2. **RC1-B12 / B15 / B16** — Query JWT restrict, rate-limit keying, webhook fail-closed  
3. **RC1-B14** — Upgrade Next ≥16.3.0  
4. **RC1-B08** — Dynamic ExportMenu/jspdf; split canvas barrel; start KaTeX lazy-load  
5. **RC1-B17 / B20 / B22** — Compression; slim Docker + FE healthcheck; `/ready` alignment  
6. **RC1-B21** — CI bundle budget + checklist perf section (after bundle drop measurable)

**Exit:** SSRF policy live; `/` first-load trending ≤1.8 MB; Redis required in prod-shaped deploys.

### Week 3 — Chat TTFT / OCR / stream UX + Redis denylist

1. **RC1-B09** — Parallelize chat pre-stream; drop redundant User; cache FeatureGate  
2. **RC1-B10** — Persist OCR at upload; dedupe force-OCR; worker pool  
3. **RC1-B18** — Batch SSE token updates  
4. **RC1-B19 / B23 / B24** — Research parallel search; gate browser poll; lean/`$text`/clone quick wins  
5. **RC1-B11** (complete) — Redis JWT `jti` denylist  
6. Begin **RC1-B25 / B26** — Staging smoke, secrets manager, backup drill, FE Sentry

**Exit:** Measurable TTFT improvement; no double OCR with sidecar; streaming smooth; logout works multi-instance.

### Week 4 — Release gates + v1.0 kickoff

1. Complete **RC1-B25 / B26 / B27** — Launch checklist execution, monitoring, Playwright + Stop/Continue coverage  
2. Staging `/ready` with Redis healthy + memory headroom  
3. Re-score Public Beta: if Must-Fix closed → **Conditional Go** or **Go** for beta  
4. Start Should-Fix track: **RC1-B29** interim RAG limits → vector search plan; **RC1-B35** xlsx; **RC1-B32** CDN; **RC1-B34** metrics  
5. Schedule **RC2** residual Critical/High leftovers into the Critical Blockers Sprint

**Exit:** Ops evidence for go/no-go; open signup only if Must-Fix list is empty.

---

## Document control

| | |
|--|--|
| **Task** | RC1-FINAL Release Blocker Consolidation |
| **Next** | RC2-1 Critical Blockers Sprint (implement Must-Fix) |
| **Status** | Consolidation complete — **0 application source fixes applied** |

---

*End of RC1 Release Blockers.*
