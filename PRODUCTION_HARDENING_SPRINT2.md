# Production Hardening Sprint 2 — Report

**Date:** 2026-08-04
**Scope:** Rate limiting (Redis), health/readiness, environment validation, observability, Docker, graceful shutdown
**Status:** Complete — backend build, lint, and full test suite (381 tests) pass

---

## Summary

Sprint 2 closes the remaining production-readiness gaps left after Sprint 1's
auth/authorization hardening. It does **not** touch product features or UI:
every change is infrastructure — rate limiting, health checks, environment
validation, structured logging/observability, containerization, and graceful
shutdown.

No existing API contract, auth flow, streaming behavior, memory pipeline,
agent/tool execution, browser automation, or MCP integration was changed.
New middleware and endpoints are strictly additive.

---

## 1. Rate limiting (Redis-compatible)

- `backend/middleware/rateLimit.js` — same `createRateLimiter(options)` API
  as before, now backed by an **atomic Redis fixed-window counter** (Lua
  `INCR` + `PEXPIRE`-once, via `config/redis.js`'s `rateLimitIncr` script)
  when `REDIS_URL` / `REDIS_HOST` is set, so limits are correct across every
  instance in a multi-node deployment.
  - **Automatic fallback**: unconfigured Redis, a not-yet-connected client,
    or any Redis error transparently falls back to the original in-process
    counter for that request (logged as a warning) — a Redis outage
    degrades to per-instance limits rather than failing requests open/closed.
  - **Behavior preserved**: with no `REDIS_URL`/`REDIS_HOST` set (the
    existing test/dev default), the limiter is byte-for-byte the same
    synchronous in-memory implementation as before — the pre-existing unit
    tests (`tests/unit/middleware/rateLimit.test.js`) pass unmodified.
- `backend/config/redis.js` — lazy singleton `ioredis` client, `isRedisConfigured()`,
  `getRedisClient()`, `connectRedis()`, `pingRedis()`, `closeRedis()`.
- `backend/config/rateLimits.js` — centralized, env-overridable limits.
- Applied to the requested surfaces (all additive — no existing rate limit
  changed):
  - `backend/routes/authRoutes.js` — router-wide limiter (IP-keyed; identity
    isn't established yet at `/sync`). Default: 20 req/min.
  - `backend/routes/chatRoutes.js` — per-user limiter on all authenticated
    chat routes (60 req/min) + a lighter IP-keyed limiter on the public
    `GET /shared/:shareId` read (30 req/min). SSE streaming is unaffected —
    the limiter only gates request admission, not the response stream.
  - `backend/routes/projectRoutes.js` — per-user limiter on `/api/projects/*`
    (120 req/min).
  - Untouched: `fileRoutes.js` and `browserRoutes.js` already had their own
    limiters from before this sprint — they now automatically get Redis
    backing too since they use the same `createRateLimiter`, with no code
    changes required there.

## 2. Health & readiness

- `backend/controllers/healthController.js` / `backend/routes/healthRoutes.js`
  — mounted at the app root (before CORS/body-parsing) in `backend/app.js`:
  - **`GET /health`** — full diagnostic snapshot: MongoDB (`readyState` +
    `admin().ping()`), Redis (`PING`, skipped/healthy if not configured),
    disk (`fs.statfs` free/used %), process + system memory. Returns `200`
    when Mongo/Redis (if configured) are healthy, `503` otherwise.
  - **`GET /ready`** — minimal boolean-style gate for load balancers /
    k8s readiness probes: `200 {status:"ready"}` / `503 {status:"not_ready"}`
    based on the same Mongo/Redis checks.
  - Disk and memory are **reported but never gate the HTTP status** —
    `os.totalmem()/os.freemem()` reflect the host, not a container's cgroup
    limit, so they're informational rather than pass/fail (avoids false
    "unhealthy" flaps in containerized/shared environments).
  - Unauthenticated by design (consumed by infra, not end users).

## 3. Environment validation

- `backend/config/validateEnv.js` — `validateEnvironment({ throwOnError })`,
  called at the top of `backend/server.js` (after `dotenv` loads `.env`).
  - **Strict by default when `NODE_ENV=production`** — throws (server.js
    logs and `process.exit(1)`) if any required variable is missing:
    - `AUTH_JWT_SECRET` (or `NEXTAUTH_SECRET`)
    - `NEXTAUTH_SECRET`
    - `MONGODB_URI`
    - `GOOGLE_CLOUD_PROJECT` + `GOOGLE_CLOUD_LOCATION` (Gemini/Vertex AI)
    - `GOOGLE_APPLICATION_CREDENTIALS` — only validated (must be a readable
      file) *if set*; unset is fine on GCP infra using workload identity
    - `TAVILY_API_KEY` — only required if `TAVILY_ENABLED=true`
    - `VANI_MEMORY_ENCRYPTION_KEY`
  - Outside production: logs warnings and continues (frictionless local dev
    — matches the existing `.env` for this repo, which is intentionally
    permissive).
  - Never imported by `app.js` / `createApp()`, so the Vitest suite (which
    tests the Express app directly, not `server.js`) is unaffected.

## 4. Observability

- `backend/utils/logger.js` — structured JSON logging via `pino`:
  - `logger` — app-wide logger, redacts `Authorization`/cookie/token/password
    fields, silent during automated tests (`NODE_ENV=test` with no
    `LOG_LEVEL` override) to keep CI output clean.
  - `httpLogger` (`pino-http`) — mounted first in `app.js`. Generates or
    echoes `X-Request-Id` on every response, attaches `req.id`/`req.log`,
    logs one structured line per request (method/url/status/level by
    status code), skips `/health` and `/ready` to avoid probe noise.
- `backend/utils/errorTracking.js` — Sentry-ready hooks:
  - `initErrorTracking()` — initializes `@sentry/node` only if `SENTRY_DSN`
    is set; otherwise a documented no-op (structured logs only).
  - `captureException(err, context)` — always logs structurally; also
    forwards to Sentry when configured. Used by the new global error
    handler and by `unhandledRejection`/`uncaughtException` listeners.
  - `flushErrorTracking()` — best-effort flush during graceful shutdown.
- **Safe error responses** — new final error-handling middleware in
  `backend/app.js` (after the existing CORS-rejection handler): logs +
  reports every otherwise-uncaught error with the request id, and returns
  `{ error: "Internal server error", requestId }` for 5xx (never a stack
  trace or internals), or `{ error: message, requestId }` for a controller-set
  4xx `err.status`. No-ops if headers were already sent (e.g. mid-SSE-stream).

## 5. Docker

- `backend/Dockerfile` — multi-stage (`deps` → `runtime`), `node:22-bookworm-slim`,
  production-only `npm ci`, installs Playwright's Chromium + OS deps for
  browser automation (skippable via `--build-arg INSTALL_BROWSER_AUTOMATION=false`
  for a leaner image), runs as an unprivileged `vani` user under `dumb-init`
  (so `SIGTERM`/`SIGINT` reach `server.js`'s graceful-shutdown handlers
  instead of being swallowed as PID 1), `HEALTHCHECK` against `GET /health`.
- `backend/.dockerignore` — excludes `node_modules`, `.env*`, `keys/`,
  `uploads/`, `.browser-data/`, `coverage/`, `tests/`, docs.
- `backend/.env.example` — full reference of every environment variable the
  backend reads (required + optional), safe to commit (no real secrets).
- `frontend/Dockerfile` — multi-stage Next.js build using `output: "standalone"`
  (added to `frontend/next.config.ts` — no behavior change to `next dev`,
  verified with a full `next build`), unprivileged user, `HEALTHCHECK`.
- `frontend/.dockerignore`, `frontend/.env.example` — mirrors the backend.
- `docker-compose.yml` (repo root) — `mongo` (7, healthcheck via `mongosh`),
  `redis` (7-alpine, AOF persistence, healthcheck via `redis-cli ping`),
  `backend` (waits for both healthy, `REDIS_URL`/`MONGODB_URI` wired to the
  compose service names), `frontend` (waits for backend healthy). Secrets
  come from `backend/.env.docker` / `frontend/.env.docker` (gitignored,
  copy from the new `.env.example` files) — never baked into the image or
  committed to `docker-compose.yml`.

> Docker itself is not installed in the sandbox this sprint was built in, so
> `docker build`/`docker compose up` could not be executed end-to-end here.
> The Dockerfiles were written against the same Node version as CI
> (`node:22-bookworm-slim` vs. CI's Node 22) and the backend's full boot
> sequence (env validation → health/ready → graceful shutdown) was verified
> directly on the host via `npm run smoke:test` (see below). **Recommend a
> `docker build` + `docker compose up` smoke test in CI or on a dev machine
> with Docker before the first production deploy.**

## 6. Graceful shutdown

`backend/server.js` now listens for `SIGINT`/`SIGTERM` and, in order:

1. Stops accepting new HTTP connections (`httpServer.close()`), waiting for
   in-flight requests (including SSE streams) to finish.
2. Stops the memory-cleanup scheduler (`stopMemoryCleanupScheduler()`, new
   export from `services/memory/cleanup.js`).
3. In parallel (`Promise.allSettled`): closes the Mongo connection, closes
   the Redis connection (`closeRedis()`), shuts down all browser automation
   sessions (`browserManager.shutdown()` — pre-existing method), disconnects
   all MCP sessions (`mcpManager.shutdown()` — **new method**, mirrors
   `browserManager.shutdown()`), terminates the Tesseract OCR worker
   (`shutdownOcrWorker()` — pre-existing).
4. Flushes any pending Sentry events (bounded, best-effort).
5. Exits `0` on success.

A 15s force-exit timer guarantees the process always terminates even if a
step hangs (e.g., a client holding an SSE connection open) — logged as an
error and exits `1` so the process manager knows the shutdown wasn't clean.

Verified end-to-end with `npm run smoke:test`
(`backend/scripts/smokeTestServer.mjs`): boots the real server against an
in-memory Mongo, confirms `/health` and `/ready`, confirms `X-Request-Id` is
present, sends `SIGTERM`, and asserts the process exits `0` after logging
`[shutdown] complete`.

---

## Files changed / added

### New — backend
| File | Purpose |
|---|---|
| `config/redis.js` | Redis client singleton, ping, atomic rate-limit script, close |
| `config/rateLimits.js` | Env-overridable rate limit tuning |
| `config/validateEnv.js` | Startup environment validation |
| `utils/logger.js` | Structured logging + request-id HTTP middleware |
| `utils/errorTracking.js` | Sentry-ready capture/flush hooks |
| `controllers/healthController.js` | `/health`, `/ready` check logic |
| `routes/healthRoutes.js` | `/health`, `/ready` routes |
| `Dockerfile`, `.dockerignore`, `.env.example` | Container image + config reference |
| `scripts/checkSyntax.js` | Syntax-checks every backend source file (`npm run build` / `lint`) |
| `scripts/smokeTestServer.mjs` | End-to-end boot/health/shutdown smoke test (`npm run smoke:test`) |
| `tests/unit/config/validateEnv.test.js` | Env validation unit tests |
| `tests/unit/controllers/healthController.test.js` | Health/ready unit tests |
| `tests/unit/middleware/rateLimit.redis.test.js` | Redis-backed limiter unit tests (mocked Redis) |

### Modified — backend
| File | Change |
|---|---|
| `middleware/rateLimit.js` | Redis-backed with automatic in-memory fallback; same public API |
| `app.js` | Mount `httpLogger`, `healthRoutes`; add safe final error handler |
| `server.js` | `dotenv/config` ordering fix, env validation, error-tracking init, structured logging, Redis connect, graceful shutdown |
| `routes/authRoutes.js` | Add auth rate limiter |
| `routes/chatRoutes.js` | Add chat + public-shared rate limiters |
| `routes/projectRoutes.js` | Add projects rate limiter |
| `services/memory/cleanup.js`, `services/memory/index.js` | Export `stopMemoryCleanupScheduler` |
| `mcp/MCPManager.ts` | Add `shutdown()` (disconnects all sessions, stops health monitor) |
| `package.json` | New deps (`ioredis`, `pino`, `pino-http`, `@sentry/node`); `build`/`lint` → `checkSyntax.js`; `smoke:test` script |
| `.gitignore` | Ignore `coverage/`, `.next/`, `.env.docker` variants |

### New — frontend
| File | Purpose |
|---|---|
| `Dockerfile`, `.dockerignore`, `.env.example` | Production container image + config reference |

### Modified — frontend
| File | Change |
|---|---|
| `next.config.ts` | Add `output: "standalone"` (required for the Docker image; verified with `next build`, no other behavior change) |

### New — repo root
| File | Purpose |
|---|---|
| `docker-compose.yml` | Mongo + Redis + backend + frontend, healthchecked, persistent volumes |

---

## New endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health` | None | Liveness + dependency diagnostics (Mongo, Redis, disk, memory) |
| `GET` | `/ready` | None | Readiness gate for load balancers / orchestrators |

No existing endpoint's path, method, request shape, or response shape changed.

---

## Required environment variables

See `backend/.env.example` and `frontend/.env.example` for the full,
copy-pasteable reference. Summary of what's **new** this sprint (all
optional unless noted):

| Variable | Required? | Purpose |
|---|---|---|
| `VANI_MEMORY_ENCRYPTION_KEY` | **Required in production** (validated at boot) | Already existed (Sprint 1 memory encryption); now enforced at startup |
| `REDIS_URL` or `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`/`REDIS_USERNAME`/`REDIS_TLS` | Optional | Enables cross-instance-correct rate limiting + `/health` Redis check. Unset → in-process fallback |
| `SENTRY_DSN` | Optional | Enables Sentry error tracking. Unset → structured logs only |
| `SENTRY_TRACES_SAMPLE_RATE` | Optional | Sentry performance sampling (default `0`) |
| `LOG_LEVEL` | Optional | Overrides the default log level (`info` in prod, `debug` in dev, `silent` in tests) |
| `TAVILY_ENABLED` | Optional | If `true`, `TAVILY_API_KEY` becomes required at boot |
| `VANI_AUTH_RATE_LIMIT_MAX` / `_WINDOW_MS` | Optional | Tune `/api/auth/*` limiter (default 20/min) |
| `VANI_CHAT_RATE_LIMIT_MAX` / `_WINDOW_MS` | Optional | Tune `/api/chat` limiter (default 60/min/user) |
| `VANI_CHAT_PUBLIC_RATE_LIMIT_MAX` / `_WINDOW_MS` | Optional | Tune public shared-chat limiter (default 30/min/IP) |
| `VANI_PROJECTS_RATE_LIMIT_MAX` / `_WINDOW_MS` | Optional | Tune `/api/projects/*` limiter (default 120/min/user) |
| `VANI_DISK_WARN_PCT` / `VANI_MEMORY_WARN_PCT` | Optional | Thresholds surfaced in `/health` diagnostics |

Already-required variables (Sprint 1, now also enforced at boot in
production): `AUTH_JWT_SECRET`/`NEXTAUTH_SECRET`, `MONGODB_URI`,
`GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`.

---

## Deployment steps

1. **Provision Redis** (recommended for anything beyond a single instance) —
   any Redis-protocol-compatible service (Redis, Valkey, ElastiCache).
   Set `REDIS_URL` (or the discrete `REDIS_HOST`/`REDIS_PORT`/...) on the
   backend. Omit entirely for a single-instance deploy — rate limiting still
   works via the in-process fallback.
2. **Set all required production env vars** (see table above and
   `backend/.env.example`) — the server now refuses to start in
   `NODE_ENV=production` if any are missing, with a clear error listing
   exactly which ones and why.
3. **(Optional) Configure Sentry** — set `SENTRY_DSN` to enable error
   tracking; leave unset to rely on structured stdout logs only (still
   fully functional — ingest with any log aggregator).
4. **Build images**:
   ```bash
   docker compose build
   # or individually:
   docker build -t vani-backend ./backend
   docker build -t vani-frontend ./frontend \
     --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api \
     --build-arg NEXT_PUBLIC_APP_URL=https://app.example.com
   ```
5. **Provide secrets** — `cp backend/.env.example backend/.env.docker` and
   `cp frontend/.env.example frontend/.env.docker`, fill in real values
   (never commit these — already gitignored).
6. **Start the stack**: `docker compose up -d` (or deploy the two images to
   your orchestrator of choice, pointing at your own managed Mongo/Redis).
7. **Point your load balancer / orchestrator's liveness+readiness probes**
   at `GET /health` and `GET /ready` respectively.
8. **Verify**:
   ```bash
   curl -sf http://localhost:5001/health | jq
   curl -sf http://localhost:5001/ready
   cd backend && npm run smoke:test   # boot + health + graceful-shutdown check
   ```
9. **Confirm graceful shutdown** in your orchestrator: a rolling
   deploy/restart should show `[shutdown] received SIGTERM` /
   `[shutdown] complete` in logs and a clean exit, not a hard kill.

---

## Verification

```bash
cd backend
npm run build          # scripts/checkSyntax.js — 188 files, all pass
npm run lint            # same script — no errors
npm run test:ci          # unit + integration + security — 381/381 pass
npm run smoke:test       # real boot: /health, /ready, X-Request-Id, graceful SIGTERM
```

`frontend`: `next build` passes with `output: "standalone"` added. Frontend
`npm run lint` has 10 pre-existing errors / 2 warnings (React hooks rules in
`VirtualizedMessageList.tsx`, `McpSettings.tsx`, `useVoiceMode.ts`,
`VoiceModeHost.tsx`) — confirmed present identically **before** this sprint's
`next.config.ts` change (via `git stash`) and unrelated to any file touched
in Sprint 2. Left as-is per this sprint's scope (backend production
reliability/scalability/security only — no feature work, no UI changes).

