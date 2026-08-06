# VANI AI — UI Typography Report

**Date:** 2026-08-06  
**Task:** RC1-UI-7 — Typography Consistency  
**Source:** [UI_AUDIT_REPORT.md](./UI_AUDIT_REPORT.md) (T-1, T-2, T-3)  
**Status:** Verification passed · Review  
**Board:** [UI_POLISH_BOARD.md](../management/UI_POLISH_BOARD.md)

## Objective

Standardize typography across the application using the existing design system. Remove arbitrary `text-[Npx]` sizes, reuse token classes, preserve spacing/layout/content. No redesign.

## Design decisions

| Concern | Decision |
|---------|----------|
| UI body font | **Inter** via `next/font` (`--font-inter`) — remains the product UI face |
| Brand / display | **System SF stack** (`--font-display` / `font-display` / `type-heading`+) — Apple-class titles without “Inter everywhere” on brand moments |
| Size scale | Single `--type-*` source → `--text-*` aliases → Tailwind `@theme` `text-*` utilities |
| Fractional sizes | Snapped to nearest token (e.g. 12.5/13/13.5 → `text-sm` 13px; 10–11.5 → `text-micro` 11px) |

### Token scale

| Token / utility | Size | Role |
|-----------------|-----:|------|
| `text-micro` / `.type-micro` | 11px | Dense labels, badges, meta chips |
| `text-caption` / `.type-caption` | 12px | Captions, hints |
| `text-sm` / `.type-label` | 13px | Labels, controls, secondary UI |
| `text-sidebar` | 14px | Sidebar nav / secondary body |
| `text-body` / `.type-body` | 15px | Default body |
| `text-chat` | 15.5px | Composer |
| `text-assistant` | 16px | Assistant emphasis |
| `text-title` / `.type-title` | 17px | Dialog / panel titles |
| `text-lg` | 20px | Large emphasis |
| `text-heading` / `.type-heading` | 28px | Page / home headings (SF display) |
| `text-display` / `.type-display` | 40px | Hero display |
| `text-display-xl` / `.type-display-xl` | 56px | XL display |

## Changes

1. **`globals.css`** — `--type-*` source layer; `--text-micro`; `--font-display` / `--font-display-stack`; body redefines `--font-sans` so Inter resolves (next/font is body-scoped); `@theme` registers full `text-*` + `font-display` utilities; `type-*` helpers use display stack on headings.
2. **`tailwind.config.ts`** — fontSize / fontFamily mirror of the token scale (docs + tooling; TW4 primary source is `@theme`).
3. **Primitives** — `Button` / `Input` / `SearchInput` / `PremiumEmpty` / `ErrorState` / `ConfirmDialog` use token classes.
4. **Codemod** — **559** arbitrary `text-[Npx]` replacements across **85** files (0 remaining).
5. **Brand moments** — `DynamicHome` / `AuthGate` use `type-heading`; share wordmark uses `font-display`; lightbox OCR text uses `font-display`.

## Surface checklist

| Surface | Result |
|---------|--------|
| Font family (Inter UI + SF brand) | Pass — body `Inter`; `h1.type-heading` `-apple-system` |
| Heading hierarchy (H1–H6 / type-*) | Pass — home/auth/share/dialogs on tokens |
| Body / captions / labels | Pass — `text-body` / `text-caption` / `text-sm` / `text-micro` |
| Buttons | Pass — sm/md/lg → caption/sm/sidebar |
| Inputs | Pass — field `text-sm`; sm fields `text-caption` |
| Sidebar | Pass — nav/meta on sidebar/sm/micro/caption |
| Chat / composer | Pass — `text-chat` on textarea; message chrome on tokens |
| Settings / dialogs | Pass — Billing/Memory/MCP/Confirm on tokens |
| Share page | Pass — brand `font-display text-sm`; title `type-title`; meta `text-micro` / `text-caption` |

## Verification

### Static
- `npx tsc --noEmit` (frontend) — **pass**
- Remaining `text-[Npx]` in `frontend/**/*.{ts,tsx}` — **0**

### Live (`http://localhost:3000`, existing server)

| Mode | Viewport | Result |
|------|----------|--------|
| Light | Desktop 1920×1080 | Home greeting hierarchy intact; sidebar labels consistent |
| Dark | Desktop + forced `html.dark` | Tokens resolve; Inter body + SF heading |
| Dark | Mobile metrics 390×844 | Body 15px / heading 28px; layout preserved |
| Dark | `/share/demo` (unavailable link) | Brand `font-display` 13px; ErrorState token type |

Computed probes (post-fix):

| Class | font-size |
|-------|----------:|
| `text-micro` | 11px |
| `text-caption` | 12px |
| `text-sm` | 13px |
| `text-sidebar` | 14px |
| `text-body` | 15px |
| `text-chat` | 15.5px |
| `text-assistant` | 16px |
| `text-title` | 17px |
| `text-heading` | 28px |

## Remaining notes

| Note | Severity |
|------|----------|
| Share header still uses Sparkles tile (brand mark) — deferred to Share Page Brand Alignment | Next task |
| `global-error.tsx` inline styles — deferred with share brand pass | Next task |
| Snapping 10px→11px / 12.5px→13px is intentional token consolidation, not a layout redesign | Informational |

## Outcome

**Typography is standardized on design-system tokens.** Arbitrary pixel sizes are cleared; Inter remains the UI face; brand headings use the system SF display stack; Button/Input and required surfaces read from one scale without redesign.
