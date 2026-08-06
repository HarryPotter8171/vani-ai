# VANI AI — Architecture & Product Decisions

> Lightweight decision log (ADR-style). Record choices that affect architecture, product scope, or ops — not routine implementation detail.  
> Companion: [ARCHITECTURE.md](../../ARCHITECTURE.md), [PROJECT_RULES.md](../../PROJECT_RULES.md), [CHANGELOG.md](./CHANGELOG.md).

---

## Template

Copy for each new decision:

```markdown
### ADR-NNN — Title

- **Date:** YYYY-MM-DD
- **Status:** Proposed | Accepted | Superseded | Deprecated
- **Context:** Why the decision was needed
- **Decision:** What we chose
- **Consequences:** Trade-offs and follow-ups
- **Supersedes:** (optional ADR id)
```

---

## Index

| ID | Title | Status | Date |
|----|-------|--------|------|
| ADR-001 | Teams persistence via embedded membership | Accepted | 2026-08-06 |
| ADR-002 | Org Admin via Organization model + getOrCreate | Accepted | 2026-08-06 |
| ADR-003 | VANI AI v1 = consumer product; pause Business/Enterprise | Accepted | 2026-08-06 |

---

## Decisions

### ADR-001 — Teams persistence via embedded membership

- **Date:** 2026-08-06
- **Status:** Accepted
- **Context:** `/api/teams` was gated for Business+ but returned empty lists and provisional `team_pending_*` ids with no Mongo model. ROADMAP P0 requires real list/create/get before any Teams UI.
- **Decision:** Add a `Team` Mongoose model with owner + embedded `members[]` (user, email, role, status). Keep handlers thin; put logic in `teamService`. Do not ship Teams UI until invite/role flows exist. Authorization remains membership-based (non-members get 404) on top of plan gating.
- **Consequences:** Creates a durable foundation for invites and org Admin later. Embedded members are enough for early team sizes; a separate membership collection can be introduced if scale requires it. Shared projects and Admin remain separate P0 items.

### ADR-002 — Org Admin via Organization model + getOrCreate

- **Date:** 2026-08-06
- **Status:** Accepted
- **Context:** `/api/admin` was Business+-gated but returned stub overview/empty members/ephemeral settings. Sprint P0-2 requires durable seats, members, and settings without conflating platform analytics admin (`User.role === "admin"`).
- **Decision:** Add an `Organization` model (one per billing owner) with embedded members using the same role vocabulary as Teams, a `seatLimit` derived from plan defaults, and a whitelist settings schema. Auto-provision on first Admin API call via `getOrCreateOrganization`. Keep existing routes; no Admin UI until invite/audit flows exist.
- **Consequences:** Overview/members/settings persist. Invite APIs, seat purchases, audit logs, and Team↔Org linking remain follow-ups. Platform admin analytics stays on `requirePlatformAdmin`.

### ADR-003 — VANI AI v1 = consumer product; pause Business/Enterprise

- **Date:** 2026-08-06
- **Status:** Accepted
- **Context:** Business collaboration (Teams, Org Admin, Shared Projects) was the active sprint focus, but product strategy for v1 is individual consumer AI — not enterprise collaboration.
- **Decision:** Pause all Business/Enterprise feature development (Teams UI, Org Admin UI, Shared Projects, Enterprise Dashboard, Seat Management). Keep existing Business backend implementations intact. Refocus the sprint board on consumer experience with **Deep Research** as the Current Task.
- **Consequences:** Agents must not schedule or implement paused Business/Enterprise work. Roadmap M1 is paused; M0 (consumer) is active. Resume only via an explicit priority decision.
