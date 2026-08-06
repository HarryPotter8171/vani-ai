# AUTH_REPORT.md

> Authentication module verification — **2026-08-06**  
> Role: senior QA / FE+BE architect review.  
> Rules followed: no redesign, no drive-by refactors, no unnecessary UI changes. Fixed only genuine auth correctness bugs.

---

## Production readiness verdict

**Core authentication is production-ready for a single-backend (or sticky) deployment**, provided secrets and Google OAuth are configured correctly.

| Area | Verdict |
|------|---------|
| Google Login (NextAuth) | Ready |
| Session management (NextAuth JWT cookie) | Ready |
| Backend access JWT mint + verify | Ready |
| User sync (`POST /api/auth/sync`) | Ready (retry gap fixed) |
| Protected Express routes | Ready |
| Logout (NextAuth + JWT revoke + client wipe) | Ready |
| Token refresh / expiry recovery | Ready after fix (proactive remint + 401 remint-retry) |
| Error handling / edge cases | Solid; residual multi-instance revoke caveat |

**Not a blocker for ship:** in-memory JWT denylist does not replicate across multiple backend processes without sticky sessions or a shared store.

---

## Architecture (as implemented — unchanged)

```
Browser
  ├─ NextAuth (Google OAuth / optional dev credentials)
  │    cookie session (JWT strategy)
  ├─ GET /api/auth/backend-token  → mint HS256 backend JWT (1h)
  └─ POST {API}/auth/sync         → upsert Mongo User from JWT claims only
         │
         ▼
Express requireAuth → verify JWT → load User by email → req.user
```

- **UI identity SoT:** NextAuth session (`useSession` / `useAuthUser`).
- **API identity SoT:** Verified backend JWT + Mongo `User` (never client email fields).
- **Secrets:** `AUTH_JWT_SECRET` (preferred) or shared `NEXTAUTH_SECRET` on both apps.

---

## Working features

### Google Login
- `GoogleProvider` in `frontend/lib/auth/config.ts`.
- Sign-in CTA via `signIn('google')` in `AuthGate`.
- JWT/session callbacks replace identity atomically on sign-in (no prior-account name/avatar leak).
- Optional non-prod **Continue as developer** (`ALLOW_DEV_AUTH` + `NEXT_PUBLIC_ALLOW_DEV_AUTH`, `dev-continue` route) — disabled in production builds.

### Session management
- NextAuth `session: { strategy: 'jwt' }`.
- `SessionProvider` with `refetchOnWindowFocus`, `refetchInterval={0}` (avoids mobile spin).
- Account switch detected in `AuthGate` → clears backend token cache and remints.
- Public share routes (`/share/*`) bypass the auth chrome gate.

### JWT / backend token
- Mint: `frontend/lib/auth/token.ts` + `GET /api/auth/backend-token` (session required; **no sessionless mint**).
- Verify: `backend/utils/jwt.js` (HS256, email required, file-purpose tokens rejected as session creds).
- Client cache with ~30s proactive refresh window (`getAccessToken`).
- Previous token revoked on remint (`POST /api/auth/revoke`).

### User sync
- `POST /api/auth/sync` provisions/updates Mongo user from **verified JWT claims only** (body identity ignored — covered by tests).
- Idempotent; updates display name when profile changes.
- Bootstraps platform admin via `VANI_ADMIN_EMAILS` (promote-only).

### Protected routes
- Domain routers mount `requireAuth` (chat, memory, canvas, billing, agents, MCP, browser, voice, TTS, models, analytics, teams, admin, projects, code, files metadata, etc.).
- Public exceptions: health probes, billing webhooks, `GET /api/chat/shared/:shareId`, file content via scoped file JWT (`requireFileAccess`).
- Unauthenticated / bad / expired / forged / `alg=none` tokens rejected (security suite).

### Logout
- UI: `UserMenu` → `logoutFromBackend()` then NextAuth `signOut({ redirect: false })`.
- Backend: revoke JWT, clear API-host auth cookies, clear per-user MCP in-memory state; always `{ success: true }`.
- Client: token cache generation bump, sessionStorage wipe, selective localStorage wipe (theme preserved).
- AuthGate shows brief “Signing out…” then sign-in screen.

### Token refresh
- **Proactive:** remint when cached JWT is within 30s of expiry.
- **Reactive (fixed this pass):** on `apiFetch` / upload `401`, clear cache, force remint (+ sync), ** once.
- **Sync recovery (fixed this pass):** if mint succeeded but sync failed, later `getAccessToken` cache hits retry `/auth/sync` instead of stuck `USER_NOT_SYNCED`.

