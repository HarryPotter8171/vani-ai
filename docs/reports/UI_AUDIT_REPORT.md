# VANI AI — UI Audit Report

**Date:** 2026-08-06  
**Role:** Senior Product Designer + QA Engineer  
**Scope:** Complete frontend UI audit (read-only; no code changes)  
**Product standard:** [PROJECT_RULES.md](../../PROJECT_RULES.md) §3 (premium macOS-class identity) + VANI Design Language in `frontend/app/globals.css`

---

## Executive summary

VANI has a **strong visual foundation** (semantic tokens, glass materials, Lucide icons, motion presets, dark/light themes, keyboard-first tooling). The product is delivered almost entirely as a **single authenticated shell** (`/`) with feature **panels/overlays**, plus a public **share** route.

The UI does **not** fully meet its own “every screen must feel expensive” bar yet. The biggest gaps are **brand/color identity conflict** (design tokens say purple; many feature CTAs hardcode Apple blue), **missing shared Button/Input primitives**, **uneven empty/error/loading patterns** across feature panels, and **accessibility regressions** where `outline-none` removes focus rings on critical controls (notably the composer).

| | |
|--|--|
| **UI score** | **6.8 / 10** |
| **Critical issues** | 3 |
| **Major issues** | 12 |
| **Minor issues** | 18 |
| **Recommendation** | Polish pass focused on identity consistency, shared primitives, panel state patterns, and focus a11y — **before** any redesign or new features |

---

## Method

1. Inventory all user-facing routes and panel surfaces under `frontend/app` + `frontend/components`.
2. Compare implementation against `PROJECT_RULES.md` UI principles and `globals.css` design language.
3. Spot-check spacing, typography, icons, colors, states, motion, responsiveness, accessibility, keyboard shortcuts, and focus.
4. Classify every issue: **Critical** (breaks trust, a11y, or identity at product scale) · **Major** (clear polish/consistency debt users feel) · **Minor** (nits / cleanup).

**Out of scope:** Backend APIs, new features, visual redesign proposals beyond identifying gaps.

---

## Screen inventory

| Screen / surface | Entry | Notes |
|------------------|-------|-------|
| Auth / sign-in | `AuthGate.tsx` | Splash + Google sign-in + backend reconnect banner |
| Main chat shell | `app/page.tsx` | Mega-orchestrator (~2.3k lines) |
| Empty home | `DynamicHome` via `EmptyState` | Brand orb + greeting |
| Conversation | `Message`, `VirtualizedMessageList`, `MarkdownContent` | Streaming + actions |
| Composer | `ChatInput`, attachments, plus menu | Drag/drop, voice, model/agent |
| Sidebar | `Sidebar` + history/search/nav | Desktop rail / mobile drawer |
| Settings / Billing | `BillingSettings` modal | Appearance, AI, memory, profile, billing, about |
| Memory | `MemoryManager` modal | List / edit memories |
| MCP | `McpSettings` modal | Server registry |
| Analytics / Admin / AI Dashboard | Panel modals | Gated |
| Canvas | `CanvasPanel` | Side panel |
| Artifacts | `ArtifactPanel` | Side panel |
| Deep Research | `ResearchPanel` + toggles | Side panel |
| Browser | `BrowserPanel` + permission dialog | Side panel |
| Code Interpreter | `CodeInterpreterPanel` | Side panel |
| Voice | Overlay + floating orb/mic | Full-screen mode |
| Agents | Selector + status + timeline | Inline / panel |
| Projects workspace | Files / Tasks / Automation / Context | Tabs in shell |
| Share (public) | `/share/[shareId]` | Read-only conversation |
| App errors | `error.tsx`, `global-error.tsx` | Segment vs root crash |

---

## Scorecard (dimension scores)

