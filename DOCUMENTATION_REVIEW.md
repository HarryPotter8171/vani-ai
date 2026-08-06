# Documentation Review — VANI AI

> Validation of six root docs against the codebase as of **2026-08-06**.  
> **Scope:** `PROJECT_CONTEXT.md`, `ARCHITECTURE.md`, `CURRENT_STATUS.md`, `ROADMAP.md`, `CODING_STANDARDS.md`, `README.md` only.  
> **Rules followed:** no source changes, no refactor, no overwrite of the reviewed docs. This file is findings-only.

**Method:** Cross-checked claims against `backend/app.js`, `backend/server.js`, route mounts, models, providers/router, controllers (including stubs), frontend routes/hooks/components, `package.json` versions, `docker-compose.yml`, `.github/workflows/ci.yml`, `FEATURE_GATING_REPORT.md`, `LAUNCH_CHECKLIST.md`, and the same-day audit in `FEATURE_STATUS.md`.

---

## Executive summary

The six docs are **largely accurate** on monorepo shape, stack versions, auth bridge, Express route mounts, Teams/Admin stubs, Docker/CI, and the “do not ship stubbed collaboration” guidance.

The largest accuracy risk is **overstating “fully implemented”** for some capabilities that have backend (and sometimes tests) but **no first-class frontend wiring** — especially PDF intelligence UI and project knowledge search UI. Same-day `FEATURE_STATUS.md` already records these as partial; the six reviewed docs do not align with that nuance.

Secondary issues: **`ChatV2` is an unused orphan model** (not an active dual-write path); ModelRouter resolve priority is **slightly oversimplified**; and several useful artifacts (`FEATURE_STATUS.md`, PDF under `/api/files`, in-memory session limits) are missing from the doc map.

---

## Severity legend

| Tag | Meaning |
|-----|---------|
| **INCORRECT** | Statement conflicts with code |
| **OUTDATED / IMPRECISE** | Directionally true but misleading or incomplete vs code |
| **UNVERIFIABLE** | Subjective or environment-dependent; cannot be proven from the tree alone |
| **MISSING** | Important implemented fact not reflected in docs (suggested addition) |

---

## 1. PROJECT_CONTEXT.md

### Supported (verified)

| Claim | Evidence |
|-------|----------|
| Monorepo: `backend/`, `frontend/`, `e2e/`, `docs/`, `.github/workflows/`, `docker-compose.yml` | Present at repo root |
| Root `package.json` is e2e harness `vani-ai-e2e` | `package.json` name/scripts |
| Main UI `frontend/app/page.tsx`; share page; NextAuth under `app/api/auth/` | Files exist (`[...nextauth]`, `backend-token`, `dev-continue`) |
| `AuthGate` / `AuthProvider` | `frontend/app/layout.tsx` |
| Next.js 16, React 19, Tailwind 4, Framer Motion, NextAuth, Vitest | `frontend/package.json` |
| Express 5, Node ESM, Mongoose, Vitest | `backend/package.json` (`"type": "module"`, `express@^5.2.1`) |
| Providers: gemini, openai, anthropic, groq, openrouter, ollama | `backend/providers/*` |
| Stripe + Razorpay, Pino, Sentry package | Dependencies present |
| Teams / org Admin not fully productized | `teamsController.js` / `adminController.js` stubs; no Team model |

### Findings

1. **OUTDATED / IMPRECISE — §4 “Core product capabilities (implemented)”**  
   Lists “PDF intelligence, OCR, document understanding” as wired capabilities without distinguishing:
   - **Document understanding / OCR:** wired (file routes + tools + chat path).  
   - **PDF intelligence ask/search/tables:** backend under `/api/files/:id/pdf/*` (`fileRoutes.js` + `pdfIntelligenceController.js`), **no frontend client calls** found (`rg` over `frontend` for `pdf/ask`, `pdf/analyze`, etc. → empty).  
   Same gap appears for **project knowledge search** (API `POST /api/projects/:id/knowledge/search` exists; no FE hook usage).  
   Treating these as peer to “streaming chat” overstates product completeness relative to `FEATURE_STATUS.md`.

2. **OUTDATED / IMPRECISE — §4 “Not fully productized”**  
   Only calls out Teams, org Admin, and collaboration/metering. Missing partial surfaces that exist in code/UI:
   - Creative agents category placeholder (“Creative agents coming soon” in `AgentSelector.tsx`)
   - Home weather widget placeholder (`ProductivityPanel.tsx`)
   - PDF intelligence dedicated UI / knowledge search panel (backend-only)

