# Teams Persistence Report

**Date:** 2026-08-06  
**Sprint item:** P0-1 — Teams workspaces (list / create / get + membership)  
**Status:** Complete (API persistence; no Teams UI shipped)

---

## Summary

Replaced the stubbed `/api/teams` handlers with durable Mongo persistence. Business+ users can create workspaces, list memberships, and fetch a team by id. Free/Pro callers remain blocked by existing `usageGuardFeature("teams")` gating.

---

## What changed

| Area | Change |
|------|--------|
| Model | Added `backend/models/Team.js` — name, description, owner, embedded members (user, email, name, role, status), archived |
| Service | Added `backend/services/teamService.js` — create / list / get + serialization |
| Controller | Rewrote `backend/controllers/teamsController.js` to use the service (no provisional IDs) |
| Routes | Unchanged — still `requireAuth` + `usageGuardFeature("teams")` |
| Tests | Added `backend/tests/integration/teams.test.js` (8 cases, all passing) |

### API behavior

- `GET /api/teams` — teams where the caller is a member (`archived: false` by default)
- `POST /api/teams` — `{ name, description? }`; creator becomes `owner` / `active` member
- `GET /api/teams/:id` — member-only; non-members and unknown ids → `404 NOT_FOUND`

Response shape keeps `{ ok, team(s), planId }` and extends team objects with durable fields (`id`, `ownerId`, `members`, `memberCount`, timestamps).

---

## Explicitly out of scope (this task)

- Teams / invite UI on the frontend (PROJECT_RULES: do not ship UI that implies unfinished collaboration)
- Member invite / role-change / leave / archive endpoints
- Org Admin product (`adminController` stubs)
- Shared project collaboration

Those remain on the sprint board as P0-2 / P0-3 and related follow-ups.

---

## Verification

```bash
cd backend && npm run test -- tests/integration/teams.test.js
# 8 passed
```

---

## Docs updated

- `docs/management/SPRINT_BOARD.md`
- `docs/management/CHANGELOG.md`
- `docs/management/DECISIONS.md` (ADR-001)
- `docs/management/KNOWN_ISSUES.md`
- `CURRENT_STATUS.md`
- `ROADMAP.md`
- `ARCHITECTURE.md`
- `FEATURE_GATING_REPORT.md` (remaining Teams stub TODO narrowed)
