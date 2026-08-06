# VANI AI — UI Accent Identity Report

**Date:** 2026-08-06  
**Task:** RC1-UI-1 — Fix accent identity only  
**Source:** [UI_AUDIT_REPORT.md](./UI_AUDIT_REPORT.md) (C-1 / C-2)  
**Status:** Verification passed (existing `localhost:3000`) · Review  
**Board:** [UI_POLISH_BOARD.md](../management/UI_POLISH_BOARD.md)

## Objective

Use design tokens (`--accent` and related) as the single source of truth. Remove hardcoded Apple-blue / indigo accent colors so Research, Voice, Browser, Code Interpreter, Analytics, and all other modules share one identity.

**Non-goals (unchanged):** redesign, spacing, layout, animations, typography.

## Token source of truth

From `frontend/app/globals.css`:

| Token | Role |
|-------|------|
| `--accent` (`#6b5cff`) | Primary brand / CTA fill |
| `--accent-hover` | Hover |
| `--accent-pressed` | Pressed / gradient end |
| `--accent-muted` / `--accent-soft` / `--accent-glow` | Soft fills & glows |
| `--text-on-accent` | Text on accent fills |
| Tailwind bridges | `bg-accent`, `text-accent`, `bg-accent-muted`, `hover:bg-accent-hover`, `ring-accent/*`, `from-accent`, `to-accent-hover`, `accent-accent` |

## Changes

### Removed Apple blue / indigo hardcodes
Replaced `#0071e3`, `#0077ed`, `#2997ff`, `#0A84FF`, `#0056D6`, `#007AFF`, `#5856D6`, `#4aa6ff`, `#5ac8ff`, `indigo-400`, and blue glow `rgba(0,113,227…)` / `rgba(0,122,255…)` with token classes / `var(--accent*)`.

### Modules updated

| Area | Files |
|------|-------|
| Voice | `VoiceControls.tsx`, `VoiceWaveform.tsx`, `FloatingVoiceOrb.tsx`, `VoiceOverlay.tsx` |
| Research | `ResearchPanel.tsx`, `ResearchTimeline.tsx`, `ResearchModeToggles.tsx`, `SourceList.tsx` |
| Browser | `BrowserPanel.tsx`, `BrowserPermissionDialog.tsx` |
| Code Interpreter | `CodeInterpreterPanel.tsx`, `hooks/useCodeInterpreter.ts` (sample plot color aligned to token hex) |
| Analytics | `AnalyticsPanel.tsx`, `UsageChart.tsx` |
| Agents | `ExecutionTimeline.tsx` |
| Memory / MCP | `MemoryManager.tsx`, `McpSettings.tsx` |
| Share / Auth | `share/[shareId]/page.tsx`, `UserAvatar.tsx`, `AuthGate.tsx` |
| Brand | `VaniLogo.tsx`, `VaniOrb.tsx` |
| Chrome CTAs | `ChatInput.tsx`, `Sidebar.tsx`, `ConfirmDialog.tsx`, `AiDashboard.tsx`, `AutomationWorkspace.tsx` |
| Artifacts sample CSS | `lib/artifactPreview.ts` → `background: var(--accent)` |

### Also cleaned
Component shadows that duplicated accent RGB as `rgba(107,92,255,…)` now use `var(--accent-glow)` / `var(--accent-muted)` / `var(--accent-soft)`.

## Verification

### Static
```bash
rg -n '#0071e3|#0077ed|#2997ff|#0A84FF|#0056D6|#0071E3|#007AFF|#5856D6|#4aa6ff|#5ac8ff|indigo-400|rgba\(0,\s*113,\s*227|rgba\(0,\s*122,\s*255' frontend --glob '*.{tsx,ts,css}'
```
**Result:** no matches in component/app TS/TSX/CSS (token definitions in `globals.css` remain the sole hex source).

### Visual (browser)
1. `http://localhost:3000/` — New Chat CTA, active nav, user avatar, home orb: **purple accent** (not Apple blue).
2. Computed tokens on document: `--accent: #6b5cff`, `--accent-hover: #5b4ae8`, `--accent-pressed: #4a3ad4`.
3. `http://localhost:3000/share/accent-verify-demo` — header mark gradient resolves to `rgb(107, 92, 255) → rgb(91, 74, 232) → rgb(74, 58, 212)` (accent family). DOM check for Apple-blue hexes: **false**.

## Remaining notes

| Note | Severity |
|------|----------|
| `PROJECT_RULES.md` still mentions Apple-blue primary in §3.4 while tokens are purple — docs drift only; runtime UI follows tokens. | Doc follow-up |
| Neutral hexes (surfaces, code editor `#0d1117`, syntax `sky-300`) intentionally retained — not brand accents. | OK |
| Matplotlib sample string uses `#6b5cff` (token value) because Python cannot reference CSS vars. | Acceptable |

## Outcome

**Accent identity is unified on design tokens.** Research, Voice, Browser, Code Interpreter, Analytics, Agents, Memory, MCP, Share, and core chrome no longer ship a second Apple-blue brand.
