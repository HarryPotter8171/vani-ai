# VANI AI — Performance Report (Sprint 1)

**Date:** 2026-08-03  
**Scope:** Frontend production optimization only (no new features, no intentional UI changes)  
**Build:** `npm run build` — **PASS** (Next.js 16.2.10 / Turbopack)

---

## Bundle before

Measured from `.next/diagnostics/route-bundle-stats.json` prior to this sprint (`scripts/bundle-baseline.json`).

| Metric | Value |
|--------|------:|
| Route `/` first-load JS (uncompressed) | **2.009 MB** (2,106,186 bytes) |
| First-load chunk count | 13 |
| Largest first-load chunk | **1,164.6 KB** |
| Next largest chunks | 222.2 KB, 159.7 KB, 143.9 KB, 134.2 KB |

Baseline top first-load chunks were dominated by a single ~1.16 MB client chunk that eagerly included Canvas, Artifacts (incl. Mermaid/React preview path), Voice, MCP, Memory, Browser, Research, and Agents UI.

---

## Bundle after

Measured after Sprint 1 optimizations (`scripts/bundle-after.json`).

| Metric | Value |
|--------|------:|
| Route `/` first-load JS (uncompressed) | **1.774 MB** (1,860,694 bytes) |
| First-load chunk count | 16 (more, smaller async splits) |
| Largest first-load chunk | **409.0 KB** (was 1,164.6 KB) |
| Next largest first-load chunks | 343.6 KB, 222.2 KB, 155.0 KB, 142.4 KB |

### Delta

| | |
|--|--:|
| Absolute savings | **−234 KB** (−0.234 MB) |
| Relative savings | **−11.7%** first-load JS |
| Peak chunk reduction | **1,164 KB → 409 KB** (−65%) |

Heavy feature panels and preview engines now ship as deferred chunks and are downloaded on first open, not on initial `/` paint.

---

## Lazy-loaded modules

Central registry: `frontend/components/lazy/FeaturePanels.tsx`  
All use `next/dynamic` with `ssr: false` and a null loading UI (no visible skeleton flash).

| Feature | Module(s) | Load trigger |
|---------|-----------|--------------|
| **Voice** | `VoiceModeHost` → `VoiceOverlay` (+ `useVoiceMode`) | After hydration / first mic open |
| **Browser** | `BrowserPanel`, `BrowserPermissionDialog` | Panel open / pending approval |
| **Research** | `ResearchPanel`, `ResearchModeToggles` (ChatInput) | Research chrome visible / composer mount |
| **MCP** | `McpSettings` | Settings open |
| **Canvas** | `CanvasPanel` | Canvas workspace open |
| **Memory** | `MemoryManager` | Memory manager open |
| **Agents** | `AgentStatus`, `ExecutionTimeline`, `AgentSelector` (ChatInput) | Agent run / composer |
| **Artifact Preview** | `ArtifactPanel`; `ReactPreview` / `MermaidPreview` already dynamic inside `ArtifactPreview` | Artifact panel open / preview mode |

`app/page.tsx` no longer statically imports these panels; Suspense boundaries wrap each lazy surface.

---

## Render improvements

### Duplicate / unnecessary re-renders

- Stabilized Sidebar callbacks (`useCallback`) so memoized sidebar rows are not invalidated every parent render.
- Single shared `handleForgetMemory` (was an inline async fn **per message per render**).
- `handleArtifactsDetected` no longer depends on `messages` (uses `messagesRef`) — stops callback churn on every stream token.
- `memo(Message)` with custom prop equality; `memo(ChatInput)`, `memo(Sidebar)`, `memo(ChatHistoryItem)`, `memo(ChatHistorySection)`, `memo(MarkdownContent)`, `memo(VirtualizedMessageList)`.

### Voice isolation

- `VoiceModeHost` owns `useVoiceMode` + overlay.
- Waveform `levels`, partial transcripts, and elapsed timer updates **no longer re-render** the chat shell / message list.

### Chat virtualization

- `VirtualizedMessageList` window-renders when **> 40** messages (estimated heights + overscan).
- Short threads keep full mount (same UX as before).
- `content-visibility: auto` + `contain-intrinsic-size` on rows for browser-native paint skipping.

### Markdown / streaming

- Module-level `REMARK_PLUGINS` shared across Message / MarkdownContent / ArtifactPreview (stable identity).
- Streaming assistant content uses `useDeferredValue` so markdown parse / artifact extract work yields under load without changing settled content.
- Replaced per-message `framer-motion` entrance with equivalent CSS `@keyframes vani-msg-in` (same 8px fade/slide, less motion runtime cost).

### Images

- Chat / composer thumbnails: `loading="lazy"` + `decoding="async"` (`Message`, `AttachmentPreview`).

### Hooks

- `useBrowser` approval poll slows to **8s** when idle (no active run); active run stays fast.
- Poll `setState` skipped when run/approval snapshots are unchanged → fewer parent renders.

### Package / config

- `experimental.optimizePackageImports` for `lucide-react` and `framer-motion` in `next.config.ts`.

---

## Remaining bottlenecks

1. **First-load still ~1.77 MB** — React, Next, next-auth, core chat (`useChat` / Sidebar / Header / ChatInput), and shared markdown still ship eagerly. Further gains need route-level splitting or a thinner auth bootstrap.
2. **Streaming still updates `messages` on the page** — deferred markdown helps, but the last assistant row still re-renders frequently; token batching in `useChat` would help next.
3. **Virtualization uses estimated heights** — long mixed artifact/markdown rows can cause minor scroll correction until measured; `@tanstack/react-virtual` is a candidate for Sprint 2.
4. **Canvas / Artifact / Mermaid chunks remain large when opened** — expected; consider compressing Mermaid or CDN-loading it only for diagram artifacts.
5. **`useDeepResearch` / `useAgent` / `useCanvas` still live on `ChatPage`** — idle cost is low, but research SSE still double-updates (research state + messages). Isolating research like Voice would be the next render win.
6. **No webpack bundle analyzer HTML** — Next 16 Turbopack exposes `route-bundle-stats.json`; wire `@next/bundle-analyzer` under a webpack profile if graph UI is required.

---

## Files touched (high level)

- `frontend/app/page.tsx` — lazy panels, Suspense, stable callbacks, virtualized list, Voice host
- `frontend/components/lazy/FeaturePanels.tsx` — dynamic import registry
- `frontend/components/voice/VoiceModeHost.tsx` — voice state isolation
- `frontend/components/chat/VirtualizedMessageList.tsx` — long-thread windowing
- `frontend/components/Message.tsx`, `MarkdownContent.tsx`, `ChatInput.tsx`, `Sidebar.tsx`, `sidebar/*`
- `frontend/components/artifacts/ArtifactPreview.tsx`, `chat/AttachmentPreview.tsx`
- `frontend/hooks/useBrowser.ts`
- `frontend/next.config.ts`, `frontend/app/globals.css`
- Snapshots: `frontend/scripts/bundle-baseline.json`, `frontend/scripts/bundle-after.json`

---

## Verification

```bash
cd frontend && npm run build
# ✓ Compiled successfully
# ✓ TypeScript passed
```

UI contract: same layout, panels, and interactions; feature code loads on demand instead of in the initial `/` graph.
