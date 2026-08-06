# Production Hardening Sprint 1 — Report

**Date:** 2026-08-03  
**Scope:** Critical findings C1–C5 (authentication, authorization, file security, CORS, dummy admin)  
**Status:** Complete — lint and build pass

---

## Summary

Sprint 1 removes spoofable identity (`userEmail` / `x-user-email` / `admin@vani.ai` fallbacks), adds JWT-backed `req.user` authentication, enforces ownership on protected resources, locks down file download/preview, replaces `CORS origin: *` with an environment whitelist, and deletes automatic dummy-admin seeding.

Public share links (`GET /api/chat/shared/:shareId` and `/share/*`) remain intentionally unauthenticated.

---

## Files changed

### Backend — auth / CORS / bootstrap
- `backend/server.js` — removed dummy user; CORS whitelist + credentials; mounted `/api/auth`
- `backend/middleware/auth.js` — **new** `requireAuth`, `requireFileAccess`, token extraction
- `backend/utils/jwt.js` — **new** access + file-scoped JWT helpers (`jose`)
- `backend/utils/corsOrigins.js` — **new** origin whitelist builder
- `backend/controllers/authController.js` — **new** `/sync`, `/me`, `/token`
- `backend/routes/authRoutes.js` — **new**
- `backend/package.json` — `jose` dependency; `lint` / `build` scripts

### Backend — routes (auth middleware)
- `backend/routes/chatRoutes.js` — `requireAuth` on all except `/shared/:shareId`
- `backend/routes/legacyChatRoutes.js`
- `backend/routes/fileRoutes.js`
- `backend/routes/projectRoutes.js`
- `backend/routes/memoryRoutes.js`
- `backend/routes/canvasRoutes.js`
- `backend/routes/agentRoutes.js`
- `backend/routes/researchRoutes.js`
- `backend/routes/mcpRoutes.js`
- `backend/routes/browserRoutes.js` — `/health` public; rest protected
- `backend/routes/voiceRoutes.js` — `/health` public; rest protected

### Backend — controllers / services (ownership + identity)
- `backend/controllers/chatController.js` — `findOwnedChat`; no client email; SSE preserved
- `backend/controllers/fileController.js` — `ownerId`, no path in public meta, signed URLs
- `backend/controllers/projectController.js` — `req.user` only
- `backend/controllers/memoryController.js` — `req.user` only
- `backend/controllers/canvasController.js` — `req.user` only
- `backend/controllers/browserController.js` — `req.user`; ignore client `autoApprove`
- `backend/controllers/mcpController.js` — `req.user`; ignore client `skipPermission`
- `backend/controllers/agentController.js` — session ownership; owned chat load/update
- `backend/controllers/researchController.js` — session/DB ownership
- `backend/controllers/voiceController.js` — session ownership
- `backend/services/fileService.js` — require/store `ownerId`; `resolveOwnedUploadedFile`
- `backend/services/chatAttachmentService.js` — hydrate only owned files
- `backend/services/vision/visionService.js` — preserve `ownerId` on normalize
- `backend/services/voiceSession/sessionStore.js` — store `userId`; no admin fallback

### Frontend — auth bridge + API clients
- `frontend/lib/auth/config.ts` — **new** NextAuth options
- `frontend/lib/auth/token.ts` — **new** backend JWT minting
- `frontend/lib/auth/clientFlags.ts` — **new**
- `frontend/app/api/auth/[...nextauth]/route.ts` — uses shared config
- `frontend/app/api/auth/backend-token/route.ts` — **new** session → backend JWT
- `frontend/lib/apiClient.ts` — **new** `apiFetch` / token cache / sync
- `frontend/components/AuthGate.tsx` — **new** (minimal sign-in gate; `/share/*` public)
- `frontend/app/layout.tsx` — `AuthProvider` + `AuthGate`
- `frontend/lib/constants.ts` — removed hardcoded `USER_EMAIL` / `USER_NAME`
- `frontend/lib/upload.ts` — authenticated upload; content URLs with token
- `frontend/hooks/useChat.ts`, `useChatHistory.ts`, `useProjects.ts`, `useAgent.ts`, `useDeepResearch.ts`
- `frontend/lib/canvas/api.ts`, `memory.ts`, `mcp/api.ts`, `browser/api.ts`, `voice/api.ts`
- `frontend/lib/research/api.ts`, `agents/AgentManager.ts`, `agents/types.ts`, `share.ts`, `documentUnderstanding.ts`
- `frontend/components/chat/EmptyState.tsx` — greeting from session
- `frontend/package.json` — `jose` dependency

### Documentation
- `PRODUCTION_HARDENING_REPORT.md` — this file

---

## Security improvements

| ID | Finding | Fix |
|----|---------|-----|
| **C1** | Client-trusted email identity | JWT access tokens verified with `AUTH_JWT_SECRET` / `NEXTAUTH_SECRET`; `req.user` set only after verify; `POST /api/auth/sync` provisions from token claims only |
| **C2** | IDOR via `findById` | Ownership filters (`user` / `userId` / `ownerId`) on chats, projects, canvas, memory, research, agent/voice/browser/MCP sessions; foreign resources → **404** |
| **C3** | Public uploads | `ownerId` on sidecar metadata; auth on upload/metadata/parse/understand/content; signed file tokens (15m); filesystem `path` removed from API responses; chat/agent hydration ownership-checked |
| **C4** | `origin: "*"` | Whitelist from `NEXT_PUBLIC_APP_URL` + `CORS_ORIGINS`; localhost 3000/3001 in non-production; `credentials: true` |
| **C5** | Dummy admin | Removed `createDummyUser`; removed `admin@vani.ai` fallbacks; failed auth → **401**; no auto-create on missing/spoofed email |