3. **MISSING — documentation index**  
   Does not list `FEATURE_STATUS.md` (exists, dated 2026-08-06, more granular than `CURRENT_STATUS.md`).

4. **MISSING — repo shape**  
   Root also contains `playwright.config.ts`, empty-ish `lib/` and `public/` trees, and many `*_REPORT.md` files. Optional for “shape,” but agents following only §2 may miss the e2e config location and the feature-status audit.

5. **UNVERIFIABLE — product goal / “premium macOS identity”**  
   Matches `PROJECT_RULES.md` intent; not something the codebase can prove as achieved.

---

## 2. ARCHITECTURE.md

### Supported (verified)

| Claim | Evidence |
|-------|----------|
| `server.js` boot: env validate, Mongo, optional Redis, `createApp()`, listen, voice WS, memory cleanup scheduler, graceful shutdown | `backend/server.js` |
| `createApp()` inits tools, agents, MCP, browser, code interpreter, billing seed; mounts listed routes | `backend/app.js` |
| Frontend routes table (`/`, `/share/[shareId]`, NextAuth, backend-token, dev-continue) | Files exist |
| No Redux/Zustand; domain hooks (`useChat`, etc.) | Hooks present; no zustand/redux deps |
| Chat SSE via fetch + `getReader()` + `AbortController` | `frontend/hooks/useChat.ts` |
| HTTP mount table matches `app.js` (including webhooks before `express.json`) | Lines 105–140 |
| Chat path: `createOrUpdateChat` → `prepareMessages` → `streamAgentReply` | `chatController.js` |
| Provider adapters + `ModelRouter` + `CapabilityMatrix` / `CostEstimator` | Present |
| Tools under `backend/tools/implementations/` (listed set exists) | 12 registered tools + `imageParts` helper |
| Models under `backend/models/` — **20 files**, names match | Directory listing |
| Auth: NextAuth → backend-token JWT → `/api/auth/sync` → Bearer | Routes + `jwt.js` uses **HS256** |
| `VANI_ADMIN_EMAILS` during sync | `authController.js` |
| Voice classic + Live WS (`attachVoiceWebSocket`) | `server.js` + `services/voice/` |
| Teams/Admin gated stubs | Controllers + gating |
| Docker Compose: mongo:7, redis:7-alpine, backend:5001, frontend:3000 | `docker-compose.yml` |
| CI Node 22: backend tests, optional perf, frontend tests, build, e2e | `.github/workflows/ci.yml` |
| CORS allowlist, Pino, security headers, Sentry when DSN set | Code + `errorTracking.js` |

### Findings

1. **INCORRECT / IMPRECISE — §4.4 ModelRouter resolve priority**  
   Doc: “request model → chat sticky → project default → auto (if enabled) → priority model → default Gemini.”  
   Code (`ModelRouter.resolve`):
   - Collapses request / chat / project into one `explicit` pick; **chat/project values equal to `"gemini"` are ignored** (treated as unset).
   - Auto runs only if `explicit === "auto"` **or** (`!explicit` **and** `VANI_AUTO_ROUTE === "true"`), then **before** Pro+ priority routing.
   - Fallback provider order is fixed: `gemini → openai → anthropic → openrouter → groq → ollama` (`FALLBACK_ORDER`) — doc says “fixed provider order” (OK) but does not list it.  
   **Recommendation:** Quote the code comment + note the `"gemini"` sticky exception and `VANI_AUTO_ROUTE`.

2. **OUTDATED / IMPRECISE — §5 Chat vs ChatV2**  
   “Treat coexistence… do not assume one is unused without checking call sites.”  
   Call-site check: **`ChatV2` is only referenced in `backend/models/ChatV2.js`**. Chat persistence uses `models/Chat.js` (`chatController.js`). Coexistence is **orphan model vs live model**, not dual writers. Prefer stating that explicitly (as `FEATURE_STATUS.md` already does).

3. **IMPRECISE — §4.5 tool names**  
   Lists camelCase identifiers (`webSearch`, `fileReader`, …). Runtime registered names are **snake_case** (`web_search`, `file_reader`, `image_generation`, `vision_analyze`, `current_datetime`, `browser_automation`, `code_execution`). File names are camelCase; tool `name` fields are not.

4. **IMPRECISE — §2 “Mongo + Redis connect”**  
   Redis connects only when configured (`isRedisConfigured()`); otherwise in-process rate-limit fallback. Doc’s diagram correctly says Redis (opt); the bootstrap table wording is slightly stronger than code.

