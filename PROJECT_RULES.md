# VANI AI — Project Engineering Rules

This document is the source of truth for how VANI AI is built, reviewed, and shipped.

**Product goal:** A production-ready AI platform with the reliability of the best assistants — and an original premium identity that feels like a macOS application, not a ChatGPT clone.

**Core principle:** Never break working functionality. Plan before multi-file changes. Prefer small, reversible steps.

**UI mandate:** Never generate average UI. Every screen must feel expensive.

---

## 1. Code Style

- Prefer clarity over cleverness. Code should be readable without comments explaining “what”; comments only for non-obvious “why”.
- Match the existing style of the file you are editing (quotes, indentation, import style).
- Frontend: TypeScript strictness preferred. Avoid `any` unless temporarily bridging incomplete types; mark temporary casts and remove them soon.
- Backend: ES modules (`import` / `export`). Keep handlers thin; put business logic in services.
- No dead code, unused imports, commented-out blocks, or leftover debug `console.log` in committed code (structured logging is fine).
- Do not leave TODOs that describe work you already completed.
- Error messages shown to users must be clear and calm. Internal errors may be more detailed in logs.
- Avoid over-engineering: no extra abstractions, wrappers, or config layers unless they solve a real, current problem.

---

## 2. Folder Structure

Keep the monorepo split clear:

```
vani-ai/
├── backend/
│   ├── server.js                 # App bootstrap only
│   ├── config/                   # DB, env, app config
│   ├── middleware/               # Auth, validation, rate limit
│   ├── routes/                   # Route definitions only
│   ├── controllers/              # HTTP request/response orchestration
│   ├── services/                 # AI, business logic, external APIs
│   ├── models/                   # Mongoose schemas
│   ├── tools/                    # Model-callable tools
│   ├── utils/                    # Pure helpers
│   └── keys/                     # Local credentials only (never commit)
└── frontend/
    ├── app/                      # Next.js App Router pages & API routes
    ├── components/               # UI components (by domain when needed)
    ├── hooks/                    # Client state & data hooks
    ├── lib/                      # Types, constants, utils, API clients
    └── public/                   # Static assets
```

**Rules:**
- Do not put business logic in routes or React page components when it belongs in services/hooks.
- Do not create new top-level folders without architectural reason.
- Empty folders that imply unfinished systems (e.g. middleware) should be implemented or removed intentionally — not left as noise.
- Large archives (`*.zip`), build output, and `node_modules` never belong in source control.

---

## 3. UI Principles — VANI Design Identity

### 3.1 Non-negotiable standard

**Never generate average UI.**

Every surface must look and feel like a **premium macOS application** — quiet confidence, optical precision, expensive materials. If a screen could be mistaken for a generic SaaS chat template or a ChatGPT clone, it fails review.

### 3.2 Inspiration (absorb spirit — do not copy layouts)

| Reference | Steal this feeling |
|---|---|
| **Apple Intelligence** | Soft luminosity, orb-like presence, calm intelligence, system-native polish |
| **Arc Browser** | Spatial chrome, floating panels, personality without clutter |
| **Linear** | Restraint, perfect spacing, crisp hierarchy, keyboard-era precision |
| **Raycast** | Command-palette focus, instant clarity, luminous controls |
| **Notion** | Editorial calm, readable density, thoughtful emptiness |
| **Perplexity** | Research elegance, answer-first clarity, modern AI warmth |

VANI must synthesize these into an **original identity**, not a collage of clones.

### 3.3 Visual language (required toolkit)

Use these materials consistently:

