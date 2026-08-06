# VANI AI — Security Audit Report

**Date:** 2026-08-06  
**Role:** Security Lead  
**Phase / Task:** RC1-S1 — Security Audit (read-only; no code changes)  
**Product posture:** VANI AI v1 consumer RC1 — Public Beta readiness  
**Companions:** [ARCHITECTURE.md](../../ARCHITECTURE.md), [AUTH_REPORT.md](../../AUTH_REPORT.md), [PERFORMANCE_AUDIT.md](./PERFORMANCE_AUDIT.md), [LAUNCH_CHECKLIST.md](../../LAUNCH_CHECKLIST.md)

---

## Executive summary

Core **authentication and authorization are solid**: NextAuth → short-lived HS256 JWT → Mongo sync, consistent resource ownership (IDOR coverage), and plan feature gates that Free users cannot bypass by calling Pro APIs directly when gating is enabled.

Residual risk is concentrated in **privileged tool surfaces** (MCP stdio ≈ host RCE; browser/research/MCP SSRF), **ops misconfiguration** (compose DB ports, `FEATURE_GATING_DISABLED`, weak secrets), **XSS** (canvas richtext + markdown `href`), and a small set of **dependency advisories** (`next`, `xlsx`).

| | |
|--|--|
| **Overall Security Score** | **5.5 / 10** |
| **Launch Risk** | **High** for Public Beta without Top blockers |
| **Critical findings** | 4 |
| **High findings** | 12 |
| **Medium findings** | 14 |
| **Low findings** | 10 |
| **Recommendation** | Lock down MCP stdio, unpublish DB ports, fail-closed on gating/secrets, fix SSRF + XSS, upgrade Next — **before** Public Beta |

### Score breakdown

| Area | Score | Notes |
|------|------:|-------|
| Authentication | 7.5 / 10 | Sound JWT chain; query bearer + in-memory revoke weaken it |
| Authorization / tenancy | 8.0 / 10 | Ownership + Pro gates strong; admin demotion gap |
| API / transport | 5.5 / 10 | Headers/CORS good; SSRF + rate-limit IP spoof |
| Uploads | 7.0 / 10 | Magic-byte + ownership solid; no AV; zip allowed |
| XSS / content | 4.5 / 10 | Canvas richtext + markdown schemes |
| Secrets / config | 5.0 / 10 | Env validation present; kill-switches & compose ports |
| Dependencies | 5.5 / 10 | 0 critical; 5 high (`next`, `xlsx`, transitive) |
| Sandboxes (CI / browser) | 4.0 / 10 | Soft isolation on shared host identity |

---

## Method

1. Read project context, architecture, sprint board, performance audit/plan, known auth/hardening reports.  
2. Inspect auth middleware, JWT mint/verify, NextAuth, feature gates, admin RBAC, ownership filters.  
3. Inspect uploads, CORS, rate limits, security headers, billing webhooks, SSRF paths (browser, research, MCP).  
4. Inspect XSS surfaces (markdown, canvas, mermaid, artifact sandbox).  
5. Inspect Docker/compose, health disclosure, code interpreter / browser sandbox posture.  
6. Ran `npm audit` in `backend/` and `frontend/` (2026-08-06).

**Out of scope:** code fixes, pentest exploitation, redesign, config changes.

---

## Findings — Critical

### SEC-C1. MCP stdio transport allows arbitrary host process execution
| | |
|--|--|
| **Description** | Authenticated users with the `mcp` feature can register (or `test-transport`) an MCP server with `transport.type: "stdio"` and arbitrary `command` / `args` / `cwd` / `env`. Validation only checks type and command length; `StdioClientTransport` spawns the process on the API host. |
| **Impact** | **Remote code execution** as the backend user (`vani` in Docker). Read env secrets, pivot to Mongo/Redis, abuse Playwright/code interpreter, lateral movement. |
| **Root Cause** | `backend/mcp/MCPRegistry.ts` (`validateTransport`); `backend/mcp/MCPTransport.ts`; routes gated only by `requireAuth` + `usageGuardFeature("mcp")`. |
| **Recommendation** | **Disable stdio in multi-tenant production**; or admin-only + strict binary allowlist + fixed `cwd` + scrubbed env. Prefer remote HTTP/SSE to isolated sidecars. Treat `test-transport` as equally dangerous. |
| **Estimated effort** | **M–L** |

