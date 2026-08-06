# VANI AI — Feature Status Audit

> Code-level audit of every major product feature across frontend, backend, API, UI wiring, database, and end-to-end path.  
> **No runtime smoke tests were executed** in this pass; “Working” means a complete wired code path exists (not that every environment has secrets/providers live).  
> Companion docs: [CURRENT_STATUS.md](./CURRENT_STATUS.md), [ARCHITECTURE.md](./ARCHITECTURE.md), [ROADMAP.md](./ROADMAP.md).

**Audit date:** 2026-08-06  
**Method:** Route mounts (`backend/app.js`), controllers, services, models, frontend hooks/components, and `app/page.tsx` wiring.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ Working | Frontend + backend + API + UI connection present; durable DB where required; E2E code path exists |
| 🟡 Partially Working | Core path works, but stubs, missing UI, missing persistence, or metering gaps remain |
| 🔴 Broken | Stub / 501 / no UI / cannot complete a real product flow |

Per-feature checklist columns:

| Column | Meaning |
|--------|---------|
| FE | Frontend UI complete enough for the feature |
| BE | Backend business logic complete (not a stub) |
| API | HTTP/WS route mounted |
| UI↔API | Frontend client calls that API and surfaces results |
| DB | Durable Mongo (or intentional disk) persistence where the feature needs it |
| E2E | User can complete the happy path in the app (when env/keys configured) |

---

## Executive scorecard

| # | Feature | Status | FE | BE | API | UI↔API | DB | E2E |
|---|---------|--------|----|----|-----|--------|----|----|
| 1 | Auth (NextAuth + JWT sync) | ✅ | Y | Y | Y | Y | Y | Y |
| 2 | Chat SSE streaming | ✅ | Y | Y | Y | Y | Y | Y |
| 3 | Stop / regenerate / continue | ✅ | Y | Y | Y* | Y | Y | Y |
| 4 | Chat history (list/pin/rename/delete) | ✅ | Y | Y | Y | Y | Y | Y |
| 5 | Chat share (public link) | ✅ | Y | Y | Y | Y | Y | Y |
| 6 | Chat export (MD/TXT/PDF) | ✅ | Y | n/a | n/a | client | n/a | Y |
| 7 | Model picker / multi-provider | ✅ | Y | Y | Y | Y | n/a | Y |
| 8 | File upload + attachments | ✅ | Y | Y | Y | Y | disk | Y |
| 9 | Document understanding (upload-time) | ✅ | Y | Y | Y | Y | disk/cache | Y |
| 10 | PDF intelligence (ask/search/tables UI) | 🟡 | N | Y | Y | N | cache | N |
| 11 | OCR (tool + pipelines) | ✅ | via chat | Y | tool/API | Y | n/a | Y |
| 12 | Image generation / editing | ✅ | via chat | Y | tools | Y | disk | Y |
| 13 | Voice mode (STT / TTS / Live WS) | ✅ | Y | Y | Y | Y | session† | Y |
| 14 | Message Listen (TTS) | ✅ | Y | Y | Y | Y | n/a | Y |
| 15 | Long-term memory | ✅ | Y | Y | Y | Y | Y | Y |
| 16 | Projects (personal) + RAG upload | ✅ | Y | Y | Y | Y | Y | Y |
| 17 | Project knowledge search panel | 🟡 | N | Y | Y | N | Y | N |
| 18 | Shared project collaboration | 🔴 | N | N | 501 | N | N | N |
| 19 | Canvas + versions + AI edit | ✅ | Y | Y | Y | Y | Y | Y |
| 20 | Deep research | ✅ | Y | Y | Y | Y | Y | Y |
| 21 | Agents (planner/executor) | 🟡 | Partial | Y | Y | Y | session† | Y‡ |
| 22 | Browser automation | ✅ | Y | Y | Y | Y | Partial§ | Y |
| 23 | MCP servers / tools | ✅ | Y | Y | Y | Y | Y | Y |
| 24 | Code interpreter | ✅ | Y | Y | Y | Y | session† | Y |
| 25 | Billing (plans / Stripe / Razorpay) | ✅ | Y | Y | Y | Y | Y | Y‖ |
| 26 | Feature gating / quotas | 🟡 | Y | Y | mw | Y | Y | Partial |
| 27 | User analytics | ✅ | Y | Y | Y | Y | Y | Y |
| 28 | Platform admin analytics | ✅ | Y | Y | Y | Y | Y | Y |
| 29 | Teams workspaces | 🔴 | N | stub | Y | N | N | N |
| 30 | Org Admin console | 🔴 | N | stub | Y | N | N | N |
| 31 | Chat tools (search, calc, weather, …) | ✅ | via chat | Y | tools | Y | n/a | Y |
| 32 | Home weather widget | 🟡 | placeholder | tool exists | n/a | N | n/a | N |
| 33 | Identity guard | ✅ | n/a | Y | n/a | stream | n/a | Y |
| 34 | Health / readiness / version | ✅ | n/a | Y | Y | ops | probes | Y |

