# BUILD_STATUS.md

> Codebase health audit — **2026-08-06**.  
> Scope: identify build/TS/lint/import/runtime issues; fix **only** critical blockers that prevent building or running.  
> No features, refactors, or behavior redesigns.

---

## Verdict

| Gate | Status |
|------|--------|
| Backend syntax / `npm run build` | **PASS** (316 files) |
| Backend unit tests | **PASS** (455 / 455) |
| Backend smoke (`/health`, `/ready`, graceful shutdown) | **PASS** (outside sandbox) |
| Frontend `tsc --noEmit` | **PASS** (after fix) |
| Frontend `next build` | **PASS** (after fix) |
| Frontend ESLint | **FAIL** (44 errors, 13 warnings) — does **not** block `next build` |
| Frontend unit tests | **FAIL** (4 / 170) — UI/test drift; does **not** block build/run |
| Root e2e | Not run in this pass |

**Critical build blockers found and fixed:** 2 TypeScript errors that failed `next build`.  
**Application behavior:** unchanged (redundant checks / unreachable props only).

---

## Critical fixes applied

### 1. `frontend/app/page.tsx` — TypeScript narrowing broke production build

**Errors:**
- `TS2367`: `workspaceTab !== 'automation'` compared after `isEmptyHome` already narrowed `workspaceTab` to `"chat"`.
- `TS2339`: `activeProject?.settings` after `isEmptyHome` narrowed `activeProject` to falsy → `never`.

**Cause:** `isEmptyHome` is defined as requiring `workspaceTab === 'chat'` and `!activeProject`. TypeScript correctly proved the extra checks/property access were impossible.

**Fix (behavior-preserving):**
- Render empty-home composer with `isEmptyHome && !voiceLive` (automation exclusion already implied).
- Pass `projectDefaultModel={null}` (always true under `isEmptyHome`).

**Evidence:** `next build` previously failed at typecheck; now completes with `EXIT:0`.

### 2. `frontend/lib/export/rtlText.ts` — implicit circular type

**Error:** `TS7022` — `charRtl` implicitly `any` (self-referential initializer via `rtl`).

**Fix:** Explicit annotation `const charRtl: boolean = ...`.

**Evidence:** `npx tsc --noEmit` → `TSC_EXIT:0`.

---

## Category findings

### 1. Build errors

| Area | Result | Notes |
|------|--------|-------|
| Backend `npm run build` | PASS | Alias of `checkSyntax.js` |
| Frontend `npm run build` | PASS after fix | Was FAIL on TS in `page.tsx` |
| Turbopack NFT warning | Non-blocking | `unicodePdfFont.ts` / filesystem trace via analytics export; build still succeeds |

### 2. TypeScript errors

| Before | After |
|--------|-------|
| 3 errors (`page.tsx` ×2, `rtlText.ts` ×1) | **0** |

Strict mode (`"strict": true`) is on; no `ignoreBuildErrors` in `next.config.ts`.

### 3. ESLint errors

**Frontend `npm run lint`:** 57 problems (**44 errors**, 13 warnings). Exit code 1.

Dominant rule families (not fixed — not build blockers; fixing would be large reactive refactors):

- `react-hooks/set-state-in-effect` — many hooks/`page.tsx` effects
- `react-hooks/immutability` — ref writes flagged
- `react-hooks` “Cannot access refs during render”
- One `prefer-const` in `pdfFontCatalog.ts`

**Backend “lint”:** syntax check only — **PASS**. No ESLint config run for backend in this audit.

**CI note:** `.github/workflows/ci.yml` does **not** run frontend `eslint`; it runs `test:coverage` + `build`. ESLint failures alone do not fail current CI lint jobs.

### 4. Broken imports

| Finding | Severity |
|---------|----------|
| Frontend `@/` and relative imports resolve | OK (0 missing) |
| Backend relative imports | 1 JSDoc-only: `agents/ToolRegistry.js` → `./types.js` (`import('./types.js').AgentTool` in comment). **No runtime import.** Module loads successfully. |
| Runtime import of `ToolRegistry` | OK |

### 5. Missing files