### SEC-C2. Compose publishes unauthenticated MongoDB + Redis to the host
| | |
|--|--|
| **Description** | `docker-compose.yml` maps `27017:27017` and `6379:6379` with **no Mongo auth** and **no Redis `requirepass`**. |
| **Impact** | On any reachable host (laptop LAN, misconfigured cloud SG), full DB read/write and cache/rate-limit abuse. |
| **Root Cause** | Dev-friendly compose defaults without a prod overlay warning. |
| **Recommendation** | Remove host `ports:` for mongo/redis (internal network only), or bind `127.0.0.1` + add auth. Document compose as **not internet-safe**. |
| **Estimated effort** | **S** |

### SEC-C3. Browser automation navigates to private / metadata URLs (SSRF)
| | |
|--|--|
| **Description** | `assertHttpUrl` only requires `http:`/`https:`. No private-IP / link-local / cloud-metadata block (unlike research `urlSafety.js`). Chromium also launches with `--no-sandbox`. |
| **Impact** | Entitled users can hit `169.254.169.254`, internal admin UIs, LAN services; steal cloud IAM tokens; browser compromise ≈ host compromise. |
| **Root Cause** | `backend/browser/safety.ts`; `BrowserSession.ts` launch flags. |
| **Recommendation** | Reuse/extend `validatePublicUrl`; block RFC1918, loopback, link-local, IPv6 ULA, metadata hosts; isolate browser in dedicated container; avoid `--no-sandbox` when possible. |
| **Estimated effort** | **M** |

### SEC-C4. `FEATURE_GATING_DISABLED=true` disables all plan enforcement
| | |
|--|--|
| **Description** | When set, `FeatureGate` allows every feature for every authenticated user. |
| **Impact** | Free users can exercise Pro/Business APIs and tools — revenue/abuse bypass. |
| **Root Cause** | Explicit kill-switch in `backend/billing/FeatureGate.ts` (`gatingDisabled()`). |
| **Recommendation** | Refuse boot in production if set; dual-confirm env; alert on startup; launch checklist gate. |
| **Estimated effort** | **S** |

---

## Findings — High

### SEC-H1. MCP stdio children can inherit full backend environment
| | |
|--|--|
| **Description** | When `transport.env` is omitted, spawn may inherit `process.env` (API keys, JWT secrets, `MONGODB_URI`). |
| **Impact** | Even a “benign” MCP binary receives production secrets; catastrophic with SEC-C1. |
| **Root Cause** | `backend/mcp/MCPTransport.ts` stdio branch. |
| **Recommendation** | Always pass scrubbed env allowlist (`PATH`, `HOME`, `LANG` only). |
| **Estimated effort** | **S** |

### SEC-H2. MCP remote transports have no SSRF host policy
| | |
|--|--|
| **Description** | HTTP/SSE/WebSocket MCP URLs need only parse as URLs; private and metadata hosts allowed. |
| **Impact** | Server-side requests to internal services with optional attacker-controlled headers. |
| **Root Cause** | `MCPRegistry` / `MCPTransport` lack `validatePublicUrl`-style checks. |
| **Recommendation** | Same public-URL policy as research; strip sensitive outbound headers to internal hosts. |
| **Estimated effort** | **S–M** |

### SEC-H3. Research page fetch follows redirects into private networks
| | |
|--|--|
| **Description** | `validatePublicUrl` runs on the initial URL; `fetch(..., { redirect: "follow" })` does not re-validate hops. Hostname checks only — no DNS rebinding protection. |
| **Impact** | Public open-redirects / DNS rebinding → classic SSRF to internal hosts. |
| **Root Cause** | `backend/services/research/sourceFetcher.js` + `urlSafety.js`. |
| **Recommendation** | `redirect: "manual"`, validate each hop; resolve DNS and block private answers; pin IP. |
| **Estimated effort** | **S–M** |

