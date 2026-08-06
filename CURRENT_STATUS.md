# VANI AI — Current Status

> Inventory of what is **implemented**, **partial**, or **not productized**, based on code and existing project reports.  
> Do not treat roadmap milestones as complete. Companion: [ROADMAP.md](./ROADMAP.md) (milestones), [docs/management/SPRINT_BOARD.md](./docs/management/SPRINT_BOARD.md) (current sprint), [ARCHITECTURE.md](./ARCHITECTURE.md).

**Snapshot date:** 2026-08-06 (v1 consumer priority; **RC2-1…RC2-4** + **RC2.5** applied. Public Beta decision: [PUBLIC_BETA_DECISION.md](./docs/releases/PUBLIC_BETA_DECISION.md) — version **`1.0.0-beta.1`**, score **7.6/10**, status **Conditional GO**. Remaining Critical (code): **0**. Operator staging gates + High Must-Fix still open. **Current Task:** Waiting For Operator Release.)

---

## 1. Summary

| Category | Assessment |
|----------|------------|
| Single-user / Pro chat platform | Largely implemented (streaming chat, tools, voice, memory, RAG, billing, etc.) |
| Business collaboration (Teams, org Admin, shared projects) | **Paused for v1** — Teams + Org Admin APIs exist and are kept intact; no further Business/Enterprise feature work or UI until explicitly resumed |
| Ops / launch | Checklist + Docker/CI + [docs/OPERATIONS.md](./docs/OPERATIONS.md); engineering checklist + staging probe/restore scripts checked (RC2.5); interactive staging smoke / restore drill / alerts still operator-owned |
| Performance (RC1/RC2) | Audit **5.8/10**; **RC2-2 Phase A applied** — first-load **1.254 MB** (budget ≤1.8 MB), TTFT parallelization, OCR pool, compression, Redis multi-replica gate — [PERFORMANCE_FIX_REPORT.md](./docs/reports/PERFORMANCE_FIX_REPORT.md). Est. score **~7.2/10**. |
| Security (RC1/RC2/RC2.5) | Audit **5.5/10**; RC2-1 Criticals + **RC2.5** XSS / SSRF redirects / Redis JWT denylist — [RC25_CRITICAL_FIX_REPORT.md](./docs/reports/RC25_CRITICAL_FIX_REPORT.md). Est. **~7.5/10**. Remaining Must-Fix High: query JWT, Next/xlsx, rate-limit XFF, soft sandboxes, etc. |
| Regression (RC1/RC2/RC2.5) | RC2-4 journey green; RC2.5 re-verify — backend **803** + FE **192** + E2E **PASS** |
| Production readiness | RC2-3 scaffolding **~6.5/10** + RC2.5 staging tooling → **~7.0/10** est.; operator gates open |
| Public Beta Decision | Present — [docs/releases/PUBLIC_BETA_DECISION.md](./docs/releases/PUBLIC_BETA_DECISION.md) · **`1.0.0-beta.1`** · **Conditional GO** · date **TBD** |
| RC2.5 Critical Fixes | Present — [docs/reports/RC25_CRITICAL_FIX_REPORT.md](./docs/reports/RC25_CRITICAL_FIX_REPORT.md) · Critical code **0** · Public Beta **Conditional Go** |
| RC2-4 Final Verification | Present — [docs/reports/FINAL_VERIFICATION_REPORT.md](./docs/reports/FINAL_VERIFICATION_REPORT.md) |
| RC2-3 Production Hardening | Present — [docs/reports/PRODUCTION_HARDENING_REPORT.md](./docs/reports/PRODUCTION_HARDENING_REPORT.md) |
| RC2-2 Performance Phase A | Present — [docs/reports/PERFORMANCE_FIX_REPORT.md](./docs/reports/PERFORMANCE_FIX_REPORT.md) (`/` **1.254 MB** verified) |
| RC2-1 Security Critical Fixes | Present — [docs/reports/SECURITY_FIX_REPORT.md](./docs/reports/SECURITY_FIX_REPORT.md) |

Rough completeness (code presence, not production QA): **~85–90%** individual product; **lower** for full Business/Enterprise collaboration. Public Beta: **Conditional GO** (`1.0.0-beta.1`) — waiting on operator release execution; High Must-Fix triage continues post-launch toward GA exit criteria.

---

## 2. Fully implemented (code wired)

Evidence is code paths (controllers/services/UI/tests), not report titles alone.