5. **IMPRECISE — “schedulers” (plural)**  
   Boot starts **memory cleanup** scheduler. No other periodic schedulers found in `server.js`. Minor.

6. **MISSING — PDF intelligence / DU API placement**  
   Architecture map shows `/api/files` but does not document PDF intelligence (`/:id/pdf/analyze|ask|search|tables|conversation`) or `/:id/understand` nested under file routes. Easy for readers to assume a missing subsystem.

7. **MISSING — in-process session state**  
   Agents, browser runs, code interpreter, and voice live sessions are largely **process-local** (lost on restart). Architecture diagram implies durable Mongo for “tools” generally; worth a footnote for ops/HA.

8. **MISSING — `/version`**  
   Mentioned under health mounts (“liveness/readiness/version”) — good — but not in the system diagram. Low priority.

---

## 3. CURRENT_STATUS.md

### Supported (verified)

| Claim | Evidence |
|-------|----------|
| Teams stub; no Team model | `teamsController.js`; no `Team.js` model |
| Org Admin stubs | `adminController.js` |
| Platform analytics admin distinct from org Admin | `AdminDashboard` + analytics APIs vs admin stubs |
| Shared projects: gated 501 | `projectRoutes.js` `usageGuardFeature("shared_projects")` → 501 |
| Metering gaps list aligns with `FEATURE_GATING_REPORT.md` Remaining TODOs | Report lines 173–183 |
| Frontend README is create-next-app boilerplate | `frontend/README.md` |
| Few/no TODO/FIXME in source | `rg` over backend/frontend → 0 files |
| Mixed JS/TS backend | Observable |
| Verification scripts (`lint`/`test`/`test:e2e`) | package scripts exist |
| Chat share + export | share routes; `frontend/lib/export/*`, `ExportMenu` |
| Docker + CI | Present |

### Findings

1. **INCORRECT / OVERSTATED — §2 “Fully implemented” table**  
   Rows that conflict with code + `FEATURE_STATUS.md`:

   | Doc lists as fully implemented | Actual |
   |-------------------------------|--------|
   | PDF intelligence / OCR / document understanding (bundled) | OCR + DU upload path: wired. **PDF intelligence dedicated UI: not wired** (BE+API yes, FE no) |
   | Agents | Backend + UI exist, but **Creative category is empty / “coming soon”** |
   | Projects + RAG | Personal projects + upload/RAG path wired; **knowledge search panel UI not wired** to `knowledge/search` |
   | Feature gating / usage guards | Enforcement largely present; **metering polish still open** (doc’s own §3 admits this — §2 still lists gating as “fully” without caveat) |

   The §1 “~85–90%” figure compounds this.

2. **OUTDATED / IMPRECISE — §6 Chat / ChatV2**  
   Same as Architecture: implies active dual paths. **ChatV2 has zero importers.**

3. **UNVERIFIABLE — “~85–90% individual product”**  
   Subjective completeness score. Prefer citing `FEATURE_STATUS.md` totals (e.g. 25 ✅ / 6 🟡 / 3 🔴 of 34) or dropping the percentage.

4. **MISSING — cross-link to FEATURE_STATUS.md**  
   `FEATURE_STATUS.md` is a deeper inventory dated the same documentation era; `CURRENT_STATUS` should point to it or absorb its partial rows to avoid drift.

5. **MISSING — partial UI placeholders**  
   Home weather widget; Creative agents. Not in §3 “Partially implemented.”

---

## 4. ROADMAP.md

### Supported (verified)

| Claim | Evidence |
|-------|----------|
| P0 Teams / Admin stubs / shared projects 501 | Controllers + `projectRoutes.js` |
| P1 metering items match gating report Remaining TODOs | Same checklist |
| Principles (don’t ship stub UI; keep chat/auth/billing stable) | Consistent with `PROJECT_RULES.md` |
| Ops items exist in `LAUNCH_CHECKLIST.md` | Tag/Sentry, CI, backups, smoke `/health` `/ready`, secrets |
| Out-of-scope: no invented calendars | Meta claim OK |

### Findings

1. **OUTDATED / IMPRECISE — §3 “Already delivered”**  
   Includes “PDF/OCR/document understanding” and “Agents…” as implemented without the FE/UI caveats above. Risk: roadmap readers treat PDF Q&A UI and Creative agents as done.