### SEC-H4. Canvas richtext rendered with unsanitized `dangerouslySetInnerHTML`
| | |
|--|--|
| **Description** | `type === 'richtext'` injects `content` as HTML into the host DOM. |
| **Impact** | **Stored XSS** on the app origin (NextAuth session cookie theft, actions as the user). |
| **Root Cause** | `frontend/components/canvas/CanvasPreview.tsx` — no DOMPurify / allowlist. |
| **Recommendation** | Sanitize with strict allowlist, or render via sandboxed HTML preview path. |
| **Estimated effort** | **S** |

### SEC-H5. Markdown links allow dangerous URL schemes
| | |
|--|--|
| **Description** | Custom `a` renderer passes `href` through unchanged (`javascript:`, `data:`, etc.). Share page uses the same markdown path. |
| **Impact** | XSS / phishing when users click model- or attacker-controlled links in chat/share. |
| **Root Cause** | `frontend/components/chat/MarkdownContent.tsx` — no protocol allowlist. |
| **Recommendation** | Allow only `http:`, `https:`, `mailto:`; use react-markdown `urlTransform`. |
| **Estimated effort** | **S** |

### SEC-H6. Bearer tokens accepted via query string on all `requireAuth` routes
| | |
|--|--|
| **Description** | `extractAccessToken` accepts `?access_token=` / `?token=` for any protected route. Voice WS also uses `?token=`. File signed URLs embed JWT in query. HTTP logger can serialize full `req.url`. |
| **Impact** | Tokens leak via access logs, proxies, Referer, browser history → session impersonation. |
| **Root Cause** | `backend/middleware/auth.js`; file/voice URL patterns; logger serializers. |
| **Recommendation** | Restrict query tokens to file content / WS only; prefer `Authorization` / `Sec-WebSocket-Protocol`; strip secrets from logs. |
| **Estimated effort** | **S–M** |

### SEC-H7. JWT revocation is process-local (logout ineffective across instances)
| | |
|--|--|
| **Description** | `revokeAccessToken` / denylist use an in-memory `Map`. |
| **Impact** | After logout/remint, another backend instance may accept the old JWT until natural expiry (~1h). |
| **Root Cause** | `backend/utils/tokenRevocation.js` — no Redis shared denylist. |
| **Recommendation** | Redis denylist keyed by `jti`; or shorter TTL + sticky sessions as interim. |
| **Estimated effort** | **M** |

### SEC-H8. No minimum secret strength / shared secret family
| | |
|--|--|
| **Description** | `validateEnv` checks presence of secrets, not entropy. `AUTH_JWT_SECRET` can fall back to `NEXTAUTH_SECRET`. |
| **Impact** | Weak secrets → forge sessions and API JWTs; one compromise forges both. |
| **Root Cause** | `backend/config/validateEnv.js`; `backend/utils/jwt.js`; `frontend/lib/auth/token.ts`. |
| **Recommendation** | Enforce ≥32 bytes random in production; require distinct secrets with `aud`/`iss` separation. |
| **Estimated effort** | **S** |

### SEC-H9. Next.js high-severity advisories (upgrade available)
| | |
|--|--|
| **Description** | Frontend pins `next@16.2.10`. `npm audit` reports middleware/proxy bypass (Turbopack + single locale), App Router Server Actions DoS, SSRF in Server Actions. Fix available in **≥16.3.0**. Transitive highs: `postcss`, `sharp`, `brace-expansion`. |
| **Impact** | DoS / SSRF / bypass depending on App Router and Server Actions usage. |
| **Root Cause** | `frontend/package.json` / lockfile. |
| **Recommendation** | Upgrade `next` + `eslint-config-next` to ≥16.3.0; re-audit. |
| **Estimated effort** | **S–M** |

