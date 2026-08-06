# VANI AI Deep Research Module — Verification Report

**Date:** 2026-08-06  
**Scope:** Deep Research only (request flow, SSE progress, sources, citations, report generation, error recovery, long-running tasks, cancellation, performance)  
**Constraints:** No unrelated module changes · no UI redesign · preserve architecture · fix genuine bugs only

---

## Executive summary

Deep Research is a solid multi-phase pipeline (plan → search → fetch → rank/compare → verify → write) with SSE progress, citations, pause/resume/cancel, and Mongo persistence. This pass found and fixed several correctness bugs around resume concurrency, stale DB writes, cancel persistence, and streaming replace frames.

| Area | Status |
|------|--------|
| Research request flow | Verified |
| Streaming progress (SSE) | Verified (delta `replace` fixed) |
| Source collection | Verified |
| Citation handling | Verified (IDs synced to session sources) |
| Report generation | Verified (fallback + extract budget) |
| Error recovery | Verified |
| Long-running tasks | Verified (TTL + exclusive pipeline) |
| Cancellation | Verified (persist + abort signal) |
| Performance | Acceptable (caps + caches; notes below) |

**Verdict:** Production-ready for authenticated Deep Research runs with the fixes in this pass. Integration suite: **13/13 passing**.

---

## Architecture (preserved)

```
Client (useDeepResearch)
  POST /api/research/run  →  SSE events
  POST /api/research/sessions/:id/{pause,resume,cancel}
  GET  /api/research[/sessions/:id]

Controller (researchController)
  → runDeepResearch / resumeDeepResearch
  → ResearchSession (in-memory) + Research model (Mongo)

Pipeline (researchOrchestrator)
  planning → searching → reading → comparing → verifying → writing
  Planner · Search (Tavily / Gemini grounding / DDG) · Fetcher
  Ranker · Contradictions · Report + Citations · optional Code Interpreter
```

Auth + `usageGuard("research")` + rate limit (8/min) on `/run`. Feature metric: `research_runs`.

---

## Verified functionality

### Research request flow
- `POST /api/research/run` accepts `query` / `message`, optional `chatId`, `projectId`, `resumeSessionId`
- Creates or reuses chat; persists user question; mints session id up front for live registry lookup
- Ownership checks on live + persisted sessions (IDOR → 404)
- List history scoped to caller (`GET /api/research`)

### Streaming progress
- SSE: `session_start`, `phase`, `progress`, `timeline`, `plan`, `search_done`, `source`, `contradictions`, `confidence`, `delta`, `completed`, `error`, `cancelled`, `paused`, `resumed`, `done`
- Client `reduceResearchState` drives panel timeline / sources / report
- ETA from phase estimates in config

### Source collection
- Multi-provider search with merge + URL dedupe
- Parallel fetch (concurrency 4) with SSRF guards, timeouts, retries, page cache
- Rank by relevance / authority / extract quality; content near-dedupe
- Failed fetches keep snippet fallback; pipeline continues

### Citation handling
- `assignCitations` → `[1]…[n]`; report instructs inline cites
- `ensureReferences` appends `## References` if model omitted it
- Structured `citations[]` for CitationViewer
- Session `sources` now carry matching `citationId` / `citationLabel` after write phase

### Report generation
- Streaming Gemini write with identity guard; non-stream + deterministic fallbacks
- Confidence from source quality + contradiction load
- Follow-ups from plan; report appended to chat (once)

### Error recovery
- Planner / contradictions / search providers fail soft (fallback plan, empty contradictions, other providers)
- Fetch errors per-URL; abort during cancel surfaces as cancelled, not failed
- Feature gate denial surfaced via `GateDenialError` on the client

### Long-running tasks
- Pause between phases (`waitIfPaused`); disconnect auto-pauses
- In-memory resume joins the same pipeline (no double execution)
- Persisted cancelled/interrupted sessions restart from saved query
- Session TTL (2h) expires abandoned entries and cancels leftover live work

### Cancellation
- `POST …/cancel` aborts `AbortSignal`, marks terminal, **persists** status
- Client Stop aborts SSE + cancel API; Resume restarts from saved query when terminal
- Pause/resume endpoints also persist

### Performance
- Caps: queries, results/query, sources fetched/in-report, extract chars, total extract budget
- Search + page TTL caches; fetch concurrency bound
- Search queries run sequentially (reliability over max throughput — intentional)

---

## Bugs fixed in this pass

| Bug | Impact | Fix |
|-----|--------|-----|
| `resumeDeepResearch` re-entered `executePipeline` while original run was paused | Duplicate work, racey state | `_pipelinePromise` + `runPipelineExclusive` |
| Cancelled sessions allowed through resume path | Aborted signal; broken continue | Reject all terminal sessions on resume |
| Stale async `persistSession` could overwrite `completed` with `planning` | Wrong DB status | Per-session persist chain; snapshot at write time |
| Pause/cancel/resume did not persist | History/resume lost after Stop | `persistSession` in those handlers |
| Resume sent placeholder query `"Resume research"` | Wrong research topic after reload | Empty query + prefer saved query / strip placeholder |
| SSE `delta` with `replace: true` always appended in UI | Corrupted mid-stream report | Honor `replace` in reducer; skip replace in chat `onDelta` |
| Citation IDs not written back onto `session.sources` | Sources tab lacked `[n]` alignment | Map `citedSources` onto ranked sources before `complete` |
| Original + resume handlers could double-append report to chat | Duplicate assistant messages | `_reportAppendedToChat` guard |
| Session map kept non-terminal sessions forever after TTL | Memory leak | TTL cancel + delete |
| `maxTotalExtractChars` unused | Oversized write prompts | Enforce budget in `reportGenerator` |
| Integration mock ignored `sessionId` | Mid-run persist skipped in tests | Pass through `sessionId` |

---

## Known limitations (not bugs)

- Horizontal scale: in-memory sessions + caches are single-process (noted in `cache.js`)
- Stop uses cancel (terminal) then Resume = full restart, not mid-phase continue
- DuckDuckGo HTML parsing is best-effort; Tavily optional via `TAVILY_API_KEY`
- No dedicated unit tests for ranker/citations/urlSafety (integration covers HTTP surface)
- Code Interpreter analysis is optional and no-op when disabled

---

## Files touched

### Backend
- `backend/services/research/researchOrchestrator.js`
- `backend/services/research/researchSession.js`
- `backend/services/research/reportGenerator.js`
- `backend/controllers/researchController.js`
- `backend/tests/integration/research.test.js`

### Frontend (behavior only; no UI redesign)
- `frontend/hooks/useDeepResearch.ts`
- `frontend/lib/research/types.ts`

### Docs
- `RESEARCH_REPORT.md` (this file)

---

## Test evidence

```
cd backend && npm test -- --run tests/integration/research.test.js
→ 13 passed (auth, SSE run, chat persist, IDOR, pause/resume/cancel, list)
```

---

## Checklist (requested)

- [x] Research request flow
- [x] Streaming progress
- [x] Source collection
- [x] Citation handling
- [x] Report generation
- [x] Error recovery
- [x] Long-running tasks
- [x] Cancellation
- [x] Performance