2. **MISSING — product gaps already evidenced in code** (candidates for P1/P2, not invented pillars):
   - Wire PDF intelligence UI to existing `/api/files/:id/pdf/*`
   - Wire project knowledge search UI to `POST /api/projects/:id/knowledge/search`
   - Implement or remove Creative agents category
   - Replace or wire home weather placeholder
   - Delete or adopt orphan `ChatV2` model (aligns with existing P2 “Chat vs ChatV2”)

3. **UNVERIFIABLE — sequencing advice**  
   Reasonable engineering guidance; not contradicted by code, but not “proven” by it either.

---

## 5. CODING_STANDARDS.md

### Supported (verified)

| Claim | Evidence |
|-------|----------|
| Frontend TS; backend ESM; TS islands (providers, router, billing, browser, MCP, code interpreter) | Layout matches |
| npm + three lockfiles (root/frontend/backend) | Present |
| Layering routes → controllers → services | Observed convention |
| Hooks orchestration / components under `components/<domain>/` | Observed |
| SSE + AbortController; Bearer JWT; don’t trust client email for identity | Matches auth/chat code |
| Vitest backend/frontend; Playwright root | Scripts + dirs |
| `FEATURE_GATING_DISABLED` emergency-only | Documented in `backend/.env.example` |
| Teams/Admin stubs warning | Accurate |
| Virtualized long threads | `VirtualizedMessageList.tsx` used from `page.tsx` |
| Defers UI identity to `PROJECT_RULES.md` | Appropriate |

### Findings

1. **UNVERIFIABLE / PROCESS — Git rules, “clarity over cleverness,” comment policy**  
   Normative process from `PROJECT_RULES`; not falsifiable from a static tree review. No conflict found with prevailing code style.

2. **IMPRECISE — “Avoid `any` on the frontend except temporary bridges”**  
   Policy statement; not exhaustively audited. Not marked incorrect.

3. **MISSING (optional) — TypeScript on new backend modules**  
   Could recommend “prefer TS when adding providers/billing-adjacent modules” to match existing islands; standards currently only describe the mix.

4. **MISSING — no second package manager**  
   Already stated; still accurate (no pnpm/yarn workspace).

No **INCORRECT** factual claims found in this file relative to tooling and layering.

---

## 6. README.md

### Supported (verified)

| Claim | Evidence |
|-------|----------|
| Doc map links (except FEATURE_STATUS) | Files exist |
| Layout / e2e harness / stack snapshot | Matches packages |
| Node 22+ (CI uses 22) | `ci.yml` |
| Mongo 7 / Redis 7 in Compose | `docker-compose.yml` |
| Backend default port 5001; `/health`, `/ready` | `server.js`, `healthRoutes.js` |
| Frontend localhost:3000; don’t bake `NEXT_PUBLIC_API_BASE_URL` for local | `frontend/.env.example` |
| Auth bridge description | Accurate |
| Docker compose instructions + services | Match compose file |
| Test commands | Match scripts (`test:e2e:install` exists) |
| Teams/Admin not fully productized | Accurate |
| License note (backend ISC / frontend private) | `package.json` fields |
| Env catalogs | `.env.example` files present |

### Findings

1. **OUTDATED / IMPRECISE — “Core capabilities” list**  
   Same PDF intelligence / agents overstatement as PROJECT_CONTEXT / CURRENT_STATUS. README correctly points to CURRENT_STATUS “for nuance,” but CURRENT_STATUS itself overstates §2.

2. **MISSING — documentation map**  
   Should include `FEATURE_STATUS.md` and ideally `DOCUMENTATION_REVIEW.md` (this file) after adoption.

3. **MISSING — `/version` probe**  
   Launch/ops docs emphasize it; README health line only mentions `/health` and `/ready`.

4. **UNVERIFIABLE — “Production-oriented” / reliability claims**  
   Marketing tone; launch checklist still unchecked in repo.

5. **Minor omission — Framer Motion**  
   In PROJECT_CONTEXT tech snapshot; omitted from README stack table. Not wrong.

---

## Cross-document inconsistencies

| Topic | Docs say | Code / sibling doc |
|-------|----------|--------------------|
| PDF intelligence completeness | CONTEXT / STATUS / ROADMAP / README: implemented | BE+API yes; **FE no** (`FEATURE_STATUS` 🟡) |
| Agents completeness | “Fully” / “delivered” | Creative agents **coming soon** |
| ChatV2 | Dual model coexistence to verify | **Unused model**; only `Chat` writes |
| Completeness % | CURRENT_STATUS ~85–90% | Prefer FEATURE_STATUS scorecard |
| Feature inventory depth | CURRENT_STATUS coarse | FEATURE_STATUS 34-feature matrix — **not linked** from the six docs |
| ModelRouter priority | Simplified chain | See Architecture finding #1 |
| Tool naming | camelCase in Architecture | snake_case at runtime |