| Material | Rule |
|---|---|
| **Glassmorphism** | Translucent panels with real blur (`backdrop-filter`), subtle borders, inner highlights — not flat gray boxes with opacity faked in |
| **Floating elements** | Sidebar, header, composer sit in space — inset from edges, elevated with layered shadows, never edge-glued slabs |
| **Beautiful spacing** | Optical rhythm over grid stuffing. Generous padding, aligned columns, intentional emptiness. If it feels tight, open it |
| **Apple typography** | SF-class stack / system display feel: tight negative tracking on titles, comfortable reading size (~15px body), elegant hierarchy. No default “Inter everywhere” laziness for brand moments |
| **Perfect shadows** | Multi-stop soft shadows (ring + near + far). Soft, cool, atmospheric — never harsh drop-shadows or muddy black blobs |
| **Soft gradients** | Mesh / radial atmosphere behind glass. Quiet color bloom, not neon strips |
| **Blur** | Meaningful depth separation between layers (background mesh → glass → content). Blur supports hierarchy |
| **Elegant animations** | Apple easing (`cubic-bezier(0.25, 0.46, 0.45, 0.94)` / smooth spring). 2–3 intentional motions per interaction. Fade + slight rise, sidebar glide, typing pulse — no bounce spam |
| **Responsive layout** | Desktop = floating macOS workspace. Mobile = same materials, adapted chrome (drawer sidebar, full-width composer). No “desktop only” polish |

### 3.4 VANI original identity (brand signals)

- **Name as product:** “VANI” / “VANI AI” is a hero-level signal on empty states — not a tiny nav label that could belong to any app.
- **Signature light:** Cool Apple-blue primary (`#0071e3` / `#2997ff` dark) with restrained violet bloom — luminous, never carnival purple.
- **Signature form:** Large radii (20–28px panels, soft pills for controls), glass elevated shells, star/orb mark for intelligence presence.
- **Signature mood:** Quiet luxury. Sparse chrome. Answer space is sacred.
- **Signature motion:** Messages enter softly; composer feels magnetic; theme toggle and sidebar feel native.

**Anti-identity (forbidden):**
- ChatGPT clone layouts (centered narrow column + plain gray bubbles as the whole aesthetic)
- Generic AI purple-on-white landing tropes
- Terracotta / cream brochure looks
- Glow overload, neon borders, emoji decoration as design
- Dense dashboard chrome, stat strips, badge spam
- Fake features styled as live UI

### 3.5 Composition rules

- One primary composition per view. Chat is the product — not a control panel.
- One job per region: sidebar = nav/history; main = conversation; floating input = compose.
- Cards: default **no cards**. Glass panels are structural chrome; message “cards” only when they improve readability (assistant markdown / code).
- User bubbles may be luminous; assistant content should feel editorial on glass — not a muddy gray brick.
- Reduce clutter ruthlessly. Every control must earn its pixels.
- Dark and light modes are both first-class and must feel equally expensive.
- Never ship UI that implies a feature exists when it is not wired.

### 3.6 Quality bar (definition of done for UI)

A UI change is done only when:

1. It feels native to macOS / Apple Intelligence materials.
2. Spacing, type, shadow, and blur are deliberate — not defaults.
3. Motion is elegant and purposeful.
4. It works on desktop and mobile.
5. It is unmistakably **VANI**, not a generic chat UI.

---

## 4. Architecture Rules

- **Frontend owns presentation and session UX.** Next.js talks to the Express API for chat and persistence.
- **Backend owns AI orchestration, persistence, and authorization.** Gemini/Vertex credentials never ship to the browser.
- **Auth is end-to-end.** Client identity must come from a verified session/token, not a trusted email string in the request body.
- **Chat sessions are first-class.** Every conversation has a durable `chatId`. Sending a message without continuity must be an explicit “new chat” path, not an accident.
- Keep a clear request path:

  `UI → API route/controller → service (Gemini/DB) → response`

- Do not call Vertex/Gemini from the frontend.
- Do not duplicate DB connection logic in multiple places.
- Prefer streaming for assistant replies once implemented; keep a non-streaming fallback only if needed for reliability.
- Multi-file changes require a short plan first: what changes, why, and what must keep working.
- Backward-compatible API changes preferred. Breaking changes need a migration plan.

