# VANI AI — UI Components Report

**Date:** 2026-08-06  
**Task:** RC1-UI-4 — Shared Button & Input Primitives  
**Source:** [UI_AUDIT_REPORT.md](./UI_AUDIT_REPORT.md) (D-1)  
**Status:** Verification passed · Review  
**Board:** [UI_POLISH_BOARD.md](../management/UI_POLISH_BOARD.md)

## Objective

Standardize buttons and input controls across the app by introducing shared primitives and migrating duplicated CTA/form recipes. No redesign, color system changes, layout changes, or animation changes. Preserve existing behavior.

## Primitives introduced

| Primitive | Path | Variants / recipes |
|-----------|------|--------------------|
| `Button` | `frontend/components/ui/Button.tsx` | `primary` · `secondary` · `ghost` · `destructive` · `icon` + sizes `sm`/`md`/`lg`/`dialog` + `loading` / `disabled` |
| `Input` | `frontend/components/ui/Input.tsx` | Text / password / url / email via `type` |
| `Textarea` | same | Shared field chrome + `resize-none` |
| `Select` | same | `pill` (Memory/MCP) · `field` (Billing AI) |
| `SearchInput` | same | Pill shell + leading Search icon |
| `FilePicker` | same | Hidden `input[type=file]` + `Button` trigger |
| `DropdownTrigger` | same | Icon/ghost Button recipe for dropdown triggers |

Shared field tokens match existing Memory / MCP form chrome (`rounded-[14px]`, `border-border`, `bg-white/70 dark:bg-white/[0.06]`, `focus:border-accent/30`). Button focus uses global `:focus-visible` from RC1-UI-2. Loading uses shared `Spinner`.

## Consistency checklist

| Control | Radius | Spacing | Type | Hover | Active | Disabled | Focus | Loading |
|---------|:------:|:-------:|:----:|:-----:|:------:|:--------:|:-----:|:-------:|
| Primary | pill | size scale | 12–14px | accent-hover | scale 0.98 | opacity 50 | global | Spinner inverse |
| Secondary | pill | size scale | 12–14px | surface/white | scale 0.98 | opacity 50 | global | Spinner accent |
| Ghost | pill | size scale | 12–14px | surface-hover | scale 0.98 | opacity 50 | global | Spinner accent |
| Destructive | pill | size scale | 12–14px | #ff453a | scale 0.98 | opacity 50 | global | Spinner inverse |
| Icon | pill | square hit | — | surface-hover | scale 0.98 | opacity 50 | global | Spinner |
| Text / Password | 14px | px-3.5 py-2.5 | 13.5px | — | — | opacity 60 | global form | — |
| Search | pill shell | px-3 py-2 | 13px | — | — | — | focus-within accent | — |
| Textarea | 14px | same as text | 13.5px | — | — | opacity 60 | global form | — |
| Select (pill) | pill | px-3 py-1.5 | 12px | — | — | opacity 60 | global form | — |
| Select (field) | lg | px-2.5 py-2 | 13px | — | — | opacity 60 | accent border | — |
| File picker | via Button | sm ghost default | 12px | ghost hover | — | opacity 50 | global | — |
| Dropdown trigger | via Button icon | sm | — | icon hover | — | opacity 50 | global | — |

Password: no live password field in product today; `Input type="password"` uses the shared text recipe.

## Screen audit & migration

| Surface | Buttons | Inputs | Migrated |
|---------|---------|--------|----------|
| Auth / reconnect | Primary + secondary CTAs | — | Yes |
| Confirm dialog | Cancel ghost + confirm primary/destructive | — | Yes |
| ErrorState retry | Primary + loading | — | Yes |
| Settings / Billing | Manage Memories primary; AI model/voice selects | Select field | Yes |
| Memory manager | Save/Cancel; Summarize secondary; search/select | Textarea, Input, Select, SearchInput | Yes |
| MCP settings | Create/Cancel/Add/Test primary+ghost | Input, Textarea | Yes |
| Analytics | CSV/PDF secondary; Admin primary; icon refresh/close | — | Yes |
| Code Interpreter | Run/Stop/Upload/Canvas; FilePicker | File picker | Yes |
| Automation workspace | Start primary + loading | Textarea, Input | Yes |
| Browser permission | Allow / Always / Deny | — | Yes |
| Research panel | Resume/Stop icon; Markdown/PDF ghost | — | Yes |
| Tasks workspace | Add icon primary | Input sm | Yes |
| Composer / ChatInput | Specialized send/voice (kept local) | Composer shell (kept local) | Deferred — unique layout |
| Command palette / code editors | Specialized | Specialized | Deferred — unique layout |
| Sidebar New Chat | Existing domain CTA | — | Deferred — domain chrome |

## Verification

### Static
- `npx tsc --noEmit` (frontend) — pass
- Primitives live under `frontend/components/ui/`; no duplicate Button/Input modules introduced

### Live (`http://localhost:3000`, existing server — not restarted)
1. Home shell loads; accent primary CTAs intact (`#6b5cff` / `rgb(107, 92, 255)`).
2. Settings → Memory → **Manage Memories** uses shared `Button` (`btn-ripple`, `rounded-full`, `h-9` / 36px, 13px type, accent fill).
3. Settings → AI → Default model + Voice use shared `Select` (`appearance="field"`, `rounded-lg`, 13px).
4. Keyboard focus on Manage Memories shows token accent ring (RC1-UI-2).

## Remaining notes

| Note | Severity |
|------|----------|
| Composer, command palette, and code editors keep local controls (specialized shells). | Follow-up optional |
| Modal shell (audit D-2) not in this slice — Empty/Error adoption is next board item. | Deferred |
| Some panel action rows (MCP connect/disconnect/delete chips) still use one-off class strings; primary form CTAs migrated. | Minor |

## Outcome

**Shared Button + Input primitives are in place and adopted on the high-traffic form/CTA surfaces.** Radius, spacing, typography, hover/active/disabled, focus, and loading behavior now resolve through one recipe set without redesign.
