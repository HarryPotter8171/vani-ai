# VANI AI — UI Panel Skeletons Report

**Date:** 2026-08-06  
**Task:** RC1-UI-3 — Panel Skeletons only  
**Source:** [UI_AUDIT_REPORT.md](./UI_AUDIT_REPORT.md) (L-1 / L-2)  
**Status:** Verification passed · Review  
**Board:** [UI_POLISH_BOARD.md](../management/UI_POLISH_BOARD.md)

## Objective

Replace blank (`null`) lazy-load states with consistent skeleton placeholders so opening feature panels never flashes empty chrome. Use shared `Skeleton` tokens, keep layout stable, match existing glass design. No redesign / typography / spacing / animation changes.

## Shared shells

New: `frontend/components/lazy/PanelSkeletons.tsx`

| Shell | Use |
|-------|-----|
| `ModalPanelSkeleton` | Settings, Memory, MCP, Analytics, AI/Admin dashboards |
| `SidePanelSkeleton` | Browser, Code Interpreter, Canvas, Artifacts |
| `InlinePanelSkeleton` | Research + agent timeline chrome in chat |
| `VoiceOverlaySkeleton` | Full-screen voice mode |
| `DialogSkeleton` | Browser permission dialog |
| `CompactControlSkeleton` | Composer agent/model selectors + voice FAB host |

All shells use existing `Skeleton` / `SkeletonText`, `modal-overlay`, `bg-surface` / `bg-surface-glass`, and accent-neutral shimmer tokens.

## Wiring

### `FeaturePanels.tsx`
Replaced `loading: () => null` with typed shells per export (modal / side / inline / voice / dialog).

### `app/page.tsx`
- Suspense fallbacks use the same shells (no `fallback={null}` for feature panels).
- Modals mount **only when open** so skeletons appear on open-load, not as stacked overlays on every cold page load.
- Side panels (Browser / CI / Canvas / Artifacts) keep conditional mount + sized `SidePanelSkeleton` to reserve rail width.

### `VoiceModeHost.tsx`
Voice overlay mounts when expanded; Suspense uses `VoiceOverlaySkeleton`.

### `ChatInput.tsx`
Agent / model `dynamic()` loaders use `CompactControlSkeleton` instead of `null`.

## Audit coverage

| Surface | Result |
|---------|--------|
| Research panel | Pass — `InlinePanelSkeleton` |
| Voice panel | Pass — `VoiceOverlaySkeleton` + FAB host skeleton |
| Browser panel | Pass — side shell `md:w-[420px] lg:w-[460px]` |
| Code Interpreter | Pass — side shell `md:w-[460px] lg:w-[520px]` |
| MCP | Pass — modal shell (mount-on-open) |
| Analytics | Pass — modal shell `max-w-[820px]` |
| Settings | Pass — modal shell; verified open on live app |
| Memory | Pass — modal shell |
| Projects | N/A (eager) — `FilesWorkspace` / project chrome are not dynamically imported; no `null` loader |
| Other dynamic side panels | Pass — Canvas / Artifacts / permission dialog / agent chrome |

## Verification

### Static
```bash
rg -n 'fallback=\{null\}|loading:\s*\(\)\s*=>\s*null' frontend --glob '*.{tsx,ts}'
```
**Result:** no matches.

### Live (`http://localhost:3000`, existing server — not restarted)
1. App loads without blank modal stacks.
2. Composer shows Select agent / Select model (no empty control holes).
3. Settings opens to real BillingSettings chrome (chunk may be warm; loader path is wired for cold open).
4. Glass modal / sidebar layout unchanged.

## Remaining notes

| Note | Severity |
|------|----------|
| Artifact/Canvas **preview** sub-dynamics still use Spinner (content preview, not panel chrome). | OK / out of scope |
| Projects workspace tabs are eager — no lazy blank to fix. | OK |
| Shared Button/Input primitives still next (RC1-UI-4). | Follow-up |

## Outcome

**Lazy panels no longer render blank while loading.** Shared skeleton shells reserve modal / rail / inline / voice layout using existing design tokens.
