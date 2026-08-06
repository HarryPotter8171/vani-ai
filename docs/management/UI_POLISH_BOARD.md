# VANI AI — UI Polish Board

> Source of truth for the **RC1 UI polish** pass (no redesign).  
> Audit: [UI_AUDIT_REPORT.md](../reports/UI_AUDIT_REPORT.md).  
> Accent report: [UI_ACCENT_REPORT.md](../reports/UI_ACCENT_REPORT.md).  
> Focus report: [UI_FOCUS_REPORT.md](../reports/UI_FOCUS_REPORT.md).  
> Skeletons report: [UI_SKELETONS_REPORT.md](../reports/UI_SKELETONS_REPORT.md).  
> Components report: [UI_COMPONENTS_REPORT.md](../reports/UI_COMPONENTS_REPORT.md).  
> Empty/Error report: [UI_EMPTY_ERROR_REPORT.md](../reports/UI_EMPTY_ERROR_REPORT.md).  
> Typography report: [UI_TYPOGRAPHY_REPORT.md](../reports/UI_TYPOGRAPHY_REPORT.md).

**Sprint slice:** RC1-UI — identity, focus, shared primitives, panel states  
**Product posture:** Polish only — no layout redesign, no new features, no animation/typography system changes unless listed below.

---

## Status legend

| Status | Meaning |
|--------|---------|
| **Current Task** | Exactly one active implementation task |
| **Todo** | Scheduled for this polish pass, not started |
| **Review** | Implementation done; awaiting verification / doc sign-off |
| **Blocked** | Cannot proceed until blocker clears |
| **Done** | Completed and signed off |

---

## Board

| ID | Status | Item | Notes |
|----|--------|------|-------|
| RC1-UI-6 | **Current Task** | Share Page Brand Alignment | Align share + `global-error` with VaniLogo / tokens / dark support |

### Todo

| ID | Item | Notes |
|----|------|-------|
| RC1-UI-8 | Mobile tool-panel pass | Layout constraints only — not new features |

### Review

| ID | Item | Notes |
|----|------|-------|
| RC1-UI-1 | Accent Identity | Awaiting sign-off · [UI_ACCENT_REPORT.md](../reports/UI_ACCENT_REPORT.md) · verified on existing `localhost:3000` |
| RC1-UI-2 | Focus States | Awaiting sign-off · [UI_FOCUS_REPORT.md](../reports/UI_FOCUS_REPORT.md) · composer + global token focus restored |
| RC1-UI-3 | Panel Skeletons | Awaiting sign-off · [UI_SKELETONS_REPORT.md](../reports/UI_SKELETONS_REPORT.md) · lazy `null` loaders replaced |
| RC1-UI-4 | Button/Input Primitives | Awaiting sign-off · [UI_COMPONENTS_REPORT.md](../reports/UI_COMPONENTS_REPORT.md) · shared Button + Input adopted on form/CTA surfaces |
| RC1-UI-5 | Empty + Error adoption | Awaiting sign-off · [UI_EMPTY_ERROR_REPORT.md](../reports/UI_EMPTY_ERROR_REPORT.md) · PremiumEmpty + ErrorState adopted across modules |
| RC1-UI-7 | Typography Consistency | Awaiting sign-off · [UI_TYPOGRAPHY_REPORT.md](../reports/UI_TYPOGRAPHY_REPORT.md) · arbitrary `text-[Npx]` cleared; Inter UI + SF brand |

### Blocked

| ID | Item | Blocker | Notes |
|----|------|---------|-------|
| — | — | — | — |

### Done

| ID | Item | Completed | Notes |
|----|------|-----------|-------|
| — | — | — | — |

---

## How to use

1. Keep exactly **one** **Current Task**.  
2. On completion: **Current Task** → **Review** (report + changelog) → **Done**; then promote the next **Todo**.  
3. Do **not** redesign spacing, layout, or motion outside the scoped task.  
4. Append a short note to [CHANGELOG.md](./CHANGELOG.md) when a task reaches **Done** (or lands in **Review** with a report).