Additional hardening from security review:
- Client `skipPermission` ignored on MCP tool calls
- Client `autoApprove` ignored on browser runs

---

## Migration notes

1. **Existing users:** Accounts created via the old email spoof path still exist in Mongo. After deploy, users must sign in with Google (or configured auth). `POST /api/auth/sync` links the verified email to the existing `User` document when the email matches.
2. **Data under `admin@vani.ai`:** Historical chats/projects owned by the dummy user remain in the DB but are only accessible if someone authenticates as that email (not recommended). Prefer a one-time data migration to a real owner email if needed.
3. **Legacy uploads without `ownerId`:** Sidecars created before this sprint lack `ownerId`. They return **404** to API clients. Re-upload files as needed, or backfill `ownerId` in `uploads/*.json` sidecars.
4. **API clients:** Must send `Authorization: Bearer <access_token>`. Query/body `email` / `userEmail` / `x-user-email` are ignored for identity.
5. **Dev continuity:** With `ALLOW_DEV_AUTH=true` (non-production), `GET /api/auth/backend-token` can mint a server-side token for `AUTH_DEV_EMAIL` without Google. **Disable in production.**

---

## Environment variables required

### Backend (`backend/.env`)
| Variable | Required | Purpose |
|----------|----------|---------|
| `AUTH_JWT_SECRET` | **Yes** (or use `NEXTAUTH_SECRET`) | Verify access / file JWTs — **must match frontend** |
| `NEXTAUTH_SECRET` | Fallback | Same secret as NextAuth if `AUTH_JWT_SECRET` unset |
| `NEXT_PUBLIC_APP_URL` | Production | Primary CORS origin (e.g. `https://app.example.com`) |
| `CORS_ORIGINS` | Optional | Comma-separated extra origins |
| `NODE_ENV` | Recommended | `production` disables localhost CORS defaults |
| `MONGODB_URI` | Yes | Unchanged |

### Frontend (`frontend/.env.local`)
| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXTAUTH_SECRET` | **Yes** | NextAuth sessions |
| `AUTH_JWT_SECRET` | **Yes** (same as backend) | Mint backend access JWTs |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Production | Google OAuth |
| `NEXTAUTH_URL` | Yes | e.g. `http://localhost:3000` or prod URL |
| `NEXT_PUBLIC_APP_URL` | Recommended | App origin |
| `NEXT_PUBLIC_API_BASE_URL` | Recommended | e.g. `https://api.example.com/api` |
| `ALLOW_DEV_AUTH` | Dev only | Server-side dev token minting |
| `NEXT_PUBLIC_ALLOW_DEV_AUTH` | Dev only | AuthGate allows token-without-Google path |
| `AUTH_DEV_EMAIL` / `AUTH_DEV_NAME` | Dev only | Identity for dev token |

**Production checklist:** Set `NODE_ENV=production`, unset `ALLOW_DEV_AUTH` / `NEXT_PUBLIC_ALLOW_DEV_AUTH`, set strong unique `AUTH_JWT_SECRET` (= `NEXTAUTH_SECRET`), restrict `CORS_ORIGINS` / `NEXT_PUBLIC_APP_URL`.

---

## Breaking changes

1. **Unauthenticated API access** → **401** on all protected routes.
2. **Identity fields** (`userEmail`, `email`, `x-user-email`) no longer establish identity.
3. **File content URLs** require `Authorization` or `access_token` / signed URL; bare UUID URLs are private.
4. **Public file `path` field** removed from upload/metadata responses (use `id` only).
5. **MCP `skipPermission`** and **browser `autoApprove`** from HTTP clients are ignored.
6. Minimal **sign-in gate** appears when there is no session (Google in production; optional dev token path locally).

Non-breaking preserved behaviors: SSE chat/agent/research streaming, multipart uploads, voice STT/TTS, canvas/artifacts UI, public shared chat pages.

---

## Manual deployment steps

1. Set shared secrets on **both** apps:
   - `AUTH_JWT_SECRET` (identical value)
   - `NEXTAUTH_SECRET` (can be the same value)
2. Set production origins:
   - Frontend: `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_BASE_URL`
   - Backend: `NEXT_PUBLIC_APP_URL` and/or `CORS_ORIGINS`, `NODE_ENV=production`
3. Ensure Google OAuth redirect URIs include `{NEXTAUTH_URL}/api/auth/callback/google`.
4. Deploy backend, then frontend.
5. Confirm:
   - Unauthenticated `GET /api/chat/list` → 401
   - Authenticated chat stream still works (SSE)
   - File upload → content requires token; response has no `path`
   - Share link `/share/:shareId` works without login
   - CORS from non-whitelisted origin is rejected
6. Disable `ALLOW_DEV_AUTH` / `NEXT_PUBLIC_ALLOW_DEV_AUTH` in production.
7. Optional: migrate or delete `admin@vani.ai` user and orphaned uploads without `ownerId`.

---

## Verification

```bash
cd backend && npm run lint && npm run build
cd ../frontend && npm run lint && npm run build
```

Both completed successfully after this sprint.

---

## Security review (post-fix)

Re-reviewed after Sprint 1 + follow-up patches:

| Area | Result |
|------|--------|
| Auth middleware / JWT | Pass |
| Chat / project / canvas / memory ownership | Pass |
| File HTTP routes + signed URLs | Pass |
| Chat/agent file hydration ownership | Pass (fixed IDOR) |
| CORS whitelist | Pass |
| Dummy admin removed | Pass |
| MCP `skipPermission` from client | Pass (ignored) |
| Browser `autoApprove` from client | Pass (ignored) |

No remaining Critical findings in C1–C5 scope.