| Dimension | Score | Notes |
|-----------|------:|-------|
| Spacing & layout rhythm | 7.0 | Chat column + glass chrome feel intentional; panels denser / less optical |
| Typography | 6.5 | Scale tokens exist; Inter + pervasive `text-[13.5px]` undercuts Apple/SF mandate |
| Icon consistency | 8.0 | Lucide stroke language is coherent; brand mark inconsistently substituted |
| Color & identity | 5.5 | Token accent ≠ hard-coded Apple blue across many features |
| Loading states | 6.0 | Good skeletons in chat/history; lazy panels load with `null` |
| Empty states | 6.0 | `PremiumEmpty` excellent but underused |
| Error states | 6.0 | `ErrorState` excellent but underused; many inline rose strings |
| Animations | 7.5 | Shared motion presets + reduced-motion CSS; some FM still runs |
| Responsiveness | 6.5 | Mobile drawer/composer solid; large feature panels desktop-first |
| Accessibility | 6.0 | Labels & shortcuts present; focus rings stripped in places |
| Keyboard shortcuts | 7.5 | ⌘K / ⌘/ / Esc / voice / new chat — Mac-labeled |
| Focus states | 5.5 | Global `:focus-visible` good; composer/editors often `outline-none` |
| **Overall** | **6.8** | Foundation strong; consistency & a11y hold it below “premium ship” |

---

## Findings by category

### 1. Spacing

| ID | Severity | Issue | Evidence |
|----|----------|-------|----------|
| S-1 | Major | Design spacing tokens (`--space-*`) are defined but most UI uses ad-hoc Tailwind (`gap-2.5`, `py-3.5`, `px-5`) — rhythm drifts between chat and settings/feature panels. | `globals.css` vs component classNames |
| S-2 | Minor | Feature modals (Memory, MCP, Billing) use similar glass shells but different header paddings / icon box sizes. | `MemoryManager.tsx`, `McpSettings.tsx`, `BillingSettings.tsx` |
| S-3 | Minor | Share page max-width `760px` vs chat `--chat-column-max: 800px` — subtle misalignment of product reading measure. | `share/[shareId]/page.tsx`, `globals.css` |

### 2. Typography

| ID | Severity | Issue | Evidence |
|----|----------|-------|----------|
| T-1 | Major | Product rules call for SF-class / Apple display feel; app loads **Inter** as the primary font variable. Brand moments feel more “SaaS Inter” than system-native. | `layout.tsx` (`next/font/google` Inter); `PROJECT_RULES.md` §3.3 |
| T-2 | Major | Arbitrary sizes (`text-[13.5px]`, `text-[12.5px]`, `text-[10.5px]`) dominate instead of `--text-body` / `--text-caption` / type utilities. | Widespread; e.g. share header, ErrorState, Analytics CTAs |
| T-3 | Minor | Display home greeting overrides `type-display` with `text-[28px] sm:text-[34px]` — fine optically, but bypasses token scale. | `DynamicHome.tsx` |

### 3. Icon consistency

| ID | Severity | Issue | Evidence |
|----|----------|-------|----------|
| I-1 | Minor | Lucide is the sole icon set (good). Stroke widths mostly 1.75–2.25 — coherent. | ~65 Lucide imports |
| I-2 | Major | Public share header uses **Sparkles + blue gradient square** instead of `VaniLogo` / brand orb — fails brand test on a public surface. | `share/[shareId]/page.tsx` |
| I-3 | Minor | Markdown code blocks use hardcoded macOS traffic-light dots — cute, but a separate visual dialect from Lucide chrome. | `MarkdownContent.tsx` |

### 4. Colors / brand identity

| ID | Severity | Issue | Evidence |
|----|----------|-------|----------|
| C-1 | **Critical** | **Identity conflict:** `globals.css` documents accent `#6b5cff` and says “never replace with blue”; `PROJECT_RULES.md` mandates Apple-blue primary. Implementation hardcodes `#0071e3` / `#2997ff` / `#0A84FF` across Research, Voice, Browser, Code Interpreter, Analytics, Agents, Memory/MCP headers. Product reads as two brands. | `globals.css` L37–38; blue hardcodes in 15+ components |
| C-2 | Major | Voice waveform / orb use Tailwind `indigo-400` — third accent family. | `VoiceWaveform.tsx`, `FloatingVoiceOrb.tsx`, `VoiceOverlay.tsx` |
| C-3 | Major | Light theme warm cream (`#f2f0eb`) is close to a brochure look the user rules warn against; needs intentional pairing with accent, not default “AI cream”. | `globals.css` `html.light` |
| C-4 | Minor | Confirm danger and some errors use raw hex (`#ff3b30`) beside `--danger` token. | `ConfirmDialog.tsx` |
| C-5 | Minor | `global-error.tsx` is always light Apple gray — ignores dark default and design tokens. | `app/global-error.tsx` |