\* Stop = client abort / `res.close`; regenerate = re-POST; continue = `continueGenerating` flag (no dedicated REST verbs).  
† In-memory process sessions (lost on restart); feature still works within a running server.  
‡ Non-creative agents work; Creative category is UI-only “coming soon”.  
§ `BrowserPermission` in Mongo; run state largely in-process.  
‖ Checkout/webhooks require live Stripe/Razorpay keys; code path is complete.

**Totals (34 features):** ✅ **25** · 🟡 **6** · 🔴 **3**

---

## Detailed findings

### 1. Auth — ✅ Working

| Check | Result |
|-------|--------|
| Frontend | `AuthGate`, `AuthProvider`, NextAuth routes, `UserMenu` / logout |
| Backend | `authController` — sync, me, revoke, logout |
| API | `/api/auth/*` |
| UI connected | Layout wraps app in `AuthGate`; `apiClient` mints JWT via `/api/auth/backend-token` |
| Database | `User` model upserted on sync |
| E2E | Google OAuth (or dev auth) → session → Bearer JWT → Express |

**Why:** Full auth bridge is implemented. Backend `/auth/me` is unused by design (NextAuth session is client source of truth).

---

### 2. Chat SSE streaming — ✅ Working

| Check | Result |
|-------|--------|
| Frontend | `useChat`, virtualized message list, composer |
| Backend | `createOrUpdateChat` → `streamAgentReply` / tool orchestration |
| API | `POST /api/chat` (`text/event-stream`) |
| UI connected | Core of `app/page.tsx` |
| Database | `Chat` messages persisted |
| E2E | Send message → stream deltas → persist → reload history |

**Why:** Primary product path is fully wired. `ChatV2` model exists but is **never imported** (dead coexistence, not a break).

---

### 3. Stop / regenerate / continue — ✅ Working

| Check | Result |
|-------|--------|
| Frontend | AbortController stop; regenerate / continue in `useChat` |
| Backend | Abort on response close; `continueGenerating` merge path |
| API | Same `POST /api/chat` (protocol-level, not separate routes) |
| UI connected | Chat input + message actions |
| Database | Continue merges into existing chat |
| E2E | Yes |

**Why:** Intentionally implemented as stream protocol, not missing endpoints.

---

### 4. Chat history — ✅ Working

List, open, delete, pin/unpin, rename, generate title — routes + `useChatHistory` + Sidebar. Model: `Chat`.

---

### 5. Chat share — ✅ Working

| Check | Result |
|-------|--------|
| Frontend | `ShareMenu`, `useShareChat`, `app/share/[shareId]/page.tsx` |
| Backend | share / unshare / get shared |
| API | `/api/chat/:id/share`, `/api/chat/shared/:shareId` |
| Database | Share fields on `Chat` |
| E2E | Enable share → open public URL (AuthGate allows `/share/*`) |

---

### 6. Chat export — ✅ Working

