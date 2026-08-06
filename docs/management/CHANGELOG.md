# VANI AI — Changelog

> Human-readable history of notable changes.  
> Prefer “why / user impact” over file lists.  
> Companion: [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md), [DECISIONS.md](./DECISIONS.md).

Format inspired by [Keep a Changelog](https://keepachangelog.com/).  
Versioning follows SemVer when tags are cut (`MAJOR.MINOR.PATCH`).

---

## [Unreleased]

### Added

- Business Teams API persistence: durable `Team` model with membership; real `GET/POST /api/teams` and `GET /api/teams/:id` (Business+ gated). See [TEAMS_PERSISTENCE_REPORT.md](../reports/TEAMS_PERSISTENCE_REPORT.md).
- Business Org Admin API persistence: durable `Organization` model with seats, members, and settings; real `GET /api/admin`, `GET /api/admin/members`, `PATCH /api/admin/settings` (Business+ gated). See [ORG_ADMIN_REPORT.md](../reports/ORG_ADMIN_REPORT.md).

### Changed

- **Public Beta Decision:** Release Manager Conditional GO for open signup under ops constraints. Version **`1.0.0-beta.1`**, date **TBD**, product score **7.6/10**. Includes remaining High items, known limitations, deploy/rollback/monitoring/support plans, and GA exit criteria. No application code changes. See [PUBLIC_BETA_DECISION.md](../releases/PUBLIC_BETA_DECISION.md). Sprint board: Public Beta Decision → Review; **Current Task = Waiting For Operator Release**.
- **RC2.5 Public Beta Critical Blockers:** Closed remaining Critical Must-Fix — XSS, research/MCP SSRF redirects, Redis JWT denylist, engineering staging tooling/sign-off. See [RC25_CRITICAL_FIX_REPORT.md](../reports/RC25_CRITICAL_FIX_REPORT.md). Sprint board: RC2.5 → Review; **Current Task = Public Beta Decision**.
- **RC2-4 Final Verification:** Full post-RC2 verification — backend CI **752** passed, FE **185** passed, production build + bundle **1.254 MB**, smoke PASS, Playwright user journey PASS. Regression fixes only (E2E harness, auth sync race, usage `periodEnd`, Account menu stacking, stale unit assertions). Product score **7.2/10**; Public Beta **No-Go**. See [FINAL_VERIFICATION_REPORT.md](../reports/FINAL_VERIFICATION_REPORT.md). Sprint board: RC2-4 → Review; **Current Task = Release Decision**.
- **RC2-3 Production Hardening:** Frontend Sentry (`@sentry/nextjs`), production secret strength + distinct JWT/NextAuth, Compose `REQUIRE_REDIS` + FE healthcheck, gated `/health` diagnostics, access-log URL token scrub, ops runbook + backup verifier, launch checklist engineering gates. See [PRODUCTION_HARDENING_REPORT.md](../reports/PRODUCTION_HARDENING_REPORT.md). Sprint board: RC2-3 → Review; **Current Task = RC2-4 Final Verification Sprint**.
- **RC2-2 Performance Phase A:** Bundle **2.284 MB → 1.252 MB**; chat TTFT parallelization; OCR worker pool; SSE delta batching; Express compression; Redis multi-replica gate; slim Docker + FE `dumb-init`; CI bundle budget. See [PERFORMANCE_FIX_REPORT.md](../reports/PERFORMANCE_FIX_REPORT.md). Sprint board: RC2-2 → Review; **Current Task = RC2-3 Production Hardening Sprint**.
- **RC2-1 Security Critical Fixes:** Implemented Must-Fix security Criticals — MCP stdio RCE disabled (+ scrubbed env), browser SSRF via `validatePublicUrl`, compose Mongo/Redis host ports removed, production refuses `FEATURE_GATING_DISABLED`. See [SECURITY_FIX_REPORT.md](../reports/SECURITY_FIX_REPORT.md). Sprint board: RC2-1 → Review; **Current Task = RC2-2 Performance Critical Sprint**.
- **RC1-FINAL Release Blocker Consolidation:** Merged Perf / Security / Regression / Production Readiness into one ranked list (no app source changes). Must Fix **28** / Should Fix **22** / Can Wait **16**; **Critical 12** / **High 24** / **Medium 30**; **Overall Release Status: No-Go**. Four-week implementation order included. See [RC1_BLOCKERS.md](../reports/RC1_BLOCKERS.md). Sprint board: RC1-FINAL → Review; **Current Task = RC2-1 Critical Blockers Sprint**.
- **RC1-L1 Production Readiness Audit:** Build/Docker/env/CI/health/backup/monitoring/launch-checklist review (no app source changes). Score **4.8/10**; verdict **No-Go** Public Beta; **Conditional Go** for locked staging. Launch checklist **0/24** checked; Redis often absent; FE Sentry stub; compose DB ports + prior security/perf blockers still open. See [PRODUCTION_READINESS_AUDIT.md](../reports/PRODUCTION_READINESS_AUDIT.md). Sprint board: Production Readiness → Review; **Current Task = RC1-FINAL Release Blocker Consolidation**.
- **RC1-R1 Full Regression Audit:** Journey verification across auth, chat, voice, memory, projects/RAG, research, agents, browser, MCP, code interpreter, OCR/PDF, images, uploads, billing, settings, share, exports. Score **6.2/10**; launch risk **High**; verdict **NO-GO** for Public Beta. Backend unit 480 + security 15 + focused integration green; live login→history→stream smoke pass; open Critical security/perf blockers unchanged. See [REGRESSION_AUDIT.md](../reports/REGRESSION_AUDIT.md). Sprint board: Regression Audit → Review; **Current Task = RC1-L1 Production Readiness Audit**.
- **RC1-S1 Security Audit:** Full auth/authz/API/uploads/secrets/infra/dependency audit (no code changes). Overall score **5.5/10**; launch risk **High**. Critical: MCP stdio host RCE, unauthenticated compose Mongo/Redis ports, browser SSRF, `FEATURE_GATING_DISABLED` kill-switch. High: canvas XSS, markdown `javascript:` hrefs, query-string JWT leakage, in-memory revoke, Next/xlsx advisories. See [SECURITY_AUDIT.md](../reports/SECURITY_AUDIT.md). Sprint board: Security Audit → Review; **Current Task = RC1-R1 Full Regression Audit**.
- **RC1-P1 Performance Implementation Plan:** Classified every audit finding into Phase **A** (must fix before Public Beta), **B** (before v1.0), **C** (post-launch), with impact/effort/dependencies/risk per item. See [PERFORMANCE_IMPLEMENTATION_PLAN.md](../reports/PERFORMANCE_IMPLEMENTATION_PLAN.md). No code changes.
- **RC1-P1 Performance Audit:** Full frontend/backend/infrastructure audit (no code changes). Overall score **5.8/10**; launch risk **Medium–High**. First-load `/` JS **~2.28 MB** (regressed from Sprint 1 **1.77 MB**); chat TTFT blocked by serial Mongo/OCR/RAG; no vector index; OCR single-worker; no Express compression; Redis optional under multi-replica. See [PERFORMANCE_AUDIT.md](../reports/PERFORMANCE_AUDIT.md). Sprint board: Performance Audit → Review; **Current Task = RC1-S1 Security Audit**.
- Planning docs split: `ROADMAP.md` is long-term milestones only; `docs/management/SPRINT_BOARD.md` is the sole current-sprint source of truth (exactly one Current Task).
- **v1 priority shift:** VANI AI v1 is a consumer AI product. Business/Enterprise feature development paused (Teams UI, Org Admin UI, Shared Projects, Enterprise Dashboard, Seat Management). Sprint refocused on consumer experience; **Current Task = Deep Research**. Existing Business backend left intact.
- **Sprint C1 COMPLETE:** Consumer AI Experience verification (C1-1…C1-10) finished and moved to Review.
- **RC1-UI-1 Accent Identity:** Unified brand accent on design tokens (`--accent` / `bg-accent` / related); removed Apple-blue / indigo hardcodes across Voice, Research, Browser, Code Interpreter, Analytics, Agents, Memory, MCP, Share, and chrome. See [UI_ACCENT_REPORT.md](../reports/UI_ACCENT_REPORT.md). Polish board: Accent Identity → Review; **Current Task = Focus States** ([UI_POLISH_BOARD.md](./UI_POLISH_BOARD.md)).
- **RC1-UI-2 Focus States:** Restored keyboard focus visibility — composer shell uses `--focus-ring`; form fields/editors no longer neutralize outlines; bare `outline-none` without replacement cleared. See [UI_FOCUS_REPORT.md](../reports/UI_FOCUS_REPORT.md). Polish board: Focus States → Review; **Current Task = Panel Skeletons**.
- **RC1-UI-3 Panel Skeletons:** Replaced lazy `null` loaders with shared modal/side/inline/voice skeleton shells; mount-on-open for settings modals to avoid blank flashes. See [UI_SKELETONS_REPORT.md](../reports/UI_SKELETONS_REPORT.md). Polish board: Panel Skeletons → Review; **Current Task = Button/Input Primitives**.
- **RC1-UI-4 Button/Input Primitives:** Added shared `Button` + `Input`/`Textarea`/`Select`/`SearchInput`/`FilePicker`/`DropdownTrigger`; migrated Auth, Confirm, ErrorState, Billing, Memory, MCP, Analytics, CI, Automation, Browser permission, Research, and Tasks CTAs/forms. See [UI_COMPONENTS_REPORT.md](../reports/UI_COMPONENTS_REPORT.md). Polish board: Button/Input Primitives → Review; **Current Task = Empty States**.
- **RC1-UI-5 Empty + Error adoption:** Adopted shared `PremiumEmpty` + `ErrorState` across Memory, MCP, Billing, Analytics/Admin, Share, Research, Browser, Automation, Projects/Files/Tasks, Sidebar search, Command palette, CI, Canvas, Agents, and Artifacts ErrorBoundary. See [UI_EMPTY_ERROR_REPORT.md](../reports/UI_EMPTY_ERROR_REPORT.md). Polish board: Empty + Error → Review; **Current Task = Typography**.
- **RC1-UI-7 Typography Consistency:** Tokenized type scale (`text-micro`…`text-heading`); cleared arbitrary `text-[Npx]`; Inter remains UI face with SF display for brand headings; Button/Input and required surfaces aligned. See [UI_TYPOGRAPHY_REPORT.md](../reports/UI_TYPOGRAPHY_REPORT.md). Polish board: Typography → Review; **Current Task = Share Page Brand Alignment**.

### Fixed

- RC2-4 verification regressions: E2E API port override (`NEXT_PUBLIC_API_PORT`), MCP stdio E2E opt-in, E2E Pro bootstrap, auth `/sync` duplicate-key race, Usage upsert `periodEnd` conflict, sidebar Account menu open direction/z-index, FE unit label/class drift, E2E placeholder/Memory/logout locators.
- Deep Research: restore interrupted-session Resume chrome after reload; persist sources mid-run on fresh sessions; handle `code_analysis` SSE events; align live report header confidence with backend chat append. See [DEEP_RESEARCH_REPORT.md](../reports/DEEP_RESEARCH_REPORT.md).
- AI Agents: honor SSE `replace` deltas in chat UI; pass session allow-list (incl. MCP) into planner; enforce final-answer timeout; sync client fallback agent tool lists; fix Pro-gated integration tests. See [AI_AGENTS_REPORT.md](../reports/AI_AGENTS_REPORT.md).
- Browser Automation: block non-http(s) navigation; surface real step errors before verify; persist downloads to session dir; keep screenshots out of parallel extract batches; fix stale URL after tab switch; engine-aware install hints; Pro-gated integration tests. See [BROWSER_AUTOMATION_REPORT.md](../reports/BROWSER_AUTOMATION_REPORT.md).
- MCP: Pro-gated integration tests; unique multi-tenant agent tool names (server-id suffix); user-scoped agent allow-list; retry Mongo bootstrap after failure; surface MCP `isError` text; ownership checks on permission grant/revoke. See [MCP_REPORT.md](../reports/MCP_REPORT.md).
- Code Interpreter: fix kernel startup ReferenceError when execution is enabled; make timeout resolution consistent (`timeout` vs `interrupted`) under the Node-side timeout race; add end-to-end session + file + interrupt/timeout integration coverage. See [CODE_INTERPRETER_REPORT.md](../reports/CODE_INTERPRETER_REPORT.md).
- Projects/RAG: add end-to-end integration verification for project CRUD, KB upload/index/search, duplicate uploads, large-doc retrieval, and chat RAG context injection; fix malformed project file-id delete path to return a client-safe not-found error instead of HTTP 500. See [RAG_REPORT.md](../reports/RAG_REPORT.md).
- OCR/PDF Intelligence: verify end-to-end upload→parse/OCR→analyze/ask/search/table→SSE flow, large-PDF performance, and chat/project-research integrations; fix `verifyDocumentUnderstanding` staging metadata to include required `ownerId` so the verifier runs against current ownership checks. See [OCR_PDF_REPORT.md](../reports/OCR_PDF_REPORT.md).
- Image Generation: verify Gemini text-to-image prompt/aspect/safety handling, tool failure normalization, model-router/fallback metadata path, and chat persistence/download integration; add integration coverage for SSE image event + stored file retrieval. See [IMAGE_GENERATION_REPORT.md](../reports/IMAGE_GENERATION_REPORT.md).
- Image Editing: verify Gemini + OpenAI edit providers, force-edit routing, source validation, chat upload→edit→persist→download; strip base64 after successful persist for all providers; add integration + prepareEditSource coverage. See [IMAGE_EDITING_REPORT.md](../reports/IMAGE_EDITING_REPORT.md).
- File Upload: verify composer multi-file upload (types, limits, duplicates, parallel), signatures/ownership/security, and chat `fileIds` hydration; add owned `DELETE /api/files/:id` and wire cancel/remove cleanup to prevent orphan uploads. See [FILE_UPLOAD_REPORT.md](../reports/FILE_UPLOAD_REPORT.md).

### Security

- **RC2.5 / RC1-B07:** XSS hardening — canvas richtext sanitized via DOMPurify (`sanitizeRichtextHtmlSafe`); markdown/chat/share/artifact links allow only `http:`/`https:`/`mailto:` (`safeHref` + `urlTransform`); Next.js app-origin CSP + security headers in `next.config.ts`.
- **RC2.5 / RC1-B06:** Research fetch uses `redirect: "manual"` with per-hop `validatePublicUrl` + DNS private-IP checks (`fetchWithSafeRedirects`); remote MCP http/sse/ws URLs rejected for localhost/loopback/metadata/private/internal hosts.
- **RC2.5 / RC1-B11:** Redis JWT `jti`/token-hash denylist for multi-replica logout/revoke (local Map L1 + Redis when configured); multi-session tokens remain independent.
- **RC2-3 / PR-C2 / RC1-B13:** Production boot requires distinct `AUTH_JWT_SECRET` and `NEXTAUTH_SECRET` (≥32 chars each); rejects weak placeholders; refuses `MCP_DEBUG` / `BROWSER_DEBUG` / `VANI_DEBUG`.
- **RC2-3 / PR-I4:** Production `GET /health` omits disk/memory capacity unless `VANI_HEALTH_DETAILED=true`.
- **RC2-3 / logging:** Access logs scrub `access_token` / `token` query params via `scrubUrlForLogs`.
- **RC2-1 / RC1-B05:** Production boot refuses `FEATURE_GATING_DISABLED=true` via `validateEnv`; `FeatureGate` also ignores the kill-switch when `NODE_ENV=production` (defense in depth).
- **RC2-1 / RC1-B03:** Removed host port publishes for Mongo (`27017`) and Redis (`6379`) from `docker-compose.yml` — data stores are internal-network only. Loopback bind documented for local debug only.
- **RC2-1 / RC1-B04:** Browser navigation now rejects private/loopback/link-local/metadata hosts via shared `validatePublicUrl` (SSRF). Blocks `169.254.169.254`, RFC1918, localhost, IPv6 literals, and cloud metadata hostnames.
- **RC2-1 / RC1-B01:** Disabled MCP stdio transport for multi-tenant hosts — refused in production always, and outside production unless `MCP_ALLOW_STDIO=true`. Register, update, connect, and `test-transport` all go through the same guard; stdio children receive a scrubbed env allowlist (no inherited secrets). See [stdioGuard.ts](../../backend/mcp/stdioGuard.ts).
- **RC1-S1:** Security audit published (findings only; remediations not yet applied). See [SECURITY_AUDIT.md](../reports/SECURITY_AUDIT.md).

---

## How to update

1. Add entries under **Unreleased** as work lands.  
2. On release, move **Unreleased** into a dated version section and clear the template.  
3. Cross-link decisions that explain non-obvious changes in [DECISIONS.md](./DECISIONS.md).  
4. Do not invent features — only document what shipped.
