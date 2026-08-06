# VANI AI — Architecture

> Describes the system **as implemented** in this repository.  
> Companion docs: [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md), [CURRENT_STATUS.md](./CURRENT_STATUS.md).

---

## 1. System overview

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                     │
│  Next.js (frontend) · NextAuth session · React hooks         │
│  Pages: /  ·  /share/[shareId]                               │
└───────────────┬──────────────────────────────▲──────────────┘
                │ HTTP Bearer JWT               │ SSE / JSON
                │ WebSocket (voice live)        │
┌───────────────▼──────────────────────────────┴──────────────┐
│  Express API (backend/app.js · backend/server.js)            │
│  Middleware: auth, rate limit, usage guard, analytics, …     │
│  Controllers → Services → Providers / Tools / Mongo          │
└───────┬───────────────┬───────────────┬─────────────────────┘
        │               │               │
   MongoDB         Redis (opt)     Disk uploads
   (SoR)           rate/cache      files / generated images
```

**Ownership rules** (also in `PROJECT_RULES.md`):

- Frontend: presentation and session UX.
- Backend: AI orchestration, persistence, authorization.
- Gemini/Vertex credentials never ship to the browser.

---

## 2. Process bootstrap

| File | Role |
|------|------|
| `backend/server.js` | Load env, validate environment, Mongo + Redis connect, `createApp()`, HTTP listen, attach voice WebSocket, schedulers, graceful shutdown |
| `backend/app.js` | `createApp()` — Express factory (used by server and tests). Initializes tools, agents, MCP, browser, code interpreter, billing seed; mounts routes and middleware |

Frontend: Next.js App Router; API routes for auth only (`app/api/auth/*`). Chat and domain APIs hit the Express backend via `NEXT_PUBLIC_API_BASE_URL` / internal base URL.

---

## 3. Frontend architecture

### 3.1 Routing

| Route | File | Purpose |
|-------|------|---------|
| `/` | `app/page.tsx` | Main workspace (chat + panels) |
| `/share/[shareId]` | `app/share/[shareId]/page.tsx` | Public/shared chat view |
| `/api/auth/[...nextauth]` | NextAuth handler | OAuth / session |
| `/api/auth/backend-token` | Mints backend JWT | Bridge to Express |
| `/api/auth/dev-continue` | Dev auth helper | Non-prod when enabled |

### 3.2 State management

No Redux/Zustand. Domain state lives in **hooks**, e.g.:

- `useChat` — messages, SSE stream, stop / regenerate / continue
- `useChatHistory`, `useProjects`, `useCanvas`, `useDeepResearch`
- `useVoiceMode`, `useMessageTts`, `useAgent`, `useBrowser`, `useMcp`
- `useBilling`, `useMemory`, `useTheme`, …

Components under `frontend/components/{chat,voice,canvas,...}` are largely presentational; orchestration stays in hooks / `page.tsx`.

### 3.3 Chat streaming (client)

1. `POST /api/chat` with Bearer token and message history.
2. Response `Content-Type: text/event-stream`; client reads `response.body.getReader()`.
3. Events include `delta` / `replace`, `done`+`chatId`, `error`, `meta`, `usage`, `tool`, `image`, etc.
4. `AbortController` implements Stop; backend observes response `close`.

---

## 4. Backend architecture

### 4.1 Layering

```
routes/  →  controllers/  →  services/  (+ providers, tools, billing, browser, mcp)
                ↓
             models/ (Mongoose)
```

Handlers should stay thin; business logic in services (project convention).

### 4.2 HTTP API map (mounts)

As wired in `backend/app.js`:

| Mount | Routes module |
|-------|----------------|
| Health (liveness/readiness/version) | `healthRoutes.js` |
| `/api/billing/webhooks` | `billingWebhookRoutes.js` |
| `/api/auth` | `authRoutes.js` |
| `/api/models` | `modelRoutes.js` |
| `/api/chat` | `chatRoutes.js` |
| `/api` (legacy chat list aliases, projects) | `legacyChatRoutes.js`, `projectRoutes.js` |
| `/api/files` | `fileRoutes.js` |
| `/api/voice` | `voiceRoutes.js` |
| `/api/tts` | `ttsRoutes.js` |
| `/api/memory` | `memoryRoutes.js` |
| `/api/canvas` | `canvasRoutes.js` |
| `/api/agents` | `agentRoutes.js` |
| `/api/research` | `researchRoutes.js` |
| `/api/mcp` | `mcpRoutes.js` |
| `/api/browser` | `browserRoutes.js` |
| `/api/code` | `codeInterpreterRoutes.js` |
| `/api/billing` | `billingRoutes.js` |
| `/api/analytics` | `analyticsRoutes.js` |
| `/api/teams` | `teamsRoutes.js` |
| `/api/admin` | `adminRoutes.js` |

### 4.3 Chat request path (typical)

```
UI (useChat)
  → POST /api/chat
  → usageGuard / auth middleware
  → createOrUpdateChat (chatController)
  → hydrate attachments, project RAG, memory extras
  → prepareMessages → streamAgentReply (geminiService / toolOrchestrator / multiProviderAgent)
  → SSE deltas to client
  → persist Chat messages (+ optional continueGenerating merge)
  → background auto-memory capture
```

### 4.4 AI / model layer

| Piece | Location | Role |
|-------|----------|------|
| Provider adapters | `backend/providers/{gemini,openai,anthropic,groq,openrouter,ollama}/` | `streamChat` etc. |
| Registry | `backend/providers/index.ts` | Provider registration |
| ModelRouter | `backend/router/ModelRouter.ts` | Resolve model, auto-route, `streamWithFallback` |
| Capability / cost | `CapabilityMatrix.ts`, `CostEstimator.ts` | Routing aids |
| Gemini chat entry | `services/geminiService.js` | `prepareMessages`, `streamAgentReply` |
| Multi-provider agent | `services/multiProviderAgent.js` | Non-native Gemini path |
| Tool loop | `services/toolOrchestrator.js` | Native Gemini tools vs multi-provider |
| Identity guard | `services/identity/` | Scrub / enforce identity in streams |

**Resolve priority** (ModelRouter, as coded): request model → chat sticky → project default → auto (if enabled) → priority model → default Gemini. Fallbacks on stream failure follow a fixed provider order.

### 4.5 Tools (model-callable)

Registered under `backend/tools/` — implementations include:

`webSearch`, `weather`, `calculator`, `dateTime`, `fileReader`, `memory`, `vision`, `ocr`, `imageGeneration`, `imageEdit`, `codeExecution`, `browserAutomation`, …

Agents use a parallel plugin path under `backend/agents/`.

### 4.6 Major subsystems

| Subsystem | Path | Notes |
|-----------|------|-------|
| Memory | `services/memory/` | Encrypt, embed, retrieve, decision engine, cleanup |
| Projects / RAG | `projectService`, `ragService`, `chunkingService`, `embeddingService` | KnowledgeChunk model |
| Canvas | `services/canvas/` | Canvas + CanvasVersion models |
| Research | `services/research/` | SSE research sessions |
| Voice | `services/voice/`, STT/TTS, `voiceLive/`, ElevenLabs | HTTP + WS |
| Browser | `backend/browser/` | Playwright manager/session/executor |
| MCP | `backend/mcp/` | Client, transport, registry, permissions |
| Code interpreter | `services/codeInterpreter/` | Sandbox + Python runner |
| PDF / OCR / DU | `pdfIntelligence/`, `ocr/`, `documentUnderstanding/`, `parsers/` | File routes / tools |
| Billing | `backend/billing/` | Plans, Stripe, Razorpay, FeatureGate |
| Teams | `models/Team.js`, `services/teamService.js`, `teamsController.js` | Business+ workspaces; membership embedded on Team |
| Org Admin | `models/Organization.js`, `services/orgAdminService.js`, `adminController.js` | Business+ org seats/members/settings; not platform analytics admin |
| Analytics | `services/analytics/` | DailyUsage + AnalyticsEvent |
| Image | `geminiImageService`, `openaiImageService`, `imageEditPipeline` | Tools + chat events |

---

## 5. Data model (Mongo)

Models under `backend/models/`:

`User`, `Chat`, `ChatV2`, `Memory`, `Project`, `ProjectFile`, `ProjectMemory`, `KnowledgeChunk`, `Canvas`, `CanvasVersion`, `Research`, `Plan`, `Subscription`, `Usage`, `DailyUsage`, `Invoice`, `AnalyticsEvent`, `McpServer`, `McpPermission`, `BrowserPermission`, `Team`, `Organization`

**Teams:** `Team` stores owner + embedded `members[]` (user, email, role, status). Routes under `/api/teams` are Business+-gated; logic lives in `services/teamService.js`.

**Org Admin:** `Organization` stores unique billing owner, `seatLimit`, embedded members (same role vocabulary as Teams), and whitelist settings. Routes under `/api/admin` are Business+-gated; logic lives in `services/orgAdminService.js`. Distinct from platform analytics admin (`requirePlatformAdmin` / `User.role === "admin"`).

**Note:** `Chat` and `ChatV2` both exist; treat coexistence as part of the current codebase — do not assume one is unused without checking call sites.

---

## 6. Authentication flow

```
Google OAuth (NextAuth)  [optional: Credentials when ALLOW_DEV_AUTH in non-prod]
        ↓
Session on Next.js
        ↓
POST /api/auth/backend-token  →  short-lived HS256 JWT (shared secret)
        ↓
POST /api/auth/sync  →  verify JWT, upsert User from claims (not client email fields)
        ↓
Subsequent API calls: Authorization: Bearer <jwt>
        ↓
requireAuth middleware on Express
```

Platform admins for analytics can be derived from `VANI_ADMIN_EMAILS` during sync. Logout/revoke paths exist under auth routes.

---

## 7. Voice pipeline

**Classic path**

1. Client captures audio → STT (`speechToText` / voice routes)  
2. Transcript → shared chat SSE (`/api/chat`) with tools/memory as configured  
3. Reply → TTS (Gemini PCM and/or ElevenLabs via `/api/tts`)  
4. Frontend playback (`useVoiceMode`, `useMessageTts`)

**Live path**

- Duplex WebSocket attached in `server.js` (`attachVoiceWebSocket`)
- Gemini Live session for realtime audio
- Live mode constrains or disables some tool/memory behaviors (see voice config / reports)

---

## 8. Billing & gating

- Plan catalog seeded via `initBilling()` / plan service  
- Stripe and Razorpay services + webhook routes  
- Feature matrix + `FeatureGate` / `usageGuard` / `featureGating` middleware  
- Usage tracking middleware records after successful responses; enforcement is separate (guards)  
- Teams and org Admin routes are **gated**; Teams list/create/get and Org Admin overview/members/settings now persist (`Team`, `Organization`). Shared project collaboration remains incomplete (see status docs)

---

## 9. Deployment topology

`docker-compose.yml` services:

1. `mongo:7` — persistent volume  
2. `redis:7` — AOF volume  
3. `backend` — Dockerfile, env from `backend/.env.docker`  
4. `frontend` — multi-stage Dockerfile  

CI (`.github/workflows/ci.yml`): Node 22 — backend tests, optional performance job, frontend tests, build, e2e.

No Kubernetes/Helm/Terraform manifests were found at repo root.

---

## 10. Cross-cutting concerns

| Concern | Implementation |
|---------|----------------|
| Logging | Pino / pino-http |
| Errors | `errorHandler` middleware; Sentry when `SENTRY_DSN` set |
| CORS | Allowlist via `corsOriginDelegate` (not `*`) |
| Rate limits | Redis-backed where configured; env-tunable windows |
| Security headers | `securityHeaders` middleware |
| Identity in AI output | IdentityGuard on agent streams |
| Testing | Backend Vitest (unit/integration/security/performance); frontend Vitest; root Playwright e2e |

---

*Update this document when route mounts, boot sequence, or major subsystem boundaries change.*
