# VANI AI — Known Issues

> Living list of known defects, gaps, and risks.  
> Do not mark roadmap stubs as “bugs” unless they cause incorrect user-facing behavior.  
> Companion: [SPRINT_BOARD.md](./SPRINT_BOARD.md), [CURRENT_STATUS.md](../../CURRENT_STATUS.md).

**Last reviewed:** 2026-08-06 (v1 consumer priority — Business/Enterprise sprint work paused)

---

## Open

| ID | Severity | Area | Summary | Workaround | Owner |
|----|----------|------|---------|------------|-------|
| KI-001 | P2 | Teams | No invite / role-change / leave APIs or Teams UI — **Business work paused for v1** | Backend list/create/get intact; keep UI gated/hidden | — |
| KI-002 | P2 | Admin | No org invite / audit / Admin UI — **Business work paused for v1** | Backend overview/members/settings intact; keep UI gated/hidden | — |
| KI-003 | P2 | Projects | Shared project collaboration incomplete — **paused for v1 consumer focus** | Individual projects only | — |
| KI-004 | P3 | Research | No session-history UI for `GET /api/research` list | Use active run panel only | — |
| KI-005 | P3 | Research | Stop cancels (terminal); Resume restarts from saved query — not mid-phase continue; Pause API unused in UI | Stop + Resume restart is supported | — |
| KI-006 | P3 | Agents | Plan/verify/final answer are Gemini-only (not ModelRouter multi-provider) | Use chat multi-provider path for provider switching | — |
| KI-007 | P3 | Agents | Agent sessions are in-memory; HTTP `retry` resets step state only — UI retry re-runs full request | Cancel + re-run | — |
| KI-008 | P3 | Browser | PDF generation not implemented as a browser action | Use screenshot / external PDF tools | — |
| KI-009 | P3 | Browser | Firefox/WebKit require separate Playwright installs; default path is Chromium | `npx playwright install firefox` if needed | — |
| KI-010 | P3 | Browser | Browser runs are in-memory; lost on process restart | Re-run automation after restart | — |
| KI-011 | P3 | MCP | Live MCP connections are process-local; configs persist in Mongo | Reconnect on next Settings connect / tool call | — |
| KI-012 | P3 | MCP | No dedicated per-tool MCP usage meter — Pro feature gate only | Plan upgrade covers MCP access | — |
| KI-013 | P3 | MCP | Remote HTTP/SSE/WebSocket transports not soak-tested in C1-4 (Echo stdio verified) | Prefer stdio servers; test remote before relying in prod | — |

### Severity guide

| Level | Meaning |
|-------|---------|
| P0 | Production outage / data loss / auth bypass |
| P1 | Major feature broken for many users |
| P2 | Partial breakage or degraded UX |
| P3 | Minor / cosmetic / edge case |

---

## Mitigated / monitoring

| ID | Summary | Mitigation | Status |
|----|---------|------------|--------|
| — | — | — | — |

---

## Closed

| ID | Summary | Resolution | Closed |
|----|---------|------------|--------|
| — | — | — | — |

---

## Filing rules

1. Prefer a short reproducible summary over long narrative.  
2. Link related code paths or reports when known.  
3. Close issues only when verified fixed (or explicitly wontfix with reason).  
4. Promote P0/P1 items onto [SPRINT_BOARD.md](./SPRINT_BOARD.md) only when they are scheduled for the **current sprint** (do not dump the whole roadmap onto the board).
