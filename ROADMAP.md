# VANI AI — Roadmap

> Long-term product and ops **milestones** only.  
> This is not the active sprint backlog.  
> **Current development work** lives exclusively in [docs/management/SPRINT_BOARD.md](./docs/management/SPRINT_BOARD.md).  
> As-built inventory: [CURRENT_STATUS.md](./CURRENT_STATUS.md).

---

## 1. Principles

1. **VANI AI v1 is a consumer AI product** — prioritize individual assistant experience (chat, research, voice, memory, tools).  
2. **Business / Enterprise feature development is paused** for v1. Keep existing backend Business APIs intact; do not ship Teams / Org Admin / Shared Projects / Enterprise Dashboard / Seat Management UI.  
3. Keep chat streaming, auth, and billing enforcement stable.  
4. Ops readiness (`LAUNCH_CHECKLIST.md`) remains parallel to product milestones.

---

## 2. Milestones

### M0 — Consumer AI experience (v1 active)

Primary milestone for current sprints:

- Deep Research quality and reliability  
- Chat, voice, memory, canvas, and tool polish for individual users  
- Consumer-plan metering/entitlement integrity where it affects Free/Pro users  

Execution status: [SPRINT_BOARD.md](./docs/management/SPRINT_BOARD.md).

### M1 — Business collaboration foundation (**paused**)

Durable multi-user Business surfaces — **paused for v1**. Backend already landed for Teams list/create/get and Org Admin overview/members/settings; further work deferred:

- ~~Teams invites / roles / UI~~ — paused  
- ~~Org Admin invites / audit / UI~~ — paused  
- ~~Shared project collaboration~~ — paused  
- ~~Enterprise dashboard / seat management~~ — paused  

Do not schedule these on the sprint board until Business/Enterprise development is explicitly resumed.

### M2 — Metering & entitlement integrity

Close quota/enforcement gaps before heavily marketing limits (see `FEATURE_GATING_REPORT.md`):

- Per-tool MCP metering  
- Canvas AI-edit monthly meter  
- Voice minute precision  
- Project file storage quota enforcement  
- Sidebar entitlement prefetch  
- Enterprise per-org custom quota overrides (**paused** with M1 / Enterprise)

Consumer-relevant items above may be pulled into sprints; Enterprise-only overrides stay paused.

### M3 — Platform cohesion

- Resolve / document `Chat` vs `ChatV2` persistence strategy  
- Align incidental docs (e.g. frontend README) with product context as needed  
- Reduce JS/TS fragmentation opportunistically when touching modules (no big-bang rewrite)

### M4 — Production launch readiness

Operational gates from `LAUNCH_CHECKLIST.md` (independent of feature milestones):

- Release tagging / Sentry alignment  
- CI green on release candidates  
- Mongo + uploads backups  
- Staging smoke (`/health`, `/ready`, sign-in, one chat)  
- Production secrets via secret manager (never commit `.env`)

---

## 3. Already delivered (do not re-milestone as greenfield)

- Streaming chat, stop / regenerate / continue  
- Multi-provider routing + tool orchestration  
- Image generation/editing  
- Voice (classic + Live)  
- Memory, projects/RAG, canvas, deep research  
- Agents, browser automation, MCP, code interpreter  
- PDF/OCR/document understanding  
- Stripe + Razorpay billing foundation + feature gating  
- Analytics (including platform admin analytics)  
- Share chat + export  
- Docker Compose + CI pipeline  
- Teams API list/create/get + owner membership (Business backend; UI paused)  
- Org Admin API overview/members/settings + seats (Business backend; UI paused)

Historical detail: root `*_REPORT.md` files and `docs/reports/`.

---

## 4. How this relates to the sprint

| Document | Role |
|----------|------|
| **This file (`ROADMAP.md`)** | Long-term milestones and sequencing intent |
| **[SPRINT_BOARD.md](./docs/management/SPRINT_BOARD.md)** | **Only** source of truth for the current sprint’s tasks and status |

Do **not** copy every milestone item into the sprint. Pull a small slice into the sprint board when scheduled.

---

## 5. Out of scope for this document

- Sprint task status, owners, or WIP limits (use the sprint board)  
- Inventing new product pillars not evidenced by code or existing reports  
- Migration plans (unless separately requested)  
- Binding calendars or commitment dates  

---

*Revise when a milestone is completed, paused, or resumed. Execution status always belongs on the sprint board.*