### SEC-H10. `xlsx` high vulns with no npm fix
| | |
|--|--|
| **Description** | Direct `xlsx@^0.18.5` — Prototype Pollution + ReDoS; `fixAvailable: false`. |
| **Impact** | Untrusted spreadsheets can DoS or pollute prototypes in parse path. |
| **Root Cause** | `backend/package.json` parsers. |
| **Recommendation** | Migrate to maintained alternative (`exceljs` / SheetJS Pro) or isolate parse in worker with hard timeouts. |
| **Estimated effort** | **M** |

### SEC-H11. Code interpreter is userspace hardening, not a hard jail
| | |
|--|--|
| **Description** | Import blocks, patched `os.*`, path guards, rlimits; optional `unshare -n` with fallback. Dangerous patterns often warn-only. Same OS user as API. |
| **Impact** | Determined escape can read/write outside workspace and reach host resources; without `unshare`, network may reach metadata. |
| **Root Cause** | `services/codeInterpreter/*` design on shared host. |
| **Recommendation** | Run in gVisor/Firecracker/nsjail or dedicated container; fail closed if `unshare` unavailable in prod; no secrets in kernel env. |
| **Estimated effort** | **L** |

### SEC-H12. Rate-limit key trusts first `X-Forwarded-For` hop
| | |
|--|--|
| **Description** | `defaultKeyFn` uses leftmost XFF; production enables trust proxy by default. |
| **Impact** | Clients can spoof IPs and bypass or exhaust another user’s IP bucket (auth/public limits). |
| **Root Cause** | `backend/middleware/rateLimit.js` + `app.js` trust-proxy defaults. |
| **Recommendation** | Use Express `req.ip` with correct hop count; for authed routes key by `user.id`. |
| **Estimated effort** | **S** |

---

## Findings — Medium

### SEC-M1. Platform admin promote-only from env (stale admins)
| | |
|--|--|
| **Description** | `VANI_ADMIN_EMAILS` auto-promotes but never auto-demotes removed emails. |
| **Impact** | Former admins retain `/api/analytics/admin/*` access. |
| **Root Cause** | `backend/middleware/requirePlatformAdmin.js`. |
| **Recommendation** | Demote when allow-list is non-empty and email absent; audit admin list. |
| **Estimated effort** | **S** |

### SEC-M2. OAuth account linking without explicit `email_verified` check
| | |
|--|--|
| **Description** | Backend identity is email from JWT; sync upserts by email; Google callbacks do not assert `email_verified`. |
| **Impact** | Classic account-linking risk if IdP supplies unverified email (Google usually verifies; defense-in-depth missing). |
| **Root Cause** | `frontend/lib/auth/config.ts`; `backend/controllers/authController.js`. |
| **Recommendation** | Reject when `email_verified !== true`; store Google `sub` as stable id. |
| **Estimated effort** | **M** |

### SEC-M3. NextAuth session long-lived (~30d) vs backend JWT (1h)
| | |
|--|--|
| **Description** | Session JWT cookie ~30d; backend access JWT 1h with remint from session. |
| **Impact** | Stolen NextAuth cookie can remint API tokens for session lifetime. |
| **Root Cause** | `frontend/lib/auth/config.ts` — no tightened `maxAge` / `updateAge`. |
| **Recommendation** | Explicit shorter `session.maxAge`, rotation; document production `secure` cookies. |
| **Estimated effort** | **S** |

### SEC-M4. Unsigned billing webhooks return 200 without mutating
| | |
|--|--|
| **Description** | If Stripe/Razorpay signatures are absent, ingest may return `ok: true` without applying entitlements. Signed path itself looks correct when configured. |
| **Impact** | Not privilege escalation, but hides misconfiguration and weakens monitoring. |
| **Root Cause** | `backend/billing/WebhookService.ts` local foundation fallback. |
| **Recommendation** | In production with gateways enabled, return **400** when signature/raw body missing. |
| **Estimated effort** | **S** |

