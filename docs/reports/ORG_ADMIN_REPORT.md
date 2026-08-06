# Org Admin Persistence Report

**Date:** 2026-08-06  
**Sprint item:** P0-2 — Organization Admin (durable seats, members, settings)  
**Status:** Implementation complete — awaiting Review on the sprint board

---

## Summary

Replaced stubbed `/api/admin` handlers with durable Mongo persistence. Business+ users get an auto-provisioned `Organization` (owner membership, seat cap, settings). Free/Pro remain blocked by existing `usageGuardFeature("admin")`. Platform analytics admin (`User.role === "admin"`) is unchanged and distinct.

---

## What changed

| Area | Change |
|------|--------|
| Model | Added `backend/models/Organization.js` — name, unique owner, `seatLimit`, embedded members (same role vocabulary as Teams), settings |
| Service | Added `backend/services/orgAdminService.js` — getOrCreate, overview, list members, update settings |
| Controller | Rewrote `backend/controllers/adminController.js` to use the service |
| Routes | Unchanged — `GET /`, `GET /members`, `PATCH /settings` + Business+ gate |
| Tests | `tests/integration/admin.test.js` (9) + `tests/unit/services/orgAdminService.test.js` (3) — all passing |

### API behavior

- `GET /api/admin` — ensures org exists; returns seats `{ limit, used, remaining, unlimited }`, member count, roles, callerRole, settings
- `GET /api/admin/members` — durable member list (owner seeded on provision)
- `PATCH /api/admin/settings` — whitelist-only settings; owner/admin only; syncs org `name` when `displayName` changes

Seat defaults: Business **10** (override `VANI_ORG_DEFAULT_SEATS_BUSINESS`), Enterprise **unlimited** (`VANI_ORG_DEFAULT_SEATS_ENTERPRISE`, default `-1`).

---

## Explicitly out of scope (this task)

- Org Admin UI
- Member invite / role-change / seat-purchase flows
- Audit log product
- Linking Teams workspaces to an Organization FK
- Shared project collaboration (P0-3)

---

## Verification

```bash
cd backend && npm run test -- tests/integration/admin.test.js tests/unit/services/orgAdminService.test.js
# 12 passed
```

---

## Docs updated

- `docs/management/SPRINT_BOARD.md` (P0-2 → Review; P0-3 → Current Task)
- `docs/management/CHANGELOG.md`
- `docs/management/DECISIONS.md` (ADR-002)
- `docs/management/KNOWN_ISSUES.md` (KI-002 narrowed)
- `CURRENT_STATUS.md`, `ARCHITECTURE.md`, `ROADMAP.md` (M1 note), `FEATURE_GATING_REPORT.md`, `CODING_STANDARDS.md`
