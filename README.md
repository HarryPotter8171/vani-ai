# VANI AI

Production-oriented AI assistant platform: chat-first streaming conversations with multi-provider models, tools, voice, memory, projects (RAG), canvas, research, agents, browser automation, MCP, and a sandboxed code interpreter — plus billing and analytics.

**Product intent:** reliability of a top-tier assistant with an original premium UI identity (macOS-like materials), not a ChatGPT clone. Authoritative engineering and UI rules: [PROJECT_RULES.md](./PROJECT_RULES.md).

---

## Documentation map

| Document | Purpose |
|----------|---------|
| [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) | What VANI is, repo shape, capabilities |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design as implemented |
| [CURRENT_STATUS.md](./CURRENT_STATUS.md) | Implemented vs partial vs stubbed |
| [ROADMAP.md](./ROADMAP.md) | Ordered next work from known gaps |
| [CODING_STANDARDS.md](./CODING_STANDARDS.md) | Day-to-day coding conventions |
| [PROJECT_RULES.md](./PROJECT_RULES.md) | UI identity, architecture, git rules |
| [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md) | Production deploy / ops checklist |
| [docs/BACKUP.md](./docs/BACKUP.md) | MongoDB and uploads backup |

Sprint/feature history lives in root `*_REPORT.md` files (supplementary, not product law).

---

## Repository layout

```
vani-ai/
├── backend/          # Express 5 API, AI orchestration, Mongo, tools, billing
├── frontend/         # Next.js App Router UI (TypeScript), NextAuth
├── e2e/              # Playwright end-to-end tests (root package)
├── docs/             # Ops docs (e.g. BACKUP.md)
├── docker-compose.yml
└── .github/workflows/  # CI
```

Root `package.json` is the **e2e harness** only (`vani-ai-e2e`). Frontend and backend each have their own `package.json` and lockfile.

---

## Stack snapshot

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind 4, NextAuth, Vitest |
| Backend | Node ESM, Express 5, Mongoose, Redis (optional), Vitest |
| AI | Gemini / Vertex primary; OpenAI, Anthropic, Groq, OpenRouter, Ollama adapters |
| Data | MongoDB (system of record); Redis for rate limits / cache when configured |
| Billing | Stripe, Razorpay |
| Ops | Docker Compose, GitHub Actions CI, Pino, optional Sentry |

---

## Prerequisites

- Node.js 22+ (CI uses Node 22)
- MongoDB 7 (local or Docker)
- Redis 7 (optional locally; recommended for multi-instance rate limiting)
- Google Cloud / Vertex credentials for Gemini in production-shaped setups
- Google OAuth client for NextAuth (production)

Never commit populated `.env` files, service-account JSON, or files under `backend/keys/`.

---

## Local development

### 1. Backend

```bash
cd backend
cp .env.example .env
# Fill required vars: MONGODB_URI, AUTH_JWT_SECRET / NEXTAUTH_SECRET,
# Gemini/Vertex settings, VANI_MEMORY_ENCRYPTION_KEY (see .env.example)
npm install
npm start
```

Default API port: **5001**. Health: `GET /health`, readiness: `GET /ready`.

### 2. Frontend

```bash
cd frontend
cp .env.example .env.local
# Set NEXTAUTH_SECRET, AUTH_JWT_SECRET (match backend), Google OAuth, URLs
npm install
npm run dev
```

Default app URL: **http://localhost:3000**. For local/LAN development, do **not** bake `NEXT_PUBLIC_API_BASE_URL` into the client (see `frontend/.env.example`).

### 3. Auth bridge

Browser session is NextAuth. The frontend mints a short-lived backend JWT (`/api/auth/backend-token`); Express verifies it and syncs the user via `/api/auth/sync`. API calls use `Authorization: Bearer <jwt>`.

---

## Docker Compose

```bash
cp backend/.env.example backend/.env.docker   # fill secrets
cp frontend/.env.example frontend/.env.docker # fill secrets
docker compose up --build
```

Services: `mongo`, `redis`, `backend` (:5001), `frontend` (:3000). Uploads and DB data use named volumes. Details: [docker-compose.yml](./docker-compose.yml).

---

## Testing

```bash
# Backend
cd backend && npm run lint && npm test
# Optional: npm run test:ci | test:unit | test:integration | test:security

# Frontend
cd frontend && npm run lint && npm test

# E2E (repo root — real frontend + backend + DB journey)
npm install
npm run test:e2e:install
npm run test:e2e
```

---

## Core capabilities

Implemented as wired code paths (see [CURRENT_STATUS.md](./CURRENT_STATUS.md) for nuance):

- Streaming chat (SSE) with stop, regenerate, continue
- Multi-provider model routing and tool orchestration
- Image generation / editing, OCR, PDF intelligence, document parsing
- Voice (STT/TTS and optional Gemini Live WebSocket)
- Long-term memory, projects + RAG, canvas, deep research
- Agents, browser automation (Playwright), MCP, code interpreter
- Billing (Stripe + Razorpay), feature gating, usage guards
- Analytics (user + platform-admin paths), chat share, client export
- Health endpoints, security headers, rate limiting, Docker, CI

**Not fully productized:** Teams workspaces and org Admin console remain stubs (routes/gates exist; persistence/UI incomplete). Do not describe them as shipped.

---

## Configuration reference

| File | Role |
|------|------|
| `backend/.env.example` | Backend env catalog (required vs optional) |
| `frontend/.env.example` | Frontend / NextAuth env catalog |
| `LAUNCH_CHECKLIST.md` | Production secrets and deploy gates |

In production, inject secrets via a secret manager or orchestrator `env_file` — never commit them.

---

## Contributing / change discipline

1. Read [PROJECT_RULES.md](./PROJECT_RULES.md) and [CODING_STANDARDS.md](./CODING_STANDARDS.md).
2. Prefer small, reversible changes; do not break streaming chat or auth.
3. Keep Gemini/Vertex credentials on the backend only.
4. Do not ship UI that implies Teams/Admin collaboration while controllers remain stubs.
5. Commit only when explicitly requested by the project owner.

---

## License

See package metadata in `backend/` and `frontend/` (`ISC` / private as declared there). Treat the repository as private product source unless a root license file is added later.