### SEC-M5. No schema validation library on controllers
| | |
|--|--|
| **Description** | Almost no zod/joi; validation is ad hoc; large free-form chat bodies. |
| **Impact** | Inconsistent bounds; harder to prevent mass-assignment / injection regressions. |
| **Root Cause** | Controllers under `backend/controllers/*`. |
| **Recommendation** | Add zod at write-route boundaries; reject unknown keys. |
| **Estimated effort** | **L** |

### SEC-M6. Large JSON body limit (30mb); uneven rate-limit coverage
| | |
|--|--|
| **Description** | Global `express.json({ limit: "30mb" })`; some routes (e.g. `/api/models`) lack limiters. |
| **Impact** | Memory/CPU DoS via large bodies or unthrottled authenticated endpoints. |
| **Root Cause** | `backend/app.js`; incomplete route limiters. |
| **Recommendation** | Scope large limits to chat/upload; rate-limit expensive routes. |
| **Estimated effort** | **S–M** |

### SEC-M7. Uploads: no malware/AV scanning; ZIP allowed
| | |
|--|--|
| **Description** | Strong ext+MIME+magic-byte checks and ownership; no virus scan; `.zip` accepted. |
| **Impact** | Malware hosting / zip bombs stressing parsers. |
| **Root Cause** | `backend/config/upload.js`, `middleware/upload.js`, `utils/fileSignatures.js`. |
| **Recommendation** | Async AV; restrict zip unless needed; decompression limits if unzipped. |
| **Estimated effort** | **M–L** |

### SEC-M8. Unauthenticated `/health` and `/version` disclosure
| | |
|--|--|
| **Description** | `/health` returns Mongo/Redis/disk/RSS; `/version` returns package/Node/`NODE_ENV`. |
| **Impact** | Recon / fingerprinting for attackers. |
| **Root Cause** | `backend/controllers/healthController.js` — intentional for ops. |
| **Recommendation** | Rich health only on internal network; public edge uses minimal `/ready`; strip error strings. |
| **Estimated effort** | **S** |

### SEC-M9. Error messages sometimes leak internals
| | |
|--|--|
| **Description** | Some controllers return `err.message` on 4xx/5xx; global handler is safer. |
| **Impact** | Path/config/DB details aid attackers. |
| **Root Cause** | Inconsistent controller error mapping. |
| **Recommendation** | Stable public error codes; log details server-side only. |
| **Estimated effort** | **M** |

### SEC-M10. Org member listing exposes all member emails
| | |
|--|--|
| **Description** | Any org/team member can see roster emails (Business APIs; UI paused for v1). |
| **Impact** | PII exposure within org (often acceptable; document). |
| **Root Cause** | `orgAdminService.listOrgMembers`; `teamService.serializeTeam`. |
| **Recommendation** | Restrict full email roster to owner/admin if product allows. |
| **Estimated effort** | **S** |

### SEC-M11. HTML artifact preview sanitizer is minimal
| | |
|--|--|
| **Description** | Sandbox iframe without `allow-same-origin` is primary control; sanitizer strips few tags; scripts allowed inside sandbox. |
| **Impact** | Contained today; residual UX abuse if sandbox flags change. |
| **Root Cause** | `frontend/lib/htmlSanitize.ts`, `artifactPreview.ts`. |
| **Recommendation** | Never combine `allow-same-origin` + `allow-scripts`; document invariant. |
| **Estimated effort** | **S** |

### SEC-M12. Research SSRF: DNS rebinding gap
| | |
|--|--|
| **Description** | Hostname string checks only; no resolve-then-verify (paired with SEC-H3). |
| **Impact** | DNS rebinding can reach private IPs after validation. |
| **Root Cause** | `backend/services/research/urlSafety.js`. |
| **Recommendation** | Resolve A/AAAA, pin IP for request, reject private results. |
| **Estimated effort** | **M** |