---

## Remaining production risks

1. **Docker images unbuilt/untested in this environment.** No Docker
   daemon was available in the sandbox this sprint was authored in. The
   Dockerfiles/compose file are written carefully (multi-stage, non-root,
   healthchecks, `dumb-init` for correct signal handling) but should get one
   real `docker build && docker compose up` pass — and a Playwright/e2e run
   against the built images — before the first production deploy.
2. **SSE connections can delay graceful shutdown.** `httpServer.close()`
   waits for in-flight connections (including long-lived chat/agent/research
   SSE streams) to finish; the 15s force-exit timer bounds this, but a
   client mid-stream during a deploy will see the connection cut once that
   timer fires. Consider a shorter in-flight grace period plus an explicit
   "stream ending, please reconnect" SSE event if zero-drop deploys become
   a requirement.
3. **Host-level memory/disk metrics in containers.** `/health`'s
   memory/disk figures come from `os.totalmem()`/`fs.statfs()`, which
   reflect the container host, not a cgroup memory limit. They're
   intentionally informational-only (don't gate the HTTP status) for this
   reason — if you need real OOM-risk signals, wire in a cgroup-aware check
   (e.g. read `/sys/fs/cgroup/memory.max` + `memory.current`) or rely on your
   orchestrator's own memory-limit enforcement instead.
4. **Rate limits are per-process defaults, not load-tested.** The chosen
   defaults (20/min auth, 60/min chat, 30/min public share, 120/min
   projects) are reasonable starting points, not derived from production
   traffic data. Tune via the documented `VANI_*_RATE_LIMIT_*` env vars once
   real usage patterns are known.
5. **Sentry is opt-in and unverified against a real DSN.** `initErrorTracking()`
   was exercised with `SENTRY_DSN` unset (the no-op path, covered by
   existing tests indirectly through `captureException`'s logging path);
   the actual Sentry SDK network path (`Sentry.init` + `captureException`
   against a live project) was not.
6. **Playwright/Chromium in the backend image is large.** Installing browser
   automation's Chromium + OS deps meaningfully increases image size and
   build time. If browser automation isn't used in your deployment, build
   with `--build-arg INSTALL_BROWSER_AUTOMATION=false`.
7. **Frontend pre-existing lint errors** (see Verification) are unrelated to
   this sprint but still outstanding in the repo; track separately.
8. **No automated Redis integration test against a real Redis server** —
   the Lua rate-limit script and the atomic-increment logic are covered by
   unit tests with a mocked client (`tests/unit/middleware/rateLimit.redis.test.js`),
   not against a real `redis-server` (none was available in this sandbox).
   Recommend a CI job with a Redis service container before relying on it
   at scale.