| Feature | Key locations |
|---------|----------------|
| Chat SSE streaming | `backend/controllers/chatController.js`, `frontend/hooks/useChat.ts` |
| File upload pipeline | `frontend/hooks/useFileUpload.ts`, `backend/routes/fileRoutes.js`, `fileController` / `fileService` / signatures — verified 2026-08-06 (multi-type + limits + ownership + parallel uploads; cancel cleanup via `DELETE /api/files/:id`) ([FILE_UPLOAD_REPORT.md](./docs/reports/FILE_UPLOAD_REPORT.md)) |
| Stop generation | AbortController + backend `res` close |
| Regenerate | `useChat.regenerateMessage` |
| Continue generating | `useChat.continueGenerating` + `continueGenerating` persist merge in chat controller |
| Multi-provider AI | `backend/providers/*`, `backend/router/ModelRouter.ts` |
| Image gen / edit | `tools/implementations/imageGeneration.js`, `imageEdit.js`, image services — generation verified 2026-08-06 ([IMAGE_GENERATION_REPORT.md](./docs/reports/IMAGE_GENERATION_REPORT.md)); editing verified 2026-08-06 (Gemini + OpenAI edit, force-edit routing, upload→edit→persist/download, post-persist base64 omit) ([IMAGE_EDITING_REPORT.md](./docs/reports/IMAGE_EDITING_REPORT.md)) |
| Voice STT / TTS / Live | `services/voice/*`, TTS routes, `useVoiceMode.ts` |
| Memory | `services/memory/*`, `memoryRoutes.js` |
| Canvas | `services/canvas/*`, `useCanvas.ts`, canvas components — richtext sanitized (RC2.5) |
| Deep research | `services/research/*`, research SSE, `useDeepResearch.ts` — redirect SSRF hardened (RC2.5) |
| Agents | `backend/agents/*`, `agentRoutes.js`, `useAgent.ts` — verified 2026-08-06; Pro-gated SSE plan→tools→answer; replace-delta + planner allow-list + final-answer timeout fixed ([AI_AGENTS_REPORT.md](./docs/reports/AI_AGENTS_REPORT.md)) |
| Chat tools | `backend/tools/implementations/*`, `toolOrchestrator.js` |
| Browser automation | `backend/browser/*`, Playwright, `useBrowser.ts` — verified 2026-08-06; Chromium launch→approve→steps→cleanup; http(s)-only nav + step-error surfacing fixed ([BROWSER_AUTOMATION_REPORT.md](./docs/reports/BROWSER_AUTOMATION_REPORT.md)) |
| MCP | `backend/mcp/*`, `useMcp.ts` — remote URL SSRF policy (RC2.5); stdio gated (RC2-1) |
| Code interpreter | `services/codeInterpreter/*` — verified 2026-08-06 (sessions + stdout/stderr + interrupt/timeout + CSV/text + upload/download) |
| PDF intelligence / OCR / document understanding | `pdfIntelligence/`, `ocr/`, `documentUnderstanding/`, parsers — verified 2026-08-06 (PDF analyze/ask/search/tables + SSE; image OCR; DOCX/XLSX parsing; large-PDF performance; chat + Projects/RAG + Deep Research integration checks; verifier ownerId fix) ([OCR_PDF_REPORT.md](./docs/reports/OCR_PDF_REPORT.md)) |
| Billing Stripe + Razorpay | `backend/billing/*`, webhook routes |
| Feature gating / usage guards | `FeatureGate`, `usageGuard`, `featureMatrix` |
| Auth Google + JWT sync | NextAuth, `backend-token`, `/api/auth/sync` — Redis JWT denylist on logout/revoke (RC2.5) |
| Analytics (user + platform admin) | `services/analytics/*`, admin analytics UI |
| Projects + RAG | `projectRoutes` + `projectService` + `ragService` + `KnowledgeChunk` — verified 2026-08-06 (CRUD + file KB upload/index/search + duplicate uploads + large-doc chunking/retrieval + chat context injection + malformed file-id delete fix) ([RAG_REPORT.md](./docs/reports/RAG_REPORT.md)) |
| Chat share | `shareChat` / shared page — markdown href allowlist (RC2.5) |
| Export | `frontend/lib/export/*`, ExportMenu |
| Health / hardening hooks | health routes, security headers, rate limits, FE CSP (RC2.5) |
| Docker + CI | `docker-compose.yml`, `.github/workflows/ci.yml` |

---

## 3. Partially implemented

| Feature | What exists | What is missing / stubbed |
|---------|-------------|---------------------------|
| **Teams** | `Team` model, `teamService`, real list/create/get; Business+ gating | No invite/role-change/leave APIs; **no Teams UI** (by design until invite flows exist) |
| **Org Admin (`/api/admin`)** | `Organization` model, `orgAdminService`, real overview/members/settings; Business+ gating | No invite/role-change/audit APIs; **no Admin UI** (by design until those exist) |
| **Platform analytics admin** | Real admin analytics APIs + `AdminDashboard` | Distinct from org Admin stubs — do not conflate |
| **Shared project collaboration** | Gating / report notes 501 path when gated | Full collaboration UI + persistence not complete (per `FEATURE_GATING_REPORT.md`) |
| **Metering edges** | Feature gates + usage recording | Per-tool MCP meter, canvas AI-edit monthly meter, precise voice minutes, project file storage enforcement, Sidebar entitlement prefetch (listed as remaining in gating report) |