### 5. Loading states

| ID | Severity | Issue | Evidence |
|----|----------|-------|----------|
| L-1 | **Critical** | Lazy feature panels use `loading: () => null` — opening Canvas / Research / Billing / etc. can show **blank nothing** until the chunk loads. | `components/lazy/FeaturePanels.tsx` |
| L-2 | Major | Chat history and conversation skeletons are high quality; most feature panels use only a small Spinner or no skeleton chrome. | `ConversationSkeleton`, `ChatHistorySection` vs CI/Browser/Canvas |
| L-3 | Minor | Auth splash is capped (good) but label uses arbitrary `text-[14px]`. | `AuthGate.tsx` |

### 6. Empty states

| ID | Severity | Issue | Evidence |
|----|----------|-------|----------|
| E-1 | Major | Shared `PremiumEmpty` is used well for chat history; Memory / MCP / Billing / Browser / CI use one-off “No X yet” copy with inconsistent icon treatment. | `PremiumEmpty.tsx` vs panel inlines |
| E-2 | Minor | Dynamic home is strong brand-first empty chat — meets “VANI as hero” better than most panels. | `DynamicHome.tsx` |

### 7. Error states

| ID | Severity | Issue | Evidence |
|----|----------|-------|----------|
| R-1 | Major | Shared `ErrorState` (role=alert, retry, motion) is underused; feature failures often toast or raw red text. | `ErrorState.tsx`; Memory/MCP/Research/Browser |
| R-2 | Major | Root `global-error` is off-brand and light-only — worst moment in the product (crash) looks cheapest. | `global-error.tsx` |
| R-3 | Minor | Share page error is decent but doesn’t reuse `ErrorState`. | `share/[shareId]/page.tsx` |
| R-4 | Minor | Segment `error.tsx` correctly uses `ErrorState` — good pattern to propagate. | `app/error.tsx` |

### 8. Animations

| ID | Severity | Issue | Evidence |
|----|----------|-------|----------|
| A-1 | Minor | Motion system is mature (`lib/motion.ts`, CSS durations, `data-motion`, `prefers-reduced-motion`). | `globals.css`, `lib/motion.ts` |
| A-2 | Major | Framer Motion JS animations may still execute when CSS reduced-motion zeros durations — incomplete a11y coverage for vestibular users. | FM across ~50 components vs CSS reduce block |
| A-3 | Minor | Some panels animate multiple competing entrances (header bloom + list + CTA) — slightly noisy vs Linear restraint. | Memory/MCP header blurs |

### 9. Responsiveness

| ID | Severity | Issue | Evidence |
|----|----------|-------|----------|
| P-1 | Major | Desktop-first side panels (Canvas, Browser, Code Interpreter, Admin) are awkward on small viewports; chat shell adapts better than tools. | `page.tsx` panel layout; `useIsDesktop` 768px |
| P-2 | Minor | Header hamburger uses 44×44 mobile targets — good. | `Header.tsx` |
| P-3 | Minor | Safe-area + `100dvh` / visual viewport handling show mobile care for composer. | `layout.tsx` viewport; `page.tsx` |
| P-4 | Minor | Message action sheet exists for mobile — good progressive disclosure. | `MessageActionSheet.tsx` |

### 10. Accessibility

| ID | Severity | Issue | Evidence |
|----|----------|-------|----------|
| X-1 | **Critical** | Composer textarea uses `outline-none` + `focus-visible:shadow-none` — primary input can lose visible keyboard focus. | `ChatInput.tsx` |
| X-2 | Major | Widespread `outline-none` / `focus:outline-none` (~20+ files) without consistent custom focus rings. | Sidebar, MessageActions, Voice, editors, Switch, etc. |
| X-3 | Major | Icon-only controls often have `aria-label` (good), but form fields in settings/MCP lack a consistent label/description pattern. | Billing / MCP forms |
| X-4 | Minor | Few landmark/`main`/`nav` roles on the mega-shell; share page has `<main>` (good). | `page.tsx` vs share |
| X-5 | Minor | Shortcut sheet glyphs are Mac `⌘` only; handlers support Ctrl — Windows/Linux users get confusing help UI. | `KeyboardShortcuts.tsx` |

