# VANI AI — Coding Standards

> Practical coding standards for this repository.  
> **Authoritative product/UI/git rules:** [PROJECT_RULES.md](./PROJECT_RULES.md).  
> This file summarizes conventions observed in the codebase and pointed to by PROJECT_RULES. Prefer PROJECT_RULES on conflict for UI identity and shipping rules.

---

## 1. Languages & modules

| Area | Standard |
|------|----------|
| Frontend | TypeScript preferred; React function components; `'use client'` only when needed |
| Backend | ES modules (`import` / `export`); predominantly JavaScript services with TypeScript in providers, router, billing, browser, MCP, code interpreter |
| Package managers | npm; each of `frontend/`, `backend/`, and root e2e has its own lockfile |

Do not introduce a second package manager or a root workspace rewrite without an explicit decision.

---

## 2. Style

From PROJECT_RULES and prevailing code:

- Clarity over cleverness; comments explain **why**, not what.  
- Match the file you edit (quotes, indentation, import style).  
- Avoid `any` on the frontend except temporary bridges; remove soon.  
- No dead code, unused imports, or leftover debug `console.log` in committed code (structured Pino logging on the backend is fine).  
- Do not leave TODOs describing work already completed.  
- User-facing errors: clear and calm; internal detail in logs.  
- Avoid over-engineering: no extra abstractions unless they solve a current problem.

---

## 3. Layering

### Backend

```
routes → controllers → services → models / providers / tools
```

- Routes: mount paths and middleware only.  
- Controllers: HTTP orchestration.  
- Services: AI, business logic, external APIs.  
- Do not put Gemini/Vertex calls in the frontend.  
- Do not duplicate DB connection logic outside the established boot path (`server.js` / mongoose connect).

### Frontend

```
app pages / layout → hooks (data & orchestration) → components (UI)
```

- Chat orchestration: `useChat` (and related hooks), not ad-hoc fetch in every leaf.  
- Shared primitives reusable; domain UI under `components/<domain>/`.  
- Props typed; loading / empty / error states required for async surfaces.

---

## 4. Naming

| Kind | Convention | Examples |
|------|------------|----------|
| React components | PascalCase | `ChatInput.tsx`, `TypingIndicator.tsx` |
| Hooks | `use` + camelCase | `useChat.ts` |
| Frontend libs | camelCase files | `apiClient.ts`, `utils.ts` |
| Backend files | camelCase | `chatController.js`, `geminiService.js` |
| Env vars | SCREAMING_SNAKE | See `.env.example` files |

---

## 5. API & streaming

- Prefer **SSE** for assistant replies (`text/event-stream`); client uses fetch + readable stream (not EventSource for chat).  
- Support abort/stop via `AbortController`; backend must stop work when the response closes.  
- Backward-compatible API changes preferred; breaking changes need an explicit migration plan (do not invent migrations here).  
- Auth: Bearer JWT from NextAuth bridge; never trust raw email fields from the client body for identity.

---

## 6. UI standards (summary)

Full rules: PROJECT_RULES §3.

- Premium macOS-like materials (glass, spacing, motion) — not a ChatGPT clone aesthetic.  
- Chat is the product; avoid dense dashboard chrome.  
- Dark and light are both first-class.  
- **Never ship UI that implies a feature exists when it is not wired** (especially Teams/Admin stubs).  
- Mobile and desktop both required for chat chrome.

---

## 7. Testing

| Layer | Tooling |
|-------|---------|
| Backend | Vitest; scripts for unit / integration / security / performance / `test:ci` |
| Frontend | Vitest + Testing Library |
| E2E | Playwright at repo root |

When changing chat, auth, billing, or streaming: prefer adding or updating tests near existing suites (`backend/tests/`, `frontend/tests/`).

---

## 8. Security & secrets

- Never commit `.env`, `.env.local`, service-account JSON, OAuth secrets, or `backend/keys/` material.  
- Use `.env.example` as the key catalog only.  
- CORS allowlist only; credentials enabled as configured.  
- Feature flags that disable gating (`FEATURE_GATING_DISABLED`) are emergency-only.

---

## 9. Git

From PROJECT_RULES §7:

- Commit only when the owner requests it.  
- No secrets or build artifacts in commits.  
- Small, focused commits; messages explain **why**.  
- No force-push to main / hard resets of shared history unless explicitly requested.  
- Do not skip hooks unless explicitly requested.

---

## 10. Performance

- Stream tokens; do not block the UI on full completion.  
- Keep chat list payloads lean; load full threads for the active chat only.  
- Virtualize or window very long threads when the existing virtualized list applies.  
- Measure before micro-optimizing.  
- Avoid heavy dependencies for trivial helpers.

---

## 11. When editing near stubs

- Expanding Teams or Org Admin further (invites, UI) requires real flows — do not fake success in the UI.  
- Prefer updating [CURRENT_STATUS.md](./CURRENT_STATUS.md) and [docs/management/SPRINT_BOARD.md](./docs/management/SPRINT_BOARD.md) when stub → real transitions happen; keep [ROADMAP.md](./ROADMAP.md) at milestone level.

---

## 12. Relationship to other docs

| Doc | Use for |
|-----|---------|
| `PROJECT_RULES.md` | Full UI identity, architecture rules, component/git rules |
| `ARCHITECTURE.md` | System diagram and module map |
| `CODING_STANDARDS.md` (this file) | Day-to-day coding conventions checklist |
| `ROADMAP.md` | Long-term milestones |
| `docs/management/SPRINT_BOARD.md` | Current sprint tasks / status |
| Root `*_REPORT.md` | Historical feature context — not coding law |

---

*Keep this file short. Put durable product law in PROJECT_RULES; put system structure in ARCHITECTURE.*