---

## 5. Component Rules

- Components are presentational by default. Data fetching and chat orchestration live in hooks (`useChat`, future `useSession`, etc.).
- Keep components focused. Split when a file mixes unrelated concerns (layout + API + markdown + auth).
- Shared primitives (buttons, glass panels, markdown) should be reusable; feature-specific UI stays near its domain (`components/chat/`).
- Props should be typed. Prefer explicit interfaces over inline sprawling prop types for public components.
- Do not pass secrets, service accounts, or privileged tokens into client components.
- Client components (`'use client'`) only when needed for interactivity, browser APIs, or hooks.
- Avoid premature `useMemo` / `useCallback` unless profiling or established repo patterns require it.
- Loading, empty, and error states are required for any user-facing async surface.

---

## 6. Performance Rules

- Do not block the UI on full-model completion once streaming exists; render tokens as they arrive.
- Keep chat list payloads lean (`_id`, `title`, timestamps). Load full messages only for the active chat.
- Avoid re-fetching the entire history on every keystroke or every token.
- Paginate or window long chat lists and very long threads when they grow large.
- Images/attachments (future) must be size-limited and lazily handled.
- Do not introduce heavy dependencies for trivial utilities.
- Measure before optimizing. Fix real bottlenecks (TTFB, stream start, re-renders), not hypothetical ones.

---

## 7. Git Rules

- Commit only when explicitly requested by the project owner.
- Never commit secrets: `.env`, `.env.local`, service-account JSON, API keys, OAuth client secrets, private keys.
- Never commit `node_modules`, `.next`, build artifacts, or large binary archives.
- Keep commits focused and reversible. Prefer small commits with clear intent over giant mixed dumps.
- Commit messages explain **why**, not a file laundry list.
- Do not use destructive git commands (`push --force` to main, hard reset of shared history) unless explicitly requested.
- Do not amend commits unless explicitly requested and safe (local, unpushed, created by you).
- Do not skip hooks unless explicitly requested.
- Root `.gitignore` must protect backend secrets, frontend env files, keys, and junk archives.

---

## 8. Naming Conventions

| Kind | Convention | Examples |
|---|---|---|
| React components | PascalCase | `ChatInput.tsx`, `TypingIndicator.tsx` |
| Hooks | `use` + camelCase | `useChat.ts`, `useTheme.ts` |
| Frontend libs/utils | camelCase file | `constants.ts`, `utils.ts` |
| Backend files | camelCase | `chatController.js`, `geminiService.js` |
| Routes | plural resources where natural | `/api/chats`, `/api/chat/:id` |
| Mongo models | PascalCase model names | `User`, `Chat` |
| Env vars | SCREAMING_SNAKE_CASE | `MONGODB_URI`, `GOOGLE_CLOUD_PROJECT` |
| CSS variables | kebab / established tokens | `--primary-glow`, theme tokens in `globals.css` |

- Boolean props/vars: `isLoading`, `isOpen`, `hasError`.
- Event handlers: `handleSendMessage`, `onToggleSidebar`.
- Avoid vague names: `data`, `temp`, `stuff`, `helper2`.

---

## 9. Security Rules

- **Never expose Vertex/Google service-account credentials to the client.**
- **Never trust client-supplied identity** (`userEmail`, `userId`) without server-side session verification.
- Validate and sanitize request bodies (message length, roles, chat ownership).
- Enforce chat ownership: users may only read/update/delete their own chats.
- Restrict CORS in production to known frontend origins. `origin: "*"` is local-dev only.
- Rate-limit chat generation endpoints.
- Do not log full prompts/responses containing sensitive user content in production without redaction policy.
- Keep `NEXTAUTH_SECRET`, OAuth secrets, and Mongo URIs out of source and out of client bundles.
- Remove dummy/admin fallback users from production paths.
- If a secret is ever committed, rotate it immediately and scrub history as needed.

