# VANI AI — Performance Phase A Fix Report

**Date:** 2026-08-06  
**Role:** Performance Lead  
**Phase / Task:** RC2-2 Performance Critical Sprint  
**Sources:** [RC1_BLOCKERS.md](./RC1_BLOCKERS.md), [PERFORMANCE_AUDIT.md](./PERFORMANCE_AUDIT.md), [PERFORMANCE_IMPLEMENTATION_PLAN.md](./PERFORMANCE_IMPLEMENTATION_PLAN.md)

---

## Executive summary

Phase A (“Must Fix Before Public Beta”) performance work is largely complete. The dominant user-facing win is **first-load JS**: `/` dropped from audit **~2.28 MB → 1.252 MB** (−45%), under the **≤ 1.8 MB** Public Beta budget with a CI gate.

| Area | Result |
|------|--------|
| First-load `/` JS | **2.284 MB → 1.252 MB** (−45%; budget ≤1.8 MB **PASS**) |
| Chat TTFT | Pre-stream work parallelized; redundant User fetch removed; FeatureGate TTL cache |
| OCR | Worker pool (default 2); sidecar skip preserved |
| Ops | Compression (SSE excluded), Redis multi-replica gate, slim Docker defaults, FE `dumb-init` |

**Updated performance assessment:** Audit score **5.8 / 10** → estimated **7.0–7.5 / 10** for Public Beta delivery/TTFT posture (scale items like vector RAG / message storage remain Phase B).

---

## Before vs after measurements

### Frontend first-load JS (uncompressed)

| Snapshot | Bytes | MB |
|----------|------:|---:|
| Sprint 1 after (2026-08-03) | 1,860,694 | 1.774 |
| **RC1 audit (pre-RC2-2)** | **2,394,899** | **2.284** |
| **RC2-2 after** (`.next/diagnostics/route-bundle-stats.json`) | **1,312,312** | **1.252** |

| Delta vs RC1 audit | **−1,082,587 bytes (−45.2%)** |
| Budget | ≤ 1.8 MB — **PASS** |
| CI | `frontend npm run bundle:budget` after production build |

Artifact: `frontend/scripts/bundle-after.json` refreshed; raw stats copy `frontend/scripts/bundle-rc2-2-after.json`.

### Backend / runtime

| Check | Evidence |
|-------|----------|
| Unit suite (post-backend fixes) | **491** tests passed (agent pass) |
| Performance vitest + validateEnv | **18** tests passed this pass |
| Sidebar unit | **13** passed |
| Live TTFT p50/p95 | **Not re-measured against live providers** this sprint (mocked perf tests only) — staging smoke recommended |

---

## Optimizations implemented

### 1. Reduce initial JS bundle (A1–A4)

| Item | Change |
|------|--------|
| **A1 ExportMenu / jspdf** | `Sidebar` loads `ExportMenu` via `next/dynamic`; PDF path `import()`s `pdfExport` |
| **A2 Canvas barrel** | `@/lib/canvas` no longer re-exports `export.ts`; `CanvasPanel` dynamic-imports export; `CanvasExportFormat` moved to `types` |
| **A3 KaTeX / math** | `MarkdownContent` loads `remark-math` + `rehype-katex` + CSS only when math detected; segments use `MarkdownContent` |
| **Extra jspdf edges** | Analytics + Research barrels no longer re-export PDF helpers; dynamic import on export click |
| **A4 Budget / docs** | `scripts/checkBundleBudget.mjs` + CI step after FE build; launch checklist §9 Performance gates |

### 2. Chat TTFT (A5)

| Item | Change |
|------|--------|
| Reuse `req.user` | Skip `User.findById` when auth already provided `_id` + `name` |
| Parallel pre-stream | `Promise.all` for owned chat, hydrate, project+RAG, memory (1.2s race) before `prepareMessages` |
| FeatureGate cache | ~10s TTL Map for plan/subscription context (BE-M4) |

### 3. OCR (A6–A7)

| Item | Change |
|------|--------|
| **A7 Pool** | `OCR_WORKER_POOL_SIZE` (default 2, cap 1–4); per-slot workers |
| **A6 Sidecar** | Existing skip when `extractedText` present reinforced in `fileParseService` |

### 4. Stream UX + research (A8–A9)

| Item | Change |
|------|--------|
| **A8 Batching** | `useChat` coalesces SSE deltas via `requestAnimationFrame` / 32ms; flush on finalize/replace |
| **A9 searchMany** | Bounded concurrency **3** with AbortSignal |

### 5. Backend / infra (A10–A16, A12–A14)

| Item | Change |
|------|--------|
| **A11 Compression** | `compression` middleware; skips `text/event-stream` / WS upgrade |
| **A10 Redis** | Production + replicas > 1 (`VANI_REPLICAS` / `WEB_CONCURRENCY` / `INSTANCE_COUNT`) or `REQUIRE_REDIS=true` requires Redis |
| **A12 Docker** | Backend build-args default **false** for browser/CI; FE image uses `dumb-init` + healthcheck |
| **A13 Browser poll** | Approval poll gated to panel open / active run / visibility; one initial probe |
| **A14 Probes / checklist** | Backend HEALTHCHECK → `/ready`; launch checklist performance section |
| **A15 Chat list** | `.lean()` + `$text` search when `q` set |
| **A16 Multimodal clone** | Shallow copy in `multiProviderAgent` (no deep-clone of base64) |

---

## Remaining Phase A items

| Item | Status |
|------|--------|
| Live staging TTFT p50/p95 baseline capture | **Open** (process) — checklist item; needs staging keys |
| Force-OCR path full dedupe vs prepareMessages | **Mostly covered** by sidecar; intent-router double-work edge cases may remain |
| CDN / immutable static cache | Phase **B** (INF-M2) — not Phase A |
| Vector RAG / message storage | Phase **B** |

No Phase A code items intentionally skipped beyond live TTFT measurement (ops).

---

## Updated performance assessment

| Dimension | Audit | After RC2-2 |
|-----------|------:|------------:|
| Frontend delivery | 4.5 | **~8.0** (1.25 MB + budget gate) |
| Frontend runtime | 6.5 | **~7.5** (delta batching + poll gate) |
| Backend latency | 5.0 | **~7.0** (parallel TTFT path; OCR pool) |
| Data / cache | 5.5 | **~6.5** (Redis gate; FeatureGate TTL; lean list) |
| Infrastructure | 6.5 | **~7.5** (compression, slim image, `/ready`, checklist) |
| **Overall (est.)** | **5.8** | **~7.2 / 10** |

**Launch risk (perf):** Medium–High → **Medium** for single-instance Public Beta with Redis on; still **High** if multi-replica without Redis (now fail-closed when replica env set).

---

## Files touched (high level)

**Frontend:** `Sidebar`, `ExportMenu`, `MarkdownContent`, `Message`, `CanvasPanel`, `canvas/{index,types,export}`, `analytics/index`, `research/{index,ResearchPanel}`, `useChat`, `useBrowser`, `useAnalytics`, `useAdminAnalytics`, `scripts/checkBundleBudget.mjs`, `Dockerfile`, `package.json`, CI  

**Backend:** `chatController`, `ocr.js`, `app.js`, `validateEnv`, `searchService`, `multiProviderAgent`, `FeatureGate`, `Dockerfile`, `.env.example`  

**Docs:** `LAUNCH_CHECKLIST.md`, this report  

---

## Board transition

| From | To |
|------|----|
| RC2-2 Performance Critical Sprint | **Review** |
| Next Current Task | **RC2-3 Production Hardening Sprint** |

---

*End of Performance Fix Report.*
