# VANI AI — Project Context

> Living context for humans and agents working on this repository.  
> Based on the codebase as it exists today. Related: [PROJECT_RULES.md](./PROJECT_RULES.md), [ARCHITECTURE.md](./ARCHITECTURE.md), [CURRENT_STATUS.md](./CURRENT_STATUS.md).

---

## 1. What VANI is

VANI is a **chat-first AI assistant platform**. Users hold durable conversations with streaming model replies, attach files, use voice, long-term memory, projects with RAG, canvas documents, deep research, agents, browser automation, MCP tools, and a sandboxed code interpreter.

**v1 product posture:** VANI AI **v1 is a consumer AI product** (individual Free/Pro experience). Business / Enterprise collaboration features are paused for development; existing Business backend APIs remain in the tree but are not the active sprint focus. See [docs/management/SPRINT_BOARD.md](./docs/management/SPRINT_BOARD.md) and [ADR-003](./docs/management/DECISIONS.md).

**Product goal** (from [PROJECT_RULES.md](./PROJECT_RULES.md)): a production-ready AI platform with top-tier assistant reliability and an **original premium identity** that feels like a macOS application — not a ChatGPT clone.

Product overview and quick start live in [README.md](./README.md). Product and engineering intent live in `PROJECT_RULES.md`. Operational launch steps live in `LAUNCH_CHECKLIST.md`. Feature sprint history lives in root `*_REPORT.md` files.

---

## 2. Repository shape

Monorepo:

| Path | Role |
|------|------|
| `backend/` | Express 5 API, AI orchestration, persistence, tools, billing |
| `frontend/` | Next.js App Router UI (TypeScript), NextAuth |
| `e2e/` | Playwright end-to-end tests (root package) |
| `docs/` | Ops docs (`BACKUP.md`), management board, sprint reports |
| `.github/workflows/` | CI (`ci.yml`) |
| `docker-compose.yml` | Local/self-hosted stack: Mongo, Redis, backend, frontend |

Root `package.json` is an **e2e harness** only (`vani-ai-e2e`). Frontend and backend each have their own `package.json`.

---

## 3. Primary user surfaces

| Surface | Implementation |
|---------|----------------|
| Main chat workspace | `frontend/app/page.tsx` (SPA-style) |
| Shared conversation (read) | `frontend/app/share/[shareId]/page.tsx` |
| Auth (browser) | NextAuth routes under `frontend/app/api/auth/` |
| Auth gate / session | `AuthGate`, `AuthProvider`, backend `/api/auth/sync` |

Secondary UI domains (components + hooks): voice, canvas, research, agents, browser, MCP, code interpreter, memory, billing, analytics/admin dashboard, projects, settings.

---

## 4. Core product capabilities (implemented)

These exist as wired code paths (routes + services + UI and/or tools), not as docs-only ideas:

- Streaming chat (SSE) with stop, regenerate, continue
- Multi-provider model routing (Gemini primary; OpenAI, Anthropic, Groq, OpenRouter, Ollama adapters)
- Image generation and editing tools
- Voice: STT/TTS and optional Gemini Live WebSocket
- Long-term memory (store, retrieve, auto-capture, cleanup)
- Projects + file RAG / embeddings
- Canvas + versions + AI edit
- Deep research (SSE)
- Agents (planner/executor) and chat tool orchestration
- Browser automation (Playwright)
- MCP client/manager
- Code interpreter (Python sandbox)
- PDF intelligence, OCR, document understanding / parsers
- Billing (Stripe + Razorpay), plans, usage guards, feature matrix
- Analytics (user + platform-admin paths)
- Chat share + client export (PDF/etc.)
- Health, security headers, rate limiting, Docker, CI

**Not fully productized** (stubs or documented gaps): Teams workspaces, org Admin console, several collaboration/metering items. See [CURRENT_STATUS.md](./CURRENT_STATUS.md) and [ROADMAP.md](./ROADMAP.md).

---

## 5. Technology snapshot

| Layer | Stack |
|-------|--------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind 4, Framer Motion, NextAuth, Vitest |
| Backend | Node ESM, Express 5, Mongoose, Redis (optional), Vitest/Supertest |
| AI | `@google/genai` (Gemini/Vertex), OpenAI-compatible and other provider adapters |
| Voice | Gemini STT/TTS, ElevenLabs TTS, Gemini Live WS |
| Docs/media | pdf-parse, mammoth, xlsx, sharp, tesseract.js, Playwright |
| Billing | Stripe, Razorpay |
| Observability | Pino, Sentry (when configured) |

---

## 6. Data & secrets

- **System of record:** MongoDB (chats, users, memory, projects, canvas, research, billing, analytics, …). See `docs/BACKUP.md`.
- **Redis:** used when configured (rate limits / related cache).
- **Uploads:** on-disk under backend upload paths; metadata in Mongo.
- **Secrets:** never commit `.env`, keys under `backend/keys/`, or service-account JSON. Reference: `backend/.env.example`, `frontend/.env.example`.

---

## 7. How work should be approached

1. Read [PROJECT_RULES.md](./PROJECT_RULES.md) for UI, architecture, and git rules.
2. Read [ARCHITECTURE.md](./ARCHITECTURE.md) for request paths and module ownership.
3. Check [CURRENT_STATUS.md](./CURRENT_STATUS.md) before treating a feature as done.
4. Execute only the **Current Task** on [docs/management/SPRINT_BOARD.md](./docs/management/SPRINT_BOARD.md); do not pull unscheduled roadmap milestones or **paused** Business/Enterprise work.
5. Prefer small, reversible changes; do not break streaming chat or auth.
6. Do not call Vertex/Gemini from the browser; credentials stay on the backend.

---

## 8. Related documentation index

| Document | Purpose |
|----------|---------|
| `README.md` | Product overview, quick start, testing |
| `PROJECT_RULES.md` | Engineering + UI identity source of truth |
| `ARCHITECTURE.md` | System architecture as implemented |
| `CURRENT_STATUS.md` | Feature completion inventory |
| `ROADMAP.md` | Long-term milestones only (not the active sprint) |
| `docs/management/SPRINT_BOARD.md` | **Only** source of truth for the current sprint |
| `CODING_STANDARDS.md` | Coding conventions (points to PROJECT_RULES) |
| `LAUNCH_CHECKLIST.md` | Production deploy / ops checklist |
| `docs/BACKUP.md` | Mongo / uploads backup |
| `docs/management/` | Sprint board, known issues, changelog, release checklist, decisions |
| `docs/reports/` | Per-task engineering reports |
| Root `*_REPORT.md` | Historical sprint/feature reports |

---

*Last documented from workspace inspection. Update this file when the product’s core identity or monorepo layout changes.*