---

## 4. Explicitly not completed as product features

Do **not** describe these as shipped:

1. Full team invite / role-management product and Teams UI  
2. Org Admin invite / role-change / audit product and Admin UI  
3. Enterprise per-org custom quota overrides as a finished product surface  
4. Any feature that only appears in a report without matching runtime code (none of the core AI features above are docs-only; the gaps are collaboration/metering)

---

## 5. Documentation & ops status

| Artifact | Status |
|----------|--------|
| Root product README | Present — [README.md](./README.md) |
| Public Beta Decision | Present — [docs/releases/PUBLIC_BETA_DECISION.md](./docs/releases/PUBLIC_BETA_DECISION.md) |
| `PROJECT_RULES.md` | Present — engineering + UI source of truth |
| `LAUNCH_CHECKLIST.md` | Present — engineering items checked (RC2-3/RC2.5); operator staging gates remain |
| `docs/OPERATIONS.md` | Present — deploy / monitor / rollback runbook |
| `docs/BACKUP.md` | Present |
| `scripts/verify-backup.sh` | Present — mongodump/mongorestore tooling verifier |
| `scripts/verify-restore.sh` | Present — restore tooling + gated staging restore (RC2.5) |
| `scripts/staging-smoke.sh` | Present — `/health` `/ready` `/version` probe smoke (RC2.5) |
| Root `*_REPORT.md` | Historical sprint reports (supplementary) |
| RC2.5 Critical Fixes | Present — [docs/reports/RC25_CRITICAL_FIX_REPORT.md](./docs/reports/RC25_CRITICAL_FIX_REPORT.md) |
| RC1 Performance Audit | Present — [docs/reports/PERFORMANCE_AUDIT.md](./docs/reports/PERFORMANCE_AUDIT.md) |
| RC1 Security Audit | Present — [docs/reports/SECURITY_AUDIT.md](./docs/reports/SECURITY_AUDIT.md) |
| RC1 Regression Audit | Present — [docs/reports/REGRESSION_AUDIT.md](./docs/reports/REGRESSION_AUDIT.md) |
| RC1 Production Readiness Audit | Present — [docs/reports/PRODUCTION_READINESS_AUDIT.md](./docs/reports/PRODUCTION_READINESS_AUDIT.md) |
| RC1 Release Blockers | Present — [docs/reports/RC1_BLOCKERS.md](./docs/reports/RC1_BLOCKERS.md) |
| RC2-4 Final Verification | Present — [docs/reports/FINAL_VERIFICATION_REPORT.md](./docs/reports/FINAL_VERIFICATION_REPORT.md) |
| RC2-3 Production Hardening | Present — [docs/reports/PRODUCTION_HARDENING_REPORT.md](./docs/reports/PRODUCTION_HARDENING_REPORT.md) |
| RC2-2 Performance Phase A | Present — [docs/reports/PERFORMANCE_FIX_REPORT.md](./docs/reports/PERFORMANCE_FIX_REPORT.md) |
| RC2-1 Security Critical Fixes | Present — [docs/reports/SECURITY_FIX_REPORT.md](./docs/reports/SECURITY_FIX_REPORT.md) |
| Frontend README | Create-next-app boilerplate — not product docs |

---

## 6. Known dual / coexistence notes

- **`Chat` and `ChatV2` models** both exist — verify which paths write which before changing chat persistence.  
- Backend is **mixed JS/TS** (e.g. providers/billing/browser/mcp in TypeScript; many services in JavaScript).  
- Source tree contains **few/no** `TODO`/`FIXME` markers; unfinished work is documented in stubs and `FEATURE_GATING_REPORT.md`.

---

## 7. Verification commands (from project reports)

```bash
# Backend
cd backend && npm run lint && npm test

# Frontend
cd frontend && npm run lint && npm test

# E2E (root)
npm run test:e2e

# Staging probes / backup tooling
./scripts/staging-smoke.sh
./scripts/verify-backup.sh
./scripts/verify-restore.sh
```

Whether CI is green on a given branch **must be checked in GitHub Actions** — not assumed from this document.

---

## 8. What this status does **not** claim

- Production secrets are configured correctly  
- All optional providers (Anthropic, Ollama, etc.) are live in every environment  
- Operator staging smoke / restore drill / alerts are signed off  
- Teams/Admin UI implies working multi-user collaboration  

---

*Update when a stub becomes a real product or when a shipped feature is removed.*