| Path | Notes |
|------|-------|
| `backend/agents/types.js` | Referenced only in JSDoc; not required at runtime |
| `backend/models/ChatV2.js` | File **exists** but is **never imported** (orphan model) — not a missing file; dead coexistence |
| Root `lib/`, `public/` | Empty placeholder dirs — not required by build |

No missing modules that break boot or `next build`.

### 6. Runtime crashes

| Check | Result |
|-------|--------|
| `npm run smoke:test` (sandbox) | Failed to reach localhost (sandbox network) — **environmental** |
| `npm run smoke:test` (full perms) | **PASS** — `/health` 200, `/ready` 200, SIGTERM clean exit |
| Dev frontend already listening on :3000 | Observed in existing terminal metadata |

No critical crash in smoke path after env allows binding/fetch.

### 7. API mismatches

Static path scan of FE string literals under `/api/...` mostly goes through API client helpers (few hard-coded absolute paths). Spot-check:

- Auth bridge routes exist on Next (`backend-token`, `dev-continue`) and Express (`/api/auth`).
- Express mounts in `app.js` match documented surface.
- Known **intentional** stubs: Teams / org Admin return provisional/empty payloads; shared projects return **501** when gated — not accidental mismatches.

No critical client→server path mismatch found that would crash the happy path. Deeper contract fuzzing (response shapes) was out of scope for “build/run only.”

### 8. Duplicate code causing bugs

| Item | Assessment |
|------|------------|
| `services/identity.js` + `identityGuard.js` + `identity/` | Re-export / compat shims — loads; not a crash bug |
| Mongoose duplicate schema indexes (`Subscription.user`, `Invoice.externalInvoiceId`, `DailyUsage.day`) | **Warnings** only; risk of redundant indexes in Mongo, not boot failure |
| `Chat` vs unused `ChatV2` | No dual-write bug observed; ChatV2 unused |

None treated as critical build/run blockers in this pass.

---

## Non-critical issues (documented, not fixed)

Per instructions: do **not** change behavior or chase non-blocking quality work.

### Frontend unit tests (CI-impacting)

`npm test`: **4 failed**, 166 passed.

| Test | Likely cause |
|------|----------------|
| ChatInput — voice button name `"Start Live Mode"` | UI aria-label is `"Start voice mode"` |
| ChatInput — enable/trigger voice | Same label drift |
| ChatHistoryItem — `getByLabelText("Pinned")` | Pin control uses `"Pin conversation"` / `"Unpin conversation"`; star has no `"Pinned"` label |
| ChatHistoryItem — active class `/text-primary/` | Active styles use `text-accent` |

These are **test expectations vs current UI**, not build failures. Fixing them would mean updating tests (preferred) or renaming UI strings (behavior/a11y change — out of scope).

**CI impact:** `frontend-tests` job runs `npm run test:coverage` and will fail until tests are aligned.

### ESLint (44 errors)

Does not fail `next build`. Not fixed.

### Turbopack NFT warning

Build warning around PDF font / `process.cwd()` tracing. Non-fatal.

### Mongoose deprecation / duplicate index warnings

Appear during unit tests. Cleanup would be schema hygiene, not a run blocker.

---

## Commands used

```bash
# Backend
cd backend && npm run lint && npm run build && npm run test:unit && npm run smoke:test

# Frontend
cd frontend && npx tsc --noEmit && npm run lint && npm run build && npm test
```

---

## Files changed (critical fixes only)

1. `frontend/app/page.tsx` — empty-home ChatInput condition / `projectDefaultModel`
2. `frontend/lib/export/rtlText.ts` — `charRtl: boolean`

No backend source changes. No refactors. No feature work.

---

## Recommended follow-ups (outside this task)

1. Align frontend unit tests with current aria-labels / accent active styles so CI `frontend-tests` goes green.  
2. Optionally add `backend/agents/types.js` (or remove JSDoc path) for editor completeness.  
3. Deduplicate Mongoose indexes.  
4. Triage React Compiler / hooks ESLint errors separately if lint becomes a CI gate.  
5. Investigate Turbopack NFT warning for PDF font loading if deploy size/tracing becomes an issue.

---

*End of BUILD_STATUS.md*
