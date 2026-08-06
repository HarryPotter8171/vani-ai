# VANI AI — Production Testing Sprint: Test Report

**Date:** 2026-08-03
**Scope:** Add a production-grade automated test suite across the whole application (backend + frontend + end-to-end). No product features were added or changed — the only non-test code changes are: (1) a testability refactor that splits Express app construction from server bootstrap, (2) two small, targeted bug fixes surfaced by the new tests (see [Bugs found & fixed](#bugs-found--fixed)), and (3) a couple of test-only hooks (`data-testid`, an E2E-only Next.js `distDir` override) that have zero effect on production behavior.

---

## 1. Summary

| Layer | Framework | Test files | Tests | Status |
|---|---|---|---|---|
| Backend unit | Vitest | 17 | 175 | ✅ passing |
| Backend integration | Vitest + Supertest | 10 | 174 | ✅ passing |
| Backend security | Vitest + Supertest | 1 | 15 | ✅ passing |
| Backend performance | Vitest + Supertest | 5 | 7 | ✅ passing |
| Frontend unit / component | Vitest + React Testing Library | 14 | 126 | ✅ passing |
| End-to-end | Playwright | 1 (10 steps) | 1 | ✅ passing |
| **Total** | | **48 files** | **498** | **✅ all passing** |

Both production builds pass:

- `cd backend && npm run build` → `node --check server.js` ✅
- `cd frontend && npm run build` → `next build` ✅ (compiles, type-checks, and prerenders all routes)

---

## 2. What's covered

### 2.1 Unit tests (`backend/tests/unit/**`, `frontend/tests/unit/**`)

| Area | Files |
|---|---|
| Utilities | `utils/corsOrigins.test.js`, `utils/fileSignatures.test.js`, `frontend/tests/unit/lib/utils.test.ts`, `chatGroups.test.ts`, `chatSearch.test.ts` |
| Parsers (txt/csv/docx/pdf/xlsx/markdown) | `parsers/parseBuffer.test.js` |
| Memory | `memory/cache.test.js`, `memory/encryption.test.js`, `memory/validate.test.js` |
| Markdown | Exercised inside `parseBuffer.test.js` (parser) and `frontend/tests/unit/lib/artifacts.test.ts` (markdown → artifact extraction) and `Message.test.tsx` (rendered markdown) |
| Auth | `utils/jwt.test.js`, `utils/tokenRevocation.test.js` |
| Permissions | `permissions/BrowserPermissions.test.js`, `permissions/MCPPermissionManager.test.js`, `permissions/browserSafety.test.js` |
| Agents / tools | `agents/AgentSession.test.js`, `agents/Planner.test.js`, `tools/fileReader.test.js`, `tools/imageGeneration.test.js`, `tools/vision.test.js` |
| Rate limiting | `middleware/rateLimit.test.js` |

### 2.2 Integration tests (`backend/tests/integration/**`)

One file per feature area, run against a **real Express app** (`app.js`) and a **real in-memory MongoDB** (`mongodb-memory-server`), with only the outbound Gemini/Vertex AI client mocked at a single seam (`services/geminiClient.js`):

`auth.test.js` · `chat.test.js` (incl. SSE streaming) · `voice.test.js` (incl. streaming TTS) · `agents.test.js` · `browser.test.js` · `research.test.js` (Deep Research SSE) · `memory.test.js` · `mcp.test.js` · `documentUnderstanding.test.js` · `canvas.test.js`

### 2.3 Authentication tests

Covered in `auth.test.js` + `security.test.js`:

- Login/sync (`POST /api/auth/sync`, provisioning from verified JWT claims, idempotency)
- Logout (`POST /api/auth/logout`, token revocation, cookie clearing)
- Session/token expiry (`nbf` in the future, expired tokens, tampered tokens, `none`-algorithm tokens)
- Unauthorized access (missing/malformed `Authorization` header on every protected route)
- Ownership validation — **19 dedicated IDOR tests** across chat, memory, canvas, MCP, browser, research, and file endpoints

### 2.4 Security tests (`backend/tests/security/security.test.js`)

- **IDOR**: cross-user access denied for chats, memories, canvases, MCP servers, browser runs, research sessions, files (19 cases, see above)
- **File access**: signed/file-scoped tokens can't be reused across files or against the wrong endpoint (`documentUnderstanding.test.js`)
- **Rate limiting**: per-IP bucketing, window reset/recovery, standard `X-RateLimit-*` headers
- **CORS**: allowed-origin reflection, rejection of untrusted origins (403), preflight handling, non-browser (no-Origin) clients
- **JWT validation**: wrong signature, `none` algorithm, malformed token, missing claims, not-yet-valid tokens

### 2.5 UI tests (`frontend/tests/unit/components/**`)

| Area | Files |
|---|---|
| Chat | `ChatInput.test.tsx`, `Message.test.tsx`, `chat/EmptyState.test.tsx` |
| Sidebar | `Sidebar.test.tsx` (mobile drawer + desktop layout, keyboard shortcuts, projects), `sidebar/ChatHistoryItem.test.tsx`, `sidebar/SidebarSearch.test.tsx` |
| Canvas | `canvas/CanvasAiMenu.test.tsx` |
| Artifacts | `artifacts/ArtifactCard.test.tsx`, `lib/artifacts.test.ts` |
| Mobile layout | `Sidebar.test.tsx` (drawer open/close/backdrop at mobile widths) |
| Theme switching | `hooks/useTheme.test.tsx`, `Header.test.tsx` (theme toggle wiring) |

### 2.6 Performance tests (`backend/tests/performance/**`)

See [benchmarks](#3-performance-benchmarks) below. Covers long chats (10k+ messages), large PDFs, large images/OCR, concurrent streaming, and memory stress.

### 2.7 End-to-end (`e2e/tests/userJourney.spec.ts`, Playwright)

A single serial test drives the **real Next.js frontend + real Express backend + real in-memory MongoDB** through one authenticated session:

1. **Login** — dev-auth bypass (same cookie/session path as Google OAuth)
2. **Chat** — sends a message, verifies the streamed reply renders
3. **Memory** — opens Memory Manager, adds and verifies a memory
4. **Document upload** — attaches a real `.txt` file via the composer, verifies parsing + summarization
5. **Image generation** — triggers the `image_generation` tool, verifies the image renders
6. **Voice mode** — creates a session, transcribes audio, synthesizes speech (REST)
7. **Deep Research** — runs the real multi-phase pipeline to completion, verifies SSE events (REST)
8. **MCP** — connects a local echo MCP server, lists tools, calls one (REST)
9. **Browser automation** — starts a run, approves it, verifies it leaves `awaiting_approval` (REST)
10. **Logout** — via the real UI

Steps 6–9 are driven at the REST boundary using the same bearer token the frontend itself mints (`/api/auth/backend-token`) — this is exactly what the corresponding frontend hooks (`useBrowser`, `useDeepResearch`, `useMcp`, `useVoiceMode`) call under the hood, so the backend contract is exercised for real without depending on flaky natural-language tool-calling.

The only mocked dependency anywhere in the E2E run is the outbound Gemini/Vertex AI client (`VANI_E2E_MODE=true` → `services/testDoubles/mockGeminiClient.js`) — auth, persistence, file parsing, MCP transport, browser permission gating, and the Deep Research state machine all run exactly as in production.

---

## 3. Performance benchmarks

All measured on a local dev machine (M-series laptop equivalent), single run. Assertions use generous ceilings (see "Budget" column) to guard against pathological regressions (e.g. an accidental O(n²) path), not to micro-benchmark absolute speed — see [Remaining risks](#4-remaining-risks) for why these run as an informational, non-blocking CI job.

| Scenario | Measured | Budget |
|---|---|---|
| Write a 10,000-message chat | 259.0 ms | < 5,000 ms |
| Read a 10,000-message chat via API | 87.3 ms | < 5,000 ms |
| List 30 chats × 200 messages each | seed 141.6 ms / list 14.9 ms | list < 3,000 ms |
| Rename an already-10k-message chat | 18.1 ms | < 3,000 ms |
| Upload + parse + understand a 200-page PDF | upload 45.8 ms / parse 318.8 ms / understand 250.8 ms | < 10,000 ms each |
| Upload + OCR a 2400×2400 PNG | upload 162.1 ms / OCR 1,028.0 ms | upload < 10,000 ms / OCR < 45,000 ms |
| 20 concurrent streaming chat requests | 108.2 ms (vs. 2,084.0 ms sequential estimate) | concurrent < 85% of sequential estimate |
| Memory stress: seed 200 memories, list/search/semantic-retrieve | seed 26.3 ms / list 24.1 ms / search 5.3 ms / retrieve 15.2 ms | list < 2,000 ms / search < 2,000 ms / retrieve < 3,000 ms |

---

## 4. Remaining risks

1. **Performance assertions on shared CI runners.** Wall-clock timing thresholds (especially the concurrency-vs-sequential comparison in `concurrentStreaming.test.js`, and the 45s OCR budget in `largeImage.test.js`) are inherently sensitive to CPU/IO contention on shared GitHub-hosted runners. CI runs them in a **separate, `continue-on-error: true` job** so infra noise can't block merges, but this means a genuine performance regression in that job won't fail the pipeline by itself — it needs a human to notice the reported numbers. Recommendation: track these numbers over time (e.g. store historical run artifacts) rather than relying solely on the pass/fail assertion.
2. **`mongodb-memory-server` cold-start cost in CI.** The GitHub Actions runner has no system `mongod`, so the first CI run per cache-key downloads one. This is cached (`~/.cache/mongodb-binaries`) but the very first run on a new runner image/cache generation will be slower and depends on network access to the MongoDB download CDN.
3. **Frontend statement coverage is low in absolute terms (~8%, see [Coverage](#5-coverage) below)** relative to backend (~50%). The suite targets the highest-value, most user-facing surfaces per the requested scope (chat, sidebar, canvas, artifacts, mobile, theme) rather than exhaustively covering every component, hook, and `lib/` module (e.g. `useVoiceMode.ts`, `useCanvas.ts`, the export/PDF pipeline, and most `lib/*/api.ts` thin fetch wrappers have no dedicated unit tests). The E2E suite exercises many of these paths end-to-end, but that isn't reflected in the Istanbul/v8 coverage numbers since coverage is only collected for the Vitest run.
4. **E2E is a single long serial spec.** This mirrors a realistic user session end-to-end (which was the ask), but it means one early-step failure (e.g. login) hides all later assertions in that run. It also runs with `workers: 1` / `retries: 1` on CI, so it is not parallelized and takes ~15–25s per run — acceptable today, but will need splitting into independent specs if the journey grows much longer.
5. **Backend coverage gaps** are concentrated in: `services/research/*` (the multi-provider search/fetch/rank pipeline is covered behaviorally via `research.test.js`'s mocked orchestrator, but the real network-calling internals of `searchService.js`, `sourceFetcher.js`, `sourceRanker.js` are largely untested in isolation), `services/vision/imageProcessor.js`, and most `tools/implementations/*` beyond the ones explicitly listed in scope (browserAutomation, memory, weather, webSearch, dateTime, calculator have partial/no direct unit coverage — several are exercised indirectly through integration tests instead).
6. **Lint debt is pre-existing and out of scope.** `frontend/npm run lint` reports a large number of pre-existing errors/warnings (mostly `react-hooks/*` rules) unrelated to this testing sprint. It is intentionally **not** wired into CI as a blocking gate, since doing so would fail every push regardless of this change. Recommend tackling separately.
7. **No `mongod` is installed in this sandboxed dev environment either** — tests here run identically to CI in that they auto-download `mongodb-memory-server`'s binary on first run unless a system `mongod` is present.

---

## 5. Coverage

### Backend (`cd backend && npm run test:coverage`)

```
Statements   : 50.13% ( 3897/7774 )
Branches     : 38.60% ( 2428/6290 )
Functions    : 54.95% ( 660/1201 )
Lines        : 52.65% ( 3733/7089 )
```

Strongest coverage: `controllers/*`, `utils/*`, `services/parsers/*`, `services/memory/*`, `agents/*`, `mcp/*`. Weakest: `services/research/*` internals (network-heavy, mocked in integration tests rather than unit-tested), `services/vision/imageProcessor.js`, most `tools/implementations/*`.

### Frontend (`cd frontend && npm run test:coverage`)

```
Statements   : 7.58% ( 547/7216 )
Branches     : 9.06% ( 454/5010 )
Functions    : 8.78% ( 139/1582 )
Lines        : 7.90% ( 504/6377 )
```

Strongest coverage: `components/sidebar/*` (~86%), `lib/artifacts.ts` (95%), `hooks/useOnClickOutside.ts`, `hooks/useAuthUser.ts`. As noted in [Remaining risks](#4-remaining-risks), this reflects the requested scope (chat/sidebar/canvas/artifacts/mobile/theme) rather than full-application coverage — large subsystems like voice, browser, research, and MCP panels are validated primarily through the backend integration suite and the E2E journey, not frontend unit tests.

Full HTML coverage reports are generated at `backend/coverage/index.html` and `frontend/coverage/index.html` (gitignored; regenerate locally or download from the CI artifact).

---

## 6. Bugs found & fixed

The test suite surfaced two real, pre-existing bugs (neither is a new feature — both are narrow, targeted fixes):

1. **Deep Research: progress snapshots silently failed to persist during a live run.** `runResearch`'s `onEvent` callback closed over the outer `session` variable, which is only assigned *after* `await runDeepResearch(...)` resolves — but the callback fires for every phase *during* that call, so it saw `session === null` and crashed inside `persistSession` (caught and logged as `[research] persist failed: Cannot read properties of null (reading 'toJSON')`, visible on every research run in server logs, including in the new E2E run). Fixed by minting the session id up front and having the callback look the live session up via the existing session registry (`getResearchSession`) instead of the stale closure variable. Verified via the E2E Deep Research step and `research.test.js` (13/13 passing), and the log line is now gone from a full E2E run.
2. **`Sidebar`'s `Ctrl/Cmd+K` → focus-search test was flaky**, not a product bug: the component's `focusSearch` defers via `requestAnimationFrame`, which doesn't flush synchronously in jsdom. Fixed the test to `waitFor` the focus assertion instead of asserting immediately.
3. **`memory.test.js` was intermittently flaky in the full suite** (not reproducible in isolation): all ~40 write requests in that file shared one synthetic client IP, occasionally tripping the 40/min per-IP write rate limit on an unrelated test mid-file. Fixed by giving every virtual test user in that file a distinct `X-Forwarded-For` IP (the same pattern already used in `mcp.test.js`), eliminating the shared bucket. Verified clean across 5+ consecutive full-suite runs after the fix.

---

## 7. How to run

```bash
# Backend
cd backend
npm ci
npm run test:unit          # unit only
npm run test:integration   # integration only
npm run test:security      # security only
npm run test:performance   # performance benchmarks
npm run test:ci            # unit + integration + security, with coverage (what CI runs)
npm run test:coverage      # everything, with coverage
npm run build               # node --check server.js

# Frontend
cd frontend
npm ci
npm run test                # all unit/component tests
npm run test:coverage       # with coverage
npm run build                # next build

# End-to-end (from repo root)
npm ci
npm run test:e2e:install    # one-time: install Playwright's Chromium
npm run test:e2e            # boots real backend + real frontend, runs the full user journey
```

## 8. Continuous Integration

`.github/workflows/ci.yml` runs on every push and pull request, with five jobs:

| Job | What it runs | Blocking? |
|---|---|---|
| `backend-tests` | `npm run test:ci` (unit + integration + security, with coverage) | ✅ required |
| `backend-performance` | `npm run test:performance` | ⚠️ informational (`continue-on-error`, see [risk #1](#4-remaining-risks)) |
| `frontend-tests` | `npm run test:coverage` | ✅ required |
| `build` | backend `node --check` + frontend `next build` | ✅ required |
| `e2e-tests` | Playwright full user journey (after the three jobs above pass) | ✅ required |

Coverage reports and the Playwright HTML report/traces are uploaded as workflow artifacts on every run (`if: always()`) for post-mortem debugging of failures.