Client-side MD/TXT/PDF via `ExportMenu` / `frontend/lib/export/*`. No backend required. Wired in Sidebar.

---

### 7. Model picker / multi-provider routing — ✅ Working

| Check | Result |
|-------|--------|
| Frontend | `ModelSelector` in composer + settings |
| Backend | Provider adapters + `ModelRouter` |
| API | `GET /api/models`; selection sent on chat |
| Database | Not required (registry in-process); sticky model can live on chat/project |
| E2E | Pick model → chat uses it (providers need API keys) |

**Why:** Extra admin APIs (`/models/health`, `/metrics`, `POST /route`) lack UI but are not required for the user picker path.

---

### 8. File upload + attachments — ✅ Working

Upload via `/api/files/upload` (quota-gated), previews in composer, content URLs for display. Persistence: disk under uploads + metadata sidecars (not GridFS). Project files additionally use `ProjectFile` Mongo docs.

---

### 9. Document understanding (upload-time) — ✅ Working

`useFileUpload` → `POST /api/files/:id/understand` after upload. Backend: `documentUnderstanding` + parsers + OCR. Connected into attachment pipeline.

---

### 10. PDF intelligence (dedicated Q&A / search / tables) — 🟡 Partially Working

| Check | Result |
|-------|--------|
| Frontend | **No** dedicated panel calling pdf intel APIs |
| Backend | Complete — analyze, ask, search, tables, streams |
| API | `/api/files/:id/pdf/*` |
| UI connected | **No** (only generic `/understand` on upload) |
| Database | Cache/session in service layer, not a PDF Mongo collection |
| E2E | Backend/tests exist; **product UI path missing** |

**Why:** Rich PDF intelligence is implemented server-side and covered by integration tests, but the app never exposes ask/search/tables as a first-class UI. Users only get upload-time understanding text into chat context.

---

### 11. OCR — ✅ Working

Tool `ocr` + `services/ocr/` + image/PDF paths; invoked from chat tool loop and document understanding. No standalone OCR screen needed for E2E.

---

### 12. Image generation / editing — ✅ Working

Tools `imageGeneration` / `imageEdit` + Gemini/OpenAI image services; SSE `image` events rendered in `Message` + lightbox. Files stored on disk when persisted.

---

### 13. Voice mode (STT / TTS / Live) — ✅ Working

| Check | Result |
|-------|--------|
| Frontend | `useVoiceMode`, `VoiceModeHost`, overlay, mic chrome |
| Backend | Voice sessions, STT, TTS, Live WebSocket (`server.js`) |
| API | `/api/voice/*`, `/api/voice/ws`, `/api/tts` |
| Database | Sessions in-memory (expected for realtime) |
| E2E | Classic + Live paths coded; needs provider keys / `VOICE_ENGINE` |

**Why:** Fully wired. Future streaming STT provider stubs in frontend are optional; live path uses backend STT/WS today.

---

### 14. Message Listen (TTS) — ✅ Working

`useMessageTts` → `POST /api/tts` (ElevenLabs / Gemini). Wired to message actions.

---

### 15. Long-term memory — ✅ Working

CRUD + settings UI (`MemoryManager`), auto-capture from chat, encryption, retrieve/decision engine. Model: `Memory`.

Secondary endpoints are wired in the Memory UI:
- `GET /memory/categories` — category picker
- `GET /memory/recall` + `POST /memory/retrieve` — search merges keyword, semantic, and key recall
- `POST /memory/summarize` — “Summarize chat” when an active `chatId` is present
- Pin / temporary flags persist via `PATCH /memory/:id` (`scope` + default `expiresAt` for temporary)

Explicit chat summarize always stores a conversation summary; extracted fact candidates still pass the LONG_TERM-only decision engine.

---

### 16. Projects (personal) + RAG upload — ✅ Working

| Check | Result |
|-------|--------|
| Frontend | Sidebar projects, files workspace, upload knowledge |
| Backend | CRUD, files, memories, chats, embeddings/RAG services |
| API | `/api/projects/*` |
| Database | `Project`, `ProjectFile`, `KnowledgeChunk`, `ProjectMemory` |
| E2E | Create project → upload files → chat with project context |