### Error handling
- Missing secret → `AUTH_SECRET_MISSING` / 500 with calm message.
- `USER_NOT_SYNCED` when JWT valid but Mongo user missing.
- AuthGate: boot splash ceiling (1.5s), backend reconnect banner, token ensure timeout (8s) without infinite spinner.
- Logout tolerates offline API (still clears client + NextAuth).

### Edge cases covered by design / tests
- Tampered / expired / wrong-secret / missing-email / file-scoped-as-session tokens.
- Sync ignores attacker body email.
- Logout without token still succeeds.
- Rate limit on `/api/auth/*`.
- Dev auth cannot remint after logout without explicit Continue (sessionless mint disabled).

---

## Fixed issues (this pass)

| ID | Bug | Impact | Fix |
|----|-----|--------|-----|
| **A1** | After a successful backend-token mint, if `/auth/sync` failed once, `getAccessToken` kept returning the cached JWT **without retrying sync** until expiry/force. | Protected APIs returned `USER_NOT_SYNCED` until manual Retry or ~1h remint. | On cache hit, if `syncedForToken !== token`, retry `syncBackendUser`. |
| **A2** | `apiFetch` cleared the token cache on `401` but did **not** remint/retry. | First request after expiry/revoke/unsynced JWT failed even when NextAuth session was still valid. | Single force remint + one retry; second `401` stands. |
| **A3** | `apiUploadXHR` same `401` gap as `apiFetch`. | File uploads could fail once after sync/expiry races. | Same single remint + retry pattern. |

**File changed:** `frontend/lib/apiClient.ts` only.

No UI redesign. No backend auth contract changes.

---

## Tests run

```bash
cd backend && npx vitest run \
  tests/integration/auth.test.js \
  tests/unit/utils/jwt.test.js \
  tests/unit/utils/tokenRevocation.test.js \
  tests/security/security.test.js
```

**Result:** 4 files, **45/45 passed**.

Also: `frontend` `tsc --noEmit` → **PASS** after the client fix.

Frontend has **no dedicated auth unit suite** (AuthGate / token mint covered indirectly by e2e journey when configured). E2E auth login/logout steps exist in `e2e/tests/userJourney.spec.ts` (not re-run in this pass; depends on full stack + env).

---

## Remaining known issues (non-blocking / ops)

1. **JWT revocation is in-process memory** (`tokenRevocation.js`). Multi-instance backends without sticky routing may accept a token revoked on another instance until natural expiry (~1h). Mitigate with single instance, sticky sessions, or a shared denylist (Redis) — out of scope for this fix pass.

2. **Some clients bypass `apiFetch`** (raw `fetch` + `getAccessToken`): e.g. analytics PDF export helper, code-interpreter execute, voice WebSocket connect. They get proactive remint via `getAccessToken`, but not the new single `401` retry. Primary chat/upload path is covered.

3. **Long-lived voice WebSocket** authenticates with a token at connect time; a 1h wall-clock session may need reconnect after JWT expiry (expected for bearer-at-connect designs).

4. **Ops misconfiguration:** `AUTH_JWT_SECRET` / `NEXTAUTH_SECRET` must match across Next and Express; Google OAuth client IDs must be set for production Google login. Backend `validateEnv` requires secrets but cannot prove FE/BE secret equality.

5. **Query-string bearer** (`?access_token=`) is accepted by `extractAccessToken` for file/`<img>` patterns and also works on other `requireAuth` routes (by design/tests). Prefer headers for non-file traffic; treat query tokens as sensitive in logs/proxies.

6. **No frontend unit tests** for AuthGate / logout / token cache — regression risk; rely on backend suites + e2e.

7. **Avatar** is shown from NextAuth session; Mongo `User.avatar` is not updated on sync (UI does not depend on it).

---

## Checklist vs requested scope

| Item | Status |
|------|--------|
| Google Login | Working |
| Session management | Working |
| JWT / backend token | Working |
| Protected routes | Working |
| Logout | Working |
| Token refresh | Working (A1–A3 fixed) |
| User sync | Working (A1 fixed) |
| Error handling | Working |
| Edge cases | Covered by tests + documented residuals |

---

## Summary

Authentication is correctly layered (NextAuth session → short-lived backend JWT → Mongo sync → `requireAuth`). Integration and security tests pass. Two real client-side recovery bugs around sync failure and `401` handling were fixed in `apiClient.ts` without changing the architecture.

**Ship recommendation:** Yes for production, with the multi-instance revoke caveat and secret/OAuth configuration called out in the launch checklist.

---

*End of AUTH_REPORT.md*