### SEC-M13. Frontend lacks API-equivalent CSP (Next origin)
| | |
|--|--|
| **Description** | Backend API security headers are strong; Next.js frontend CSP not equivalently locked in `next.config`. |
| **Impact** | XSS impact radius larger on the app origin (worsens SEC-H4/H5). |
| **Root Cause** | Split FE/BE header ownership. |
| **Recommendation** | Add Next headers CSP tailored for app (scripts, connect-src API). |
| **Estimated effort** | **M** |

### SEC-M14. In-memory rate-limit fallback under multi-instance
| | |
|--|--|
| **Description** | Without Redis, rate limits are per-process (also noted in performance audit INF-C2). |
| **Impact** | Effective limit × N replicas — abuse and fairness failure. |
| **Root Cause** | `backend/middleware/rateLimit.js` + optional Redis. |
| **Recommendation** | Require Redis for multi-replica (align with performance Phase A). |
| **Estimated effort** | **S** |

---

## Findings — Low

| ID | Description | Impact | Root Cause | Recommendation | Effort |
|----|-------------|--------|------------|----------------|--------|
| SEC-L1 | CSRF on `/api/*` low today (Bearer in memory, not cookies) | Low unless cookie auth added | Design split | Document; add CSRF if cookies used | S |
| SEC-L2 | CORS allowlist + credentials — sound if origins minimal | Misconfig risk | `corsOrigins.js` | Keep prod list tight | S |
| SEC-L3 | API security headers solid (CSP none, DENY, nosniff, HSTS prod) | Positive | `securityHeaders.js` | Keep; extend FE (M13) | — |
| SEC-L4 | Mermaid `securityLevel: 'strict'` but SVG via `innerHTML` | Residual SVG XSS | `MermaidRenderer.tsx` | DOMParser/sanitize or iframe | S |
| SEC-L5 | Mongo injection posture good; no `$where`; missing global `sanitizeFilter` | Low today | Defensive service patterns | `mongoose.set('sanitizeFilter', true)` | S |
| SEC-L6 | Public share by unguessable `shareId` (128-bit) — by design | Link leakage = read | `shareChat` | Educate; optional expiry/password later | S |
| SEC-L7 | Dev auth gated by `NODE_ENV` + `ALLOW_DEV_AUTH` | Prod footgun if flags set | Auth routes | Launch checklist forbid flags | XS |
| SEC-L8 | Production source maps default off; not explicit | Future footgun | `next.config.ts` | Pin `productionBrowserSourceMaps: false` | XS |
| SEC-L9 | Debug env flags (`MCP_DEBUG`, etc.) can leak in logs | PII/secret in logs | Various | Forbid in prod compose | XS |
| SEC-L10 | Secrets hygiene mostly good (`.env` dockerignored; pino redacts headers) | Residual query JWT (H6) | Good baseline | Audit analytics `meta` writers | S |

---

## Dependency audit (npm, 2026-08-06)

| Package tree | Critical | High | Moderate | Low | Total |
|--------------|----------|------|----------|-----|-------|
| **backend** | 0 | **1** (`xlsx`) | 0 | 0 | **1** |
| **frontend** | 0 | **4** (`next`, `brace-expansion`, `postcss`, `sharp`) | 0 | 0 | **4** |

**Security-sensitive versions (observed):** `next@16.2.10`, `next-auth@^4.24.15`, `express@5.2.1`, `mongoose@9.8.0`, `multer@2.2.0`, `playwright@1.62.1`, `jose@^5.10.0` (no `jsonwebtoken`).

---

## What’s done well