**Why:** Personal project RAG works via upload + retrieval in chat. Dedicated knowledge-search UI is separate (below).

---

### 17. Project knowledge search panel — 🟡 Partially Working

`POST /api/projects/:id/knowledge/search` exists on backend; **no frontend client or UI**. RAG still works via chat retrieval, but users cannot open a search console over the knowledge base.

---

### 18. Shared project collaboration — 🔴 Broken

| Check | Result |
|-------|--------|
| Frontend | None |
| Backend | Explicit stub |
| API | `POST /api/projects/:id/share` → **501** `NOT_IMPLEMENTED` |
| Database | No collaboration models |
| E2E | Impossible |

**Why:** Feature is plan-gated (`shared_projects`) but returns 501 by design until product lands (`projectRoutes.js`).

---

### 19. Canvas — ✅ Working

Full panel + `useCanvas`: CRUD, autosave, versions, restore, AI edit. Models: `Canvas`, `CanvasVersion`. Wired on main page. Minor: `reopen` API unused by client.

---

### 20. Deep research — ✅ Working

`useDeepResearch` + `ResearchPanel` + SSE run/pause/resume/cancel. Model: `Research`. No session-history browser for `GET /research/` list — operational gap only; active research E2E works.

---

### 21. Agents — 🟡 Partially Working

| Check | Result |
|-------|--------|
| Frontend | `AgentSelector`, status, timeline — **Creative** category shows “coming soon” |
| Backend | Planner/executor/manager real |
| API | `/api/agents/*` |
| Database | Sessions in-memory; may write into `Chat` |
| E2E | Non-creative agents run end-to-end; creative agents not productized |

**Why:** Core agent product works; UI explicitly withholds a creative agent set.

---

### 22. Browser automation — ✅ Working

Panel + permissions + run lifecycle against Playwright backend. `BrowserPermission` persisted in Mongo; runs are in-process. Pro-gated. Wired via `useBrowser` / automation workspace.

---

### 23. MCP — ✅ Working

Settings UI (`McpSettings` / `useMcp`): server CRUD, connect, tools, permissions. Models: `McpServer`, `McpPermission`. Live connections in-memory; config durable. Pro-gated.

---

### 24. Code interpreter — ✅ Working

Panel + sessions + execute SSE + files + publish-to-canvas. Sessions in `SessionManager` Map + sandbox FS (no Mongo) — works within a process. Pro-gated. Wired on main page.

---

### 25. Billing — ✅ Working

| Check | Result |
|-------|--------|
| Frontend | `BillingSettings`, upgrade/portal/cancel, quota banner |
| Backend | Plans, Stripe, Razorpay, webhooks, invoices, entitlements |
| API | `/api/billing/*`, `/api/billing/webhooks` |
| Database | `Plan`, `Subscription`, `Usage`, `Invoice` |
| E2E | Overview/entitlements always; live checkout needs gateway keys |

**Why:** Implementation is complete and soft-degrades without keys. Not a stub.

---

### 26. Feature gating / quotas — 🟡 Partially Working

| Check | Result |
|-------|--------|
| Frontend | Quota banner, gate denial toasts, entitlements via billing |
| Backend | `FeatureGate` + `usageGuard` on premium routes/tools |
| Database | Plan/Subscription/Usage |
| E2E | Denials work for chat/images/voice/research/premium features |

**Why (partial):** Known metering gaps from `FEATURE_GATING_REPORT.md`:

- Project file uploads **not** storage-quota enforced (`/api/projects/:id/files` has no `usageGuard`)
- Chat `/api/files/upload` **is** gated via `usageGuard("file_upload")`
- Per-tool MCP meter, canvas AI-edit monthly meter, precise voice minutes, Sidebar entitlements prefetch still open
- Business Teams/Admin/shared_projects are gated but product stubs (see 🔴 items)

---