---

## 10. AI Rules

- VANI AI is the product identity. System instructions must stay consistent: creator, tone, and safety.
- Model calls live only in backend services (e.g. `geminiService`).
- Prefer one clear system instruction source. Do not scatter conflicting prompts across controllers.
- Tool use (search, date/time, future tools) must be explicit, tested, and fail safely.
- Secret control tags (e.g. `[UPDATE_NAME: ...]`) must be stripped before sending content to the client.
- Do not invent capabilities in the system prompt that the product does not support.
- Persist only what is needed for continuity (messages, title, model, user ref). Do not store raw provider credentials.
- When adding models/tools, gate them behind server config — not hardcoded UI claims.
- Handle provider failures gracefully with user-safe errors; log provider details server-side.

---

## 11. Backend Rules

- Express app bootstrap in `server.js` should stay thin: middleware, routes, listen.
- Controllers orchestrate; services talk to Gemini/DB; models define schema only.
- Every mutating chat route must eventually require auth middleware.
- API responses should be consistent JSON shapes. Prefer `{ reply, chatId }` / `{ error }` patterns already in use unless versioning.
- Use environment variables for all infrastructure config. Fail fast on missing critical env in production.
- Do not leave unused dependencies (`openai` if unused) or duplicate connectors (`config/db.js` vs inline connect) without cleanup intent.
- Database indexes should support common queries (user + `updatedAt` for chat lists).
- Idempotency and race safety matter for rename/delete/send on the same chat.
- Local dummy user seeding is a development aid only — never a production auth substitute.

---

## 12. Frontend Rules

- Next.js App Router conventions apply. Read project Next.js docs under `node_modules/next/dist/docs/` when APIs may have changed.
- `lib/constants.ts` may hold non-secret defaults. **User identity must come from session**, not hardcoded email/name, once auth is enabled.
- `API_BASE_URL` must be environment-driven for deployable environments.
- Chat state belongs in hooks. Pages compose layout; they should not own raw `fetch` sprawl long-term.
- Sidebar history must reflect real backend data when history is enabled — no permanent fake lists in production UI.
- Markdown rendering must remain safe (no arbitrary HTML execution).
- Theme changes should persist (e.g. `localStorage`) without hydration flashes where possible.
- Auth UI (sign-in/out) must be wired through `AuthProvider` / NextAuth session, not parallel ad-hoc auth state.
- Accessibility: interactive controls need labels; keyboard send should work; focus management in the composer matters.

---

## 13. Deployment Rules

- Separate **development**, **staging**, and **production** configuration.
- Frontend and backend deploy as separate services unless explicitly unified later.
- Production must set: MongoDB URI, Vertex project/location/credentials, NextAuth URL/secret, Google OAuth client IDs, allowed CORS origins, API public URL.
- Prefer IAM + secret managers over checked-in JSON key files in production.
- Health checks: backend root/health endpoint must remain available for uptime monitoring.
- Do not deploy with open CORS, dummy users, or auth bypass flags enabled.
- Run production builds (`next build`, backend start) before release; fix build errors before merge.
- Logs, metrics, and error tracking should be added before public launch — not after the first incident.
- Database backups and restore drills are required before treating Mongo as source of truth for real users.

---

## Decision Discipline

Before changing multiple files:

1. State the goal.
2. List files/systems affected.
3. Explain why each change is required.
4. Call out what must keep working.
5. Get approval when the change is architectural or cross-cutting.
6. Implement in the smallest safe slice.
7. Verify the chat loop still works.

---

## Non-Goals (Unless Explicitly Approved)

- Rewriting the entire app for style only
- Adding multiple model providers before auth + session continuity are solid
- Fake premium features in the UI with no backend
- Storing credentials in the repo “just for convenience”

---

*Last updated: 2026-08-03*  
*Owner: VANI AI engineering*