1. **Identity chain:** NextAuth session → server-only `backend-token` → HS256 JWT (1h, `jti`) → `/api/auth/sync` from verified claims only; never trusts client email headers.  
2. **JWT crypto hygiene:** `jose` with `algorithms: ["HS256"]`; file-purpose tokens rejected as session credentials; security tests cover wrong secret / `alg=none`.  
3. **Ownership / IDOR:** Consistent `{ _id, user }` / `userId` filters across chat, files, canvas, memory, projects, research, agents, browser, MCP, code interpreter; strong integration coverage.  
4. **Feature gates:** Router-level `usageGuard` on Pro surfaces; Free → Pro direct API bypass **not** possible when gating enabled.  
5. **Uploads:** Path sanitize, UUID filenames, magic-byte verification, ownership checks, Content-Disposition sanitization.  
6. **Research initial URL SSRF blocklist** (hosts / private IPv4) — incomplete but intentional.  
7. **Billing:** Raw body mounted before `express.json`; Stripe/Razorpay verification when configured.  
8. **API headers + CORS allowlist;** cookies httpOnly; API JWT kept in memory (not localStorage).  
9. **Docker:** Non-root `vani` user; `.dockerignore` excludes `.env*`; `NODE_ENV=production` in compose.  
10. **Artifact HTML/React previews** in sandboxed iframes without `allow-same-origin`.

---

## Overall Security Score: **5.5 / 10**

Weighted for a multi-tenant AI SaaS with tools that touch the host:

- AuthN/AuthZ foundations are above average (+)  
- MCP stdio + compose DB ports + soft sandboxes dominate residual risk (−)  
- XSS on primary origin (−)  
- SSRF across browser/research/MCP (−)  
- Dependency highs are fixable but currently open (−)

---

## Launch Risk: **High**

| Scenario | Risk |
|----------|------|
| Closed beta, single instance, MCP/browser/CI disabled | **Medium** — still fix XSS + gating/secret footguns |
| Public Beta with Pro tools (MCP / browser / research) enabled | **High** — RCE/SSRF realistic |
| Compose stack with published DB ports on reachable host | **Critical** — data store compromise |
| Multi-replica without Redis | **High** — rate-limit + revoke incorrect |

---

## Top security blockers before Public Beta

| # | Blocker | Finding IDs | Effort |
|---|---------|-------------|--------|
| 1 | **Disable or lock down MCP stdio** (+ scrub env); SSRF policy for remote MCP | SEC-C1, SEC-H1, SEC-H2 | M |
| 2 | **Unpublish Mongo/Redis host ports**; add auth for any exposed data stores | SEC-C2 | S |
| 3 | **Fail closed** on `FEATURE_GATING_DISABLED` + weak secrets in production | SEC-C4, SEC-H8 | S |
| 4 | **SSRF harden** browser + research (private IP + redirect/DNS) | SEC-C3, SEC-H3, SEC-M12 | M |
| 5 | **Sanitize canvas richtext** + markdown `href` allowlist | SEC-H4, SEC-H5 | S |
| 6 | **Restrict query-string bearer**; strip tokens from logs | SEC-H6 | S–M |
| 7 | **Upgrade Next ≥16.3.0**; plan `xlsx` replacement/isolation | SEC-H9, SEC-H10 | S–M |
| 8 | **Redis JWT denylist** (or document single-instance-only logout) | SEC-H7, SEC-M14 | M |
| 9 | **Fix rate-limit IP keying**; unsigned webhook fail-closed in prod | SEC-H12, SEC-M4 | S |
| 10 | **Isolate or feature-flag** code interpreter / browser soft sandboxes for multi-tenant | SEC-H11, SEC-C3 | L |

---

## Suggested sequencing vs RC1

1. **RC1-S1** (this audit) → Review  
2. **RC1-R1** Full Regression Audit (next)  
3. Schedule a **Security Fix** slice for blockers 1–7 before Public Beta marketing (parallel with Performance Phase A where safe — Redis requirement overlaps)

**Do not** enable MCP stdio, browser automation, or code interpreter for Public Beta tenants until blockers 1, 4, and 10 are addressed or features remain Pro-gated **and** network-isolated.

---

## Audit constraints

- **No source code modified**  
- **No vulnerabilities fixed**  
- Findings from inspection + `npm audit` only  

---

*End of RC1-S1 Security Audit.*
