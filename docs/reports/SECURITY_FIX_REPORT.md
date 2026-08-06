# VANI AI — Security Critical Fixes Report

**Date:** 2026-08-06  
**Role:** Lead Security Engineer  
**Phase / Task:** RC2-1 Critical Blockers Sprint (security slice)  
**Scope:** Must-Fix security Criticals only — MCP stdio RCE, browser SSRF, compose DB exposure, feature-gating kill-switch  
**Out of scope:** Performance, UI, new features, remaining High security items (XSS, query JWT, Next upgrade, research redirect SSRF, etc.)

**Companions:** [RC1_BLOCKERS.md](./RC1_BLOCKERS.md), [SECURITY_AUDIT.md](./SECURITY_AUDIT.md)

---

## Executive summary

Four Public Beta **Must Fix** security Criticals are remediated and covered by unit tests. Remaining Must-Fix security work (XSS, research/MCP remote SSRF redirects, query-string JWT, Next/xlsx, Redis revoke) is **not** in this slice.

| Blocker | Status | Finding IDs |
|---------|--------|-------------|
| MCP stdio authenticated RCE | **Fixed** | RC1-B01 (+ scrub env RC1-B02) / SEC-C1, SEC-H1 |
| Browser SSRF protection | **Fixed** | RC1-B04 / SEC-C3 |
| Docker Compose Mongo/Redis exposure | **Fixed** | RC1-B03 / SEC-C2 |
| `FEATURE_GATING_DISABLED` kill-switch | **Fixed** | RC1-B05 / SEC-C4 |

---

## 1. MCP stdio authenticated RCE

### Problem
Authenticated Pro users could register or `test-transport` an MCP server with `transport.type: "stdio"` and arbitrary `command`/`args`/`cwd`/`env`, spawning processes on the API host (RCE). Omitted `env` could inherit full `process.env` secrets.

### Fix
- Added `backend/mcp/stdioGuard.ts`:
  - **Production:** stdio always refused (even if `MCP_ALLOW_STDIO=true`).
  - **Non-production:** stdio only when `MCP_ALLOW_STDIO=true` (tests + local verify).
  - `buildScrubbedStdioEnv()` — allowlisted inherit keys only; strips secret-like user env keys; **always** passed to `StdioClientTransport` (no full-env inherit).
- Wired into `validateTransport` (`MCPRegistry`), `createMcpTransport` (`MCPTransport`), and `testTransport` (`MCPManager` via `validateServerInput`).
- Tests opt in via `tests/setup.js`; `scripts/verifyMcp.js` sets the flag outside production.

### Verification
- Unit: `tests/unit/mcp/stdioGuard.test.js` + `MCPRegistry.test.js` — **pass**
- Manual: production + `MCP_ALLOW_STDIO=true` → `assertMcpStdioAllowed()` throws; scrubbed env excludes `AUTH_JWT_SECRET` / `MONGODB_URI`

### Files
- `backend/mcp/stdioGuard.ts` (new)
- `backend/mcp/MCPRegistry.ts`
- `backend/mcp/MCPTransport.ts`
- `backend/mcp/MCPManager.ts`
- `backend/tests/setup.js`, `backend/scripts/verifyMcp.js`, `backend/.env.example`

---

## 2. Browser SSRF protection

### Problem
`assertHttpUrl` only required `http:`/`https:`, allowing navigation to `169.254.169.254`, RFC1918, localhost, and metadata hosts.

### Fix
- `assertHttpUrl` now reuses research `validatePublicUrl` after protocol check.
- Expanded `urlSafety` blocked hosts (`metadata`, `instance-data`, k8s defaults) and CGNAT `100.64/10` range.
- Unit tests assert blocks for localhost, `127.0.0.1`, `169.254.169.254`, `10.x`, `192.168.x`, `[::1]`, metadata hostname; public `example.com` still allowed.

### Verification
- Unit: `tests/unit/permissions/browserSafety.test.js` — **14 passed**
- Manual: `assertHttpUrl("http://169.254.169.254/")` throws `Blocked non-public navigation`

### Files
- `backend/browser/safety.ts`
- `backend/services/research/urlSafety.js`
- `backend/tests/unit/permissions/browserSafety.test.js`

---

## 3. Docker Compose Mongo/Redis exposure

### Problem
`docker-compose.yml` published `27017:27017` and `6379:6379` with no auth — Critical on any reachable host.

### Fix
- Removed host `ports` from `mongo` and `redis` services (Compose internal network only).
- Documented optional `127.0.0.1` bind for local debugging; never `0.0.0.0`.
- Backend/frontend still publish `5001` / `3000`; backend reaches stores via service DNS (`mongo:27017`, `redis:6379`).

### Verification
- Manual: compose YAML shows `ports:` only under `backend` and `frontend`; Mongo/Redis port lines exist only in comments / URI env values.

### Files
- `docker-compose.yml`

---

## 4. `FEATURE_GATING_DISABLED` kill-switch

### Problem
`FEATURE_GATING_DISABLED=true` opened all plan features for every authenticated user; production boot did not refuse.

### Fix
- `validateEnv` rule: fail when `FEATURE_GATING_DISABLED === "true"` (strict/production → refuse boot).
- `FeatureGate.gatingDisabled()`: in `NODE_ENV=production`, always returns `false` even if the env var is set (defense in depth if validation is bypassed).
- `.env.example` updated.

### Verification
- Unit: `tests/unit/config/validateEnv.test.js` — refuses in production; flags in non-strict
- `tests/unit/featureGating.test.js` — still green

### Files
- `backend/config/validateEnv.js`
- `backend/billing/FeatureGate.ts`
- `backend/.env.example`
- `backend/tests/unit/config/validateEnv.test.js`

---

## Aggregate test evidence (this pass)

```
npx vitest run \
  tests/unit/mcp/stdioGuard.test.js \
  tests/unit/mcp/MCPRegistry.test.js \
  tests/unit/permissions/browserSafety.test.js \
  tests/unit/config/validateEnv.test.js \
  tests/security/security.test.js
→ Test Files  5 passed (5)
→ Tests       46 passed (46)
```

---

## Residual risk (not fixed in RC2-1 security slice)

Still open from [RC1_BLOCKERS.md](./RC1_BLOCKERS.md) / [SECURITY_AUDIT.md](./SECURITY_AUDIT.md):

| Item | Notes |
|------|-------|
| RC1-B06 Research + remote MCP SSRF (redirects/DNS) | Initial browser URL hardened; research redirect-follow + MCP remote URL policy remain |
| RC1-B07 Canvas XSS + markdown hrefs | Must Fix before Public Beta |
| RC1-B12 Query-string bearer | High |
| RC1-B14 Next ≥16.3.0 | High |
| Soft sandboxes (CI / browser `--no-sandbox`) | Feature-flag / isolate separately (RC1-B28) |
| Redis JWT denylist | RC1-B11 |

**Public Beta** remains **No-Go** until remaining Must-Fix blockers (security High + performance Criticals + ops) clear. These four Criticals no longer block on their own.

---

## Board transition

| From | To |
|------|----|
| RC2-1 Critical Blockers Sprint (security Criticals) | **Review** |
| Next Current Task | **RC2-2 Performance Critical Sprint** |

---

*End of Security Fix Report.*
