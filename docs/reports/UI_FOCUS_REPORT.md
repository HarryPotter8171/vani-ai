# VANI AI — UI Focus States Report

**Date:** 2026-08-06  
**Task:** RC1-UI-2 — Focus States only  
**Source:** [UI_AUDIT_REPORT.md](./UI_AUDIT_REPORT.md) (X-1, X-2, F-1)  
**Status:** Verification passed · Review  
**Board:** [UI_POLISH_BOARD.md](../management/UI_POLISH_BOARD.md)

## Objective

Restore visible keyboard focus indicators across the app. Remove accessibility-suppressing patterns (`outline-none` / `focus-visible:shadow-none` without a replacement). Keep VANI identity and shared design tokens. No redesign, spacing, typography, or animation changes.

## Token source of truth

| Token / class | Role |
|---------------|------|
| `--focus-ring` / `--shadow-focus` | Accent focus glow (`0 0 0 3px` accent) |
| Global `:focus-visible` | Outline ring for buttons, links, menu/tab roles |
| Form `:focus-visible` | Same accent outline for `textarea` / `input` / `select` / `[contenteditable]` / `[role=textbox]` |
| `.focus-ring-token:focus-visible` | Box-shadow ring when a control must keep `outline-none` |
| `.vani-composer:focus-within` | Composer shell uses `--focus-ring` (inner textarea stays outline-free) |

## Changes

### Global (`frontend/app/globals.css`)
- Stopped clearing outlines on form fields (`textarea` / `input` / `select` no longer set `outline: none` alone).
- Restored token accent outlines for form fields and editors.
- Extended interactive role coverage (`switch`, menu item variants).
- Added `.focus-ring-token` and `.vani-composer:focus-within` helpers.

### Composer (X-1)
- Removed `ring-0 focus:ring-0 focus-visible:shadow-none` from the message textarea.
- Kept `outline-none` on the inner field only so focus reads on the shell.
- Shell uses `.vani-composer` + `--focus-ring` for a clear keyboard focus affordance.

### Suppressed-focus cleanup (X-2 / F-1)
Removed bare `outline-none` (or replaced with `.focus-ring-token`) across:

| Area | Files |
|------|-------|
| Sidebar / search | `Sidebar.tsx`, `SidebarSearchPanel.tsx`, `ChatHistoryItem.tsx` |
| Settings | `BillingSettings.tsx`, `McpSettings.tsx` |
| Memory / home | `MemoryManager.tsx`, `ProductivityPanel.tsx` |
| Workspace | `AutomationWorkspace.tsx`, `TasksWorkspace.tsx` |
| Voice | `VoiceControls.tsx` |
| Canvas / artifacts / CI | `CanvasPanel.tsx`, `CanvasAiMenu.tsx`, `CanvasCodeEditor.tsx`, `CanvasRichTextEditor.tsx`, `ArtifactCodeEditor.tsx`, `CodeEditor.tsx` |
| Share / command | `ShareMenu.tsx`, `CommandPalette.tsx` |

### Intentionally retained `outline-none` (with replacement)
| Control | Replacement |
|---------|-------------|
| Composer textarea | `.vani-composer:focus-within` + `--focus-ring` |
| `Switch` | `focus-visible:shadow-focus` |
| Message actions | `focus-visible:ring-accent/*` |
| Floating mic / voice orb | `focus-visible:ring-white/30` |

## Verification

### Static
- No remaining `outline-none` without an accessible replacement (composer shell, Switch, message actions, voice chrome).
- Global form-field focus rules no longer neutralize outlines.

### Live (`http://localhost:3000`, existing server — not restarted)
1. Composer focused → form `.vani-composer:focus-within` box-shadow includes `rgba(107, 92, 255, 0.22) 0 0 0 3px` and accent-tinted border.
2. CSSOM contains `button:focus-visible`, `textarea:focus-visible`, `.vani-composer`, `.focus-ring-token`.
3. DOM inventory of `outline-none` → **0 unsafe** (all paired with ring/shadow/shell).
4. Controls present for checklist: composer, sidebar New Chat / Search / Settings, plus (file upload) menu, agent/model dropdowns.

### Surfaces covered

| Surface | Result |
|---------|--------|
| Composer | Pass — shell `--focus-ring` |
| Sidebar | Pass — bare suppressors removed; global button outline |
| Buttons | Pass — global `:focus-visible` |
| Inputs / selects | Pass — global form outlines + settings/MCP cleanup |
| Dropdowns | Pass — trigger buttons use global outline; menus use role rules |
| Dialogs | Pass — ConfirmDialog / settings chrome inherit button focus |
| Menus | Pass — plus menu + `[role=menuitem]` rules |
| Settings | Pass — selects no longer `outline-none` |
| File upload controls | Pass — plus trigger inherits button focus |

## Remaining notes

| Note | Severity |
|------|----------|
| Shared Button/Input primitives still absent — focus is token/CSS-level until RC1-UI-4. | Follow-up (board) |
| Modal focus-trap unevenness (D-2) unchanged — out of scope for focus-indicator-only work. | Deferred |

## Outcome

**Keyboard focus visibility is restored.** Composer no longer suppresses its focus ring; form fields and editors use design-token outlines/rings; bare `outline-none` without replacement is cleared from the audited surfaces.
