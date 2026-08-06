# MCP Verification Report

**Date:** 2026-08-06  
**Sprint item:** C1-4 — MCP Verification  
**Status:** Verification complete — awaiting Review on the sprint board  
**Scope:** End-to-end verification + genuine bug fixes only (no new capabilities / redesign)

---

## Verdict

MCP is a working Pro-gated client stack: register server → connect → discover tools/resources → grant permissions → call tools → agent bridge. Live Echo stdio verification covered connect/list/call/resource/health, permission deny→trust, reconnect-on-demand, multi-server agent tool uniqueness, and agent execute. Integration/unit suites cover auth, IDOR, Pro gate, permissions, and registry naming.

**Recommendation: Needs Minor Fixes** — core path is production-capable for Pro users with explicit tool grants; live connections remain process-local (configs persist in Mongo), and per-tool usage metering is not yet separate from the plan gate.

---

## System map (verified)

| Layer | Path | Role |
|-------|------|------|
| Hook / UI | `frontend/hooks/useMcp.ts`, `components/settings/McpSettings.tsx` | Settings CRUD, connect, permissions |
| Routes | `backend/routes/mcpRoutes.js` | Auth + Pro `usageGuardFeature("mcp")`; exec meter on call/read |
| Controller | `backend/controllers/mcpController.js` | HTTP; never accepts client `skipPermission` |
| Core | `backend/mcp/*` | Manager / Client / Session / Registry / Permissions / Transport / Bridge |
| Persist | `models/McpServer.js`, `models/McpPermission.js`, `mcp/persist.js` | Durable server configs + grants |
| Agent bridge | `mcp/bridge.ts` → `agents/ToolRegistry` | Dynamic `mcp_*` tools for planners |

### Checklist

| Area | Result |
|------|--------|
| MCP server registration | OK — CRUD + validation (stdio/http/sse/websocket); max 25/user |
| Server connection lifecycle | OK — connect / disconnect / health / auto-reconnect schedule |
| Tool discovery | OK — listTools + discoverTools + agentToolName annotation |
| Tool permissions | OK — default deny; trust server / allow tool / deny tool; revoke |
| Tool execution | OK — Echo call + agent `executeAgentTool` path |
| Tool result handling | OK — content + structuredContent; isError text surfaced |
| Streaming integration | OK via Agents — MCP tools run inside agent SSE tool steps; Settings `/tools/call` is JSON (by design) |
| Authentication | OK — `requireAuth` + Pro plan; Free → `PLAN_REQUIRED` |
| Timeout handling | OK — per-server `timeoutMs` (1s–120s); connect/tool `withTimeout` |
| Error recovery | OK — reconnect-on-demand after disconnect; session reconnect backoff |
| Multiple MCP servers | OK — isolated configs + unique agent tool names (server-id suffix) |
| Session persistence | **Partial** — server configs + permissions in Mongo; live stdio/HTTP sessions are in-process (reconnect on next use) |
| Performance | Acceptable for interactive Pro use (capability cache TTL 60s; health sweep 60s) |

---

## Production Readiness Score

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | **8 / 10** | Full Echo path + agent bridge; remote transports supported but not live-tested here |
| Reliability | **8 / 10** | Multi-tenant agent names fixed; bootstrap retry fixed; tool error text preserved |
| Performance | **7 / 10** | Fine for single-user Pro MCP; not load-tested with many stdio children |
| **Overall** | **8 / 10** | |

**Recommendation:** Needs Minor Fixes (ship Pro MCP Settings + agent path; document reconnect-after-restart; optional per-tool meter later)

---

## Bugs fixed

1. **Integration tests ignored Pro feature gate**  
   Free users got `403 PLAN_REQUIRED` on all `/api/mcp` routes.  
   **Fix:** provision Pro via `subscriptionService.changePlan`; assert Free → `PLAN_REQUIRED`.

2. **Multi-tenant agent tool name collisions**  
   `sanitizeAgentToolName` used display name only; two users/servers named "Echo" overwrote each other in the global agent ToolRegistry, and `AgentSession.allowedTools` exposed every tenant's MCP tools.  
   **Fix:** append short server-id suffix; filter `listRegisteredMcpAgentTools(userId)`; reject cross-user execute in bridge.

3. **Failed Mongo bootstrap never retried**  
   `ensureUserLoaded` marked the user bootstrapped before a successful load.  
   **Fix:** add to `bootstrappedUsers` only after a successful persist list (or when no persist hooks).

4. **MCP `isError` results lost useful text**  
   Client returned a generic "Tool reported an error"; agent bridge dropped content on failure.  
   **Fix:** extract text content into `error`; bridge returns content on failure too.

5. **Permission grant/revoke/get without server ownership check**  
   Callers could write permission records for arbitrary server ids.  
   **Fix:** `getServer` ownership check → 404 for other users' servers.

---

## Explicitly not changed (by design)

- No new MCP transports, tools, or Settings UI redesign  
- No architecture redesign  
- No Teams / Org Admin / Enterprise work  
- Direct `/api/mcp/.../tools/call` remains request/response JSON (not SSE)  
- Live connections still process-local (configs durable)  
- Client still cannot set `skipPermission`  
- No separate per-tool MCP usage meter (plan-gated only)

---

## Remaining issues

| ID | Severity | Summary |
|----|----------|---------|
| KI-011 | P3 | Live MCP connections are process-local; after restart, reconnect on next connect/call (configs persist) |
| KI-012 | P3 | No dedicated per-tool MCP usage meter — Pro feature gate only |
| KI-013 | P3 | Remote HTTP/SSE/WebSocket MCP servers supported in code but not exercised in this verification (Echo stdio only) |

---

## Tests executed

```bash
cd backend && node scripts/verifyMcp.js
# Echo connect/list/call/resource/health, permission, agent execute,
# reconnect-on-demand, multi-server — passed

cd backend && npm test -- \
  tests/integration/mcp.test.js \
  tests/unit/permissions/MCPPermissionManager.test.js \
  tests/unit/mcp/MCPRegistry.test.js
# 39 passed

cd backend && npm test -- \
  tests/unit/featureGating.test.js \
  tests/integration/agents.test.js \
  tests/unit/agents/
# 46 passed (agents + gating regression)
```

---

## Docs updated

- `docs/management/SPRINT_BOARD.md` — C1-4 → Review; C1-5 → Current Task  
- `docs/management/CHANGELOG.md`  
- `CURRENT_STATUS.md`  
- `docs/management/KNOWN_ISSUES.md` (MCP follow-ups)

---

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Stdio child process leaks | Medium | Disconnect/dispose + health monitor; removeServer disposes session |
| Cross-tenant agent tool leakage | Low (fixed) | Server-id suffixes + userId filter + execute ownership check |
| Untrusted remote MCP servers | Medium | Default-deny permissions; user must grant trust / tools |
| Process restart drops live sessions | Low | Configs in Mongo; ensureConnected reconnects on demand |

---

## Breaking Changes

- **Agent MCP tool names** now include a short server-id suffix (e.g. `mcp_echo_echo_<id8>` instead of `mcp_echo_echo`). Any hardcoded references to the old names must update. Settings UI and discovery APIs already return `agentToolName`.

---

## Recommendation

**Needs Minor Fixes** — ready for Pro consumer use of Settings MCP + agent tool bridge with Echo/stdio servers. Follow up later on remote-transport soak tests and optional metering (KI-012/KI-013); reconnect-after-restart is acceptable (KI-011).