### 11. Keyboard shortcuts

| ID | Severity | Issue | Evidence |
|----|----------|-------|----------|
| K-1 | Minor | Strong set: ⌘K palette, ⌘/, ⌘⇧O, ⌘⇧V, Esc, lightbox zoom, CI run. | `KeyboardShortcuts.tsx`, `CommandPalette.tsx` |
| K-2 | Minor | Shortcut list incomplete vs real app (e.g. sidebar search, regenerate, theme) — discoverability gap. | `DEFAULT_SHORTCUTS` |
| K-3 | Minor | Duplicate new-chat binding paths (provider + Sidebar) — works, but risk of double-fire. | `KeyboardShortcuts` + `Sidebar` |

### 12. Focus states

| ID | Severity | Issue | Evidence |
|----|----------|-------|----------|
| F-1 | Major | Global `:focus-visible` in CSS is well designed; components often neutralize it. | `globals.css` L633+ vs `outline-none` usage |
| F-2 | Minor | ConfirmDialog focuses confirm action — good modal pattern. | `ConfirmDialog.tsx` |
| F-3 | Minor | Dropdown/ContextMenu keyboard nav present — good. | `Dropdown.tsx`, `ContextMenu.tsx` |

### 13. Component system / craft debt (cross-cutting)

| ID | Severity | Issue | Evidence |
|----|----------|-------|----------|
| D-1 | Major | No shared **Button** or **Input** primitive — CTAs differ in height, radius, hover, disabled opacity across Billing / Analytics / CI / Research. | Missing `components/ui/Button.tsx` |
| D-2 | Major | No generic **Modal** shell — each feature reinvent floating chrome (blur, Esc, focus trap uneven). | Per-feature fixed overlays |
| D-3 | Major | Monolithic `page.tsx` + large `Sidebar.tsx` make visual QA and regression control expensive (product risk, not a pixel bug). | ~3.6k lines combined |
| D-4 | Minor | Next starter SVGs remain in `public/` — noise for brand polish. | `public/next.svg`, `vercel.svg`, etc. |
| D-5 | Minor | Tailwind still lists `./pages/**` though App Router only. | `tailwind.config.ts` |

---

## Screen-by-screen notes

### Auth / AuthGate
- Calm brand splash with mesh + logo — strong first impression.
- Backend reconnect banner is clear; button styling is generic (no shared Button).
- **Minor:** Console noise in auth flow (dev clutter risk in production).

### Empty home (DynamicHome)
- Brand-first (orb + “VANI” + greeting) — passes brand test better than share/settings headers.
- Motion is restrained and premium.
- Suggestion/productivity wiring via props appears underused in the hero itself (props accepted but largely unused in render) — **Minor** dead API surface for home.

### Chat conversation
- Assistant editorial + user bubbles generally match glass identity.
- Typing / streaming indicators exist.
- Message actions dense; mobile sheet helps.
- **Major:** Action buttons heavy on `outline-none`.

### Composer
- Feature-rich (attachments, plus menu, model/agent, voice).
- Progress / cancel / retry on attachments are thoughtful.
- **Critical:** Focus ring suppression on textarea.
- Attachment chips use Spinner well.

### Sidebar
- History loading/empty/error is the **best state pattern** in the app (`Skeleton` + `PremiumEmpty` + `ErrorState`).
- Search panel and nav sections are dense but usable.
- Mobile drawer behavior present.

### Settings / Billing / Appearance
- Comprehensive sections; Spinner on async actions.
- Visual language close to Memory/MCP but CTA blues/purples mixed.
- Invoice empty is plain text — should use `PremiumEmpty`.

### Memory / MCP
- Near-duplicate header treatment with Apple-blue icon tiles — reinforces identity split.
- Empty/error are inline, not shared primitives.

### Research / Browser / Code Interpreter / Agents
- Functional timelines and status UI.
- Progress bars and active states hardcode Apple blue.
- Empty/error copy is utilitarian, not premium.

### Canvas / Artifacts
- Editor-heavy; Spinner in preview.
- ErrorBoundary scoped to artifacts only — good local pattern, not app-wide.