---

## Suggested additions (do not auto-apply)

### A. Documentation map (all of CONTEXT / README / STATUS)

- Add **`FEATURE_STATUS.md`** — granular FE/BE/API/UI/DB audit; use as source of truth for “working vs partial.”
- Optionally link **`DOCUMENTATION_REVIEW.md`** after merge so agents know last validation date.
- Keep `*_REPORT.md` as historical; avoid treating them as current status without code check.

### B. CURRENT_STATUS.md / ROADMAP.md

- Move or annotate:
  - PDF intelligence **dedicated UI** → Partial  
  - Project knowledge **search UI** → Partial  
  - Creative agents → Partial / placeholder  
  - Home weather widget → Partial / placeholder  
  - Feature gating → Implemented with known metering TODOs (already in §3; demote absolute “fully” wording in §2)
- Replace ChatV2 note with: **orphan model, zero imports; live path is `Chat` only.**
- Replace ~85–90% with FEATURE_STATUS totals or remove.

### C. ARCHITECTURE.md

- Correct ModelRouter resolve notes (`"gemini"` sticky ignore, `VANI_AUTO_ROUTE`, fallback order list).
- Document PDF / understand endpoints under `/api/files`.
- Footnote in-memory sessions (agents, browser, code interpreter, voice live).
- List runtime tool `name`s or say “see `tools/implementations/*` `name` field.”

### D. README.md

- Mention `GET /version`.
- Soften capability bullets to match STATUS after STATUS is fixed.
- Add FEATURE_STATUS to doc map.

### E. PROJECT_CONTEXT.md

- Expand “not fully productized” / partial list to match FEATURE_STATUS reds/yellows that affect user-facing completeness.
- Optionally note root `playwright.config.ts` for e2e.

### F. CODING_STANDARDS.md

- Optional: “New backend modules adjacent to existing TS islands should prefer TypeScript.”
- Optional: point to FEATURE_STATUS when classifying stub vs shippable UI (reinforces PROJECT_RULES “never ship unwired UI”).

### G. New sections worth adding somewhere (STATUS or ARCHITECTURE)

| Section | Why |
|---------|-----|
| API surface for files/PDF/DU | Easy to miss under `/api/files` |
| Session durability matrix | Restart behavior for agents/browser/code/voice |
| Platform admin vs org Admin | STATUS mentions it; a one-line glossary helps |
| Env kill-switches | `FEATURE_GATING_DISABLED`, `ALLOW_DEV_AUTH`, `VANI_AUTO_ROUTE` |

---

## Verified accurate (high confidence)

These recurring claims matched the implementation and need no change for factual accuracy:

- Express 5 API + Next.js 16 App Router monorepo; root package is Playwright e2e only  
- Auth: NextAuth → HS256 backend JWT → `/api/auth/sync` → `requireAuth`  
- Chat SSE streaming with stop / regenerate / continue  
- Provider set and Gemini-oriented defaults  
- Route mount list in `app.js` (including billing webhooks raw body)  
- Teams + org Admin controllers are stubs; shared projects return 501 when gated through  
- Platform admin analytics UI is real and separate  
- Docker Compose topology and CI Node 22 job set  
- Billing Stripe + Razorpay + FeatureGate / usageGuard foundation  
- Memory, canvas, research, MCP, browser, code interpreter **code paths** exist and are mounted  
- CORS allowlist (not `*`); Pino; optional Sentry  
- Do-not-commit secrets / `.env.example` catalogs  

---

## Residual risk / review limits

- No runtime smoke tests or live provider calls were executed.  
- “Working in production” depends on secrets and checklist items still unchecked in `LAUNCH_CHECKLIST.md`.  
- UI polish / PROJECT_RULES aesthetic compliance was not design-reviewed.  
- `FEATURE_STATUS.md` was used as a cross-check, not as a reviewed deliverable of this pass; if it drifts, re-validate independently.

---

## Recommended next edit order (for humans)

1. Align **CURRENT_STATUS.md §2–3** with FEATURE_STATUS yellows/reds (highest drift).  
2. Soften **PROJECT_CONTEXT / README / ROADMAP “delivered”** capability lists.  
3. Fix **ARCHITECTURE** ModelRouter + ChatV2 + `/api/files` PDF notes.  
4. Add **FEATURE_STATUS.md** to every documentation map.  

*This file intentionally does not modify the six reviewed documents.*