### 27. User analytics — ✅ Working

`AnalyticsPanel` / `useAnalytics` → `/api/analytics/me|overview|export`. Models: `AnalyticsEvent`, `DailyUsage`. Wired (nav visibility rules apply).

---

### 28. Platform admin analytics — ✅ Working

`AdminDashboard` / `useAdminAnalytics` → `/api/analytics/admin/*` with `requirePlatformAdmin` / `VANI_ADMIN_EMAILS`. **Distinct from** Business org Admin stubs.

---

### 29. Teams workspaces — 🔴 Broken

| Check | Result |
|-------|--------|
| Frontend | **No** hooks, components, or API client |
| Backend | Stub: empty list, fake `team_pending_*` create, 404 get |
| API | `/api/teams` mounted + Business+ gate |
| Database | **No** `Team` model |
| E2E | Cannot create or use a real workspace |

**Why:** Documented stub in `teamsController.js`. Shipping UI would violate PROJECT_RULES (fake features).

---

### 30. Org Admin console — 🔴 Broken

| Check | Result |
|-------|--------|
| Frontend | **No** org-admin UI (do not confuse with platform analytics admin) |
| Backend | Stub overview / empty members / echo settings |
| API | `/api/admin` + Business+ gate |
| Database | No org/member models |
| E2E | No real seats, roles, or audit |

**Why:** Documented stub in `adminController.js`.

---

### 31. Chat tools (web search, calculator, datetime, weather, file reader, …) — ✅ Working

Registered in `backend/tools/implementations/*`, orchestrated in chat/agent loops, results stream as tool/image events. No public REST catalog — invocation is model-driven. E2E via chat when tools enabled.

---

### 32. Home weather widget — 🟡 Partially Working

`ProductivityPanel` shows a **placeholder** (“Location coming soon”). Backend `weather` tool exists for chat, but the home widget is not connected to any weather API.

---

### 33. Identity guard — ✅ Working

Backend stream scrubber (`services/identity/`) wired into chat, agents, canvas AI edit, voice Live, research. No UI required; protects identity in outputs.

---

### 34. Health / readiness / version — ✅ Working

`GET /health`, `/ready`, `/version` (+ subsystem health routes). Used by Docker Compose healthchecks and ops. No product UI required.

---

## Cross-cutting notes

| Topic | Finding |
|-------|---------|
| **Hard product stubs** | Teams, Org Admin, shared project share (501) |
| **In-memory sessions** | Agents, code interpreter, voice, browser runs — E2E OK until process restart |
| **Dead model** | `ChatV2` never imported; production chat uses `Chat` |
| **Disk vs Mongo files** | Chat uploads on disk; project knowledge also Mongo-indexed |
| **Env dependency** | Gemini/Vertex, OAuth, Stripe/Razorpay, ElevenLabs, Redis — code present; live E2E needs secrets |
| **UI honesty** | Creative agents + weather widget correctly labeled “coming soon”; Teams/Admin correctly have **no** fake UI |

---

## Priority gaps (product)

1. **🔴 Teams** — real model + membership + UI, or hide/remove routes from marketing  
2. **🔴 Org Admin** — seats/roles/settings persistence + UI, or keep gated stubs only  
3. **🔴 Shared projects** — replace 501 with real collaboration or stop advertising  
4. **🟡 PDF intelligence UI** — surface ask/search/tables (backend already done)  
5. **🟡 Project knowledge search UI** — wire existing `knowledge/search` endpoint  
6. **🟡 Metering polish** — project storage enforcement, voice minutes, canvas AI-edit meter, MCP tool meter  
7. **🟡 Creative agents** — implement or remove category placeholder  

---

## What this audit does **not** claim

- CI is green on the current branch  
- Production secrets / providers are configured  
- Every optional provider (Anthropic, Ollama, etc.) is live  
- Playwright e2e or Vitest suites were re-run as part of this document  

---

*Generated from static codebase inspection. Update when stubs become real implementations or when UI is wired to existing APIs.*