### Voice
- Distinct indigo/blue dialect; high motion.
- Floating controls have aria-labels.
- Risk of glow/over-animation vs “quiet luxury” mandate.

### Share (public)
- Clean read-only layout and loading skeleton.
- **Major:** Brand mark drift (Sparkles + blue).
- Error/CTA don’t use shared ErrorState / VaniLogo.

### Global / segment errors
- Segment error: good (`ErrorState`).
- Global error: **Major** off-brand light crash screen.

---

## Severity rollup

### Critical (3)
1. **C-1** — Purple token system vs Apple-blue hardcodes (identity split).  
2. **L-1** — Lazy panels with blank (`null`) loading.  
3. **X-1** — Composer focus visibility removed.

### Major (12)
S-1, T-1, T-2, I-2, C-2, C-3, L-2, E-1, R-1, R-2, A-2, P-1, X-2, X-3, F-1, D-1, D-2, D-3  

*(Counted as 12 thematic majors; some IDs above are grouped in recommendation workstreams.)*

### Minor (18)
S-2, S-3, T-3, I-1, I-3, C-4, C-5, L-3, E-2, R-3, R-4, A-1, A-3, P-2, P-3, P-4, X-4, X-5, K-1–K-3, F-2, F-3, D-4, D-5, Auth console noise, DynamicHome unused props.

---

## What is working well (keep)

- Semantic token architecture + dark/light + appearance knobs (`radius`, `motion`, `density`, `glass`, `wallpaper`).
- Glass / mesh / shadow vocabulary when followed.
- Lucide-only icon set.
- Shared motion presets and many soft entrances.
- Chat history state trilogy (skeleton / empty / error).
- Keyboard palette + shortcuts sheet + Esc dismiss patterns.
- Mobile safe-area, 44px menu target, composer viewport awareness.
- Attachment upload UX (progress, analyzing, cancel, retry).
- Brand orb on empty home.

---

## Recommended polish order (no redesign)

1. **Resolve accent identity** (pick purple *or* Apple blue; kill hardcodes; update tokens + PROJECT_RULES to match).  
2. **Restore focus rings** on composer and neutralize `outline-none` without replacement.  
3. **Replace lazy `loading: null`** with panel shell skeleton.  
4. **Introduce Button + Input (+ Modal shell)** and migrate CTAs/forms.  
5. **Adopt PremiumEmpty + ErrorState** in Memory, MCP, Billing, Research, Browser, CI, Share.  
6. **Brand-align share + global-error** with VaniLogo / tokens / dark support.  
7. **Typography pass:** prefer token scale; reconsider Inter vs SF stack for brand moments.  
8. **Mobile pass** on tool panels only (layout constraints, not new features).

---

## Production readiness (UI)

| Question | Answer |
|----------|--------|
| Can v1 ship chat chrome? | Yes, with known polish debt |
| Does UI meet “expensive macOS” mandate everywhere? | **No** — strong core, uneven satellites |
| Blockers before calling UI “done”? | Identity conflict, composer focus, blank lazy loads |
| **UI score** | **6.8 / 10** |

---

## Appendix A — Key files reviewed

- `frontend/app/{layout,page,globals.css,error,global-error}.tsx`
- `frontend/app/share/[shareId]/page.tsx`
- `frontend/components/{AuthGate,Header,Sidebar,ChatInput,Message}.tsx`
- `frontend/components/ui/{ErrorState,PremiumEmpty,Skeleton,Spinner,KeyboardShortcuts,CommandPalette,ConfirmDialog,Toast}.tsx`
- `frontend/components/lazy/FeaturePanels.tsx`
- `frontend/components/{home,chat,voice,research,browser,canvas,codeInterpreter,memory,settings,analytics,agents,workspace}/*`
- `frontend/lib/motion.ts`, `PROJECT_RULES.md` §3

## Appendix B — Classification legend

| Severity | Meaning |
|----------|---------|
| **Critical** | Breaks brand trust at scale, blocks keyboard a11y on primary path, or ships blank/broken UI moments |
| **Major** | Clear consistency or usability debt users notice; violates stated design rules |
| **Minor** | Polish nits, cleanup, incomplete help text, low-impact drift |

---

*Audit only — no code was modified.*
