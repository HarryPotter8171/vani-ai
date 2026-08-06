# VANI AI — Sprint Board

> **Only source of truth** for the current development sprint.  
> Long-term milestones: [ROADMAP.md](../../ROADMAP.md).  
> Inventory: [CURRENT_STATUS.md](../../CURRENT_STATUS.md). Issues: [KNOWN_ISSUES.md](./KNOWN_ISSUES.md).

**Sprint:** RC1 — Release Candidate → RC2 Critical Blockers → RC2.5 → Public Beta Decision  
**Window:** 2026-08-06 →  
**Focus:** Operator execution of Public Beta **`1.0.0-beta.1`** (Conditional GO)  
**Product posture:** VANI AI **v1 is a consumer AI product**. Business / Enterprise feature development is **paused**. Existing Business backend APIs remain intact but are out of sprint scope.

**Prior sprint:** Consumer AI Experience (C1) — **COMPLETE** (verification in Review)

---

## Status legend

| Status | Meaning |
|--------|---------|
| **Current Task** | Exactly one active implementation task |
| **Todo** | Scheduled for this sprint, not started |
| **Review** | Implementation done; awaiting verification / doc sign-off |
| **Blocked** | Cannot proceed until blocker clears |
| **Done** | Completed in this sprint (or carried from prior sprint slice) |
| **Paused** | Explicitly deferred — do not resume without a priority decision |

---

## Board

| ID | Status | Item | Notes |
|----|--------|------|-------|
| — | **Current Task** | Waiting For Operator Release | Execute [LAUNCH_CHECKLIST.md](../../LAUNCH_CHECKLIST.md) + deploy `1.0.0-beta.1` per [PUBLIC_BETA_DECISION.md](../releases/PUBLIC_BETA_DECISION.md) · eng Conditional GO signed · no further eng Current Task until operator returns |

### Todo

| ID | Item | Notes |
|----|------|-------|
| — | — | — |

### Review

| ID | Item | Notes |
|----|------|-------|
| PB-DEC | Public Beta Decision | Awaiting operator execute · [PUBLIC_BETA_DECISION.md](../releases/PUBLIC_BETA_DECISION.md) · **`1.0.0-beta.1`** · score **7.6/10** · **Conditional GO** · date **TBD** |
| RC2.5 | Public Beta Critical Blockers | Awaiting sign-off · [RC25_CRITICAL_FIX_REPORT.md](../reports/RC25_CRITICAL_FIX_REPORT.md) · XSS + SSRF redirects + Redis JWT denylist + staging eng tooling · backend **803** / FE **192** / E2E **PASS** · **Conditional Go** |
| RC2-4 | Final Verification Sprint | Awaiting sign-off · [FINAL_VERIFICATION_REPORT.md](../reports/FINAL_VERIFICATION_REPORT.md) · product **7.2/10** · E2E **PASS** · superseded Critical set by RC2.5 |
| RC2-3 | Production Hardening Sprint | Awaiting sign-off · [PRODUCTION_HARDENING_REPORT.md](../reports/PRODUCTION_HARDENING_REPORT.md) · FE Sentry · secret strength · Compose Redis · ops runbook · est. readiness **~6.5/10** |
| RC2-2 | Performance Critical Sprint | Awaiting sign-off · [PERFORMANCE_FIX_REPORT.md](../reports/PERFORMANCE_FIX_REPORT.md) · `/` **1.254 MB** (was **2.284 MB**) · Phase A |
| RC2-1 | Critical Blockers Sprint (security) | Awaiting sign-off · [SECURITY_FIX_REPORT.md](../reports/SECURITY_FIX_REPORT.md) · MCP stdio / browser SSRF / compose DB ports / gating kill-switch |
| RC1-FINAL | Release Blocker Consolidation | Awaiting sign-off · [RC1_BLOCKERS.md](../reports/RC1_BLOCKERS.md) · Critical list reduced by RC2/RC2.5 |
| RC1-L1 | Production Readiness Audit | Awaiting sign-off · [PRODUCTION_READINESS_AUDIT.md](../reports/PRODUCTION_READINESS_AUDIT.md) · score **4.8/10** · **No-Go** Public Beta · checklist **0/24** |
| RC1-R1 | Full Regression Audit | Awaiting sign-off · [REGRESSION_AUDIT.md](../reports/REGRESSION_AUDIT.md) · score **6.2/10** · **NO-GO** Public Beta |
| RC1-S1 | Security Audit | Awaiting sign-off · [SECURITY_AUDIT.md](../reports/SECURITY_AUDIT.md) · score **5.5/10** |
| RC1-P1 | Performance Audit | Awaiting sign-off · [PERFORMANCE_AUDIT.md](../reports/PERFORMANCE_AUDIT.md) · plan [PERFORMANCE_IMPLEMENTATION_PLAN.md](../reports/PERFORMANCE_IMPLEMENTATION_PLAN.md) · score **5.8/10** |
| C1-1 | Deep Research verification + bugfixes | Awaiting sign-off · [DEEP_RESEARCH_REPORT.md](../reports/DEEP_RESEARCH_REPORT.md) |
| C1-2 | AI Agents Verification | Awaiting sign-off · [AI_AGENTS_REPORT.md](../reports/AI_AGENTS_REPORT.md) |
| C1-3 | Browser Automation Verification | Awaiting sign-off · [BROWSER_AUTOMATION_REPORT.md](../reports/BROWSER_AUTOMATION_REPORT.md) |
| C1-4 | MCP Verification | Awaiting sign-off · [MCP_REPORT.md](../reports/MCP_REPORT.md) |
| C1-5 | Code Interpreter Verification | Awaiting sign-off · [CODE_INTERPRETER_REPORT.md](../reports/CODE_INTERPRETER_REPORT.md) |
| C1-6 | Projects / RAG Verification | Awaiting sign-off · [RAG_REPORT.md](../reports/RAG_REPORT.md) |
| C1-7 | OCR & PDF Intelligence Verification | Awaiting sign-off · [OCR_PDF_REPORT.md](../reports/OCR_PDF_REPORT.md) |
| C1-8 | Image Generation Verification | Awaiting sign-off · [IMAGE_GENERATION_REPORT.md](../reports/IMAGE_GENERATION_REPORT.md) |
| C1-9 | Image Editing Verification | Awaiting sign-off · [IMAGE_EDITING_REPORT.md](../reports/IMAGE_EDITING_REPORT.md) |
| C1-10 | File Upload Pipeline Verification | Awaiting sign-off · [FILE_UPLOAD_REPORT.md](../reports/FILE_UPLOAD_REPORT.md) |

### Blocked

| ID | Item | Blocker | Notes |
|----|------|---------|-------|
| — | — | — | — |

### Done (prior Business API slice — backend kept)

| ID | Item | Completed | Notes |
|----|------|-----------|-------|
| P0-1 | Teams API list/create/get + membership | 2026-08-06 | Backend intact · [TEAMS_PERSISTENCE_REPORT.md](../reports/TEAMS_PERSISTENCE_REPORT.md) · **no Teams UI** |
| P0-2 | Org Admin API seats/members/settings | 2026-08-06 | Backend intact · [ORG_ADMIN_REPORT.md](../reports/ORG_ADMIN_REPORT.md) · **no Admin UI** |

### Paused (Business / Enterprise — do not work)

| ID | Item | Reason |
|----|------|--------|
| — | Teams UI | v1 consumer focus |
| — | Organization Admin UI | v1 consumer focus |
| — | Shared Projects (incl. former P0-3) | v1 consumer focus |
| — | Enterprise Dashboard | v1 consumer focus |
| — | Seat Management (product/UI) | v1 consumer focus |
| — | Further Business/Enterprise collaboration features | Paused until explicitly resumed |

---

## Not in this sprint

- Roadmap **M1** Business collaboration follow-ons (invites, shared projects, Admin UI)  
- Roadmap **M2** Enterprise custom quota / seat product work  
- Any Enterprise dashboard or seat-management UI  
- Should-Fix / Can-Wait items from [RC1_BLOCKERS.md](../reports/RC1_BLOCKERS.md) unless promoted after Must-Fix  

Keep backend Business gates and models as-is; do **not** remove or redesign them in this sprint. Public Beta decision is signed **Conditional GO** in [PUBLIC_BETA_DECISION.md](../releases/PUBLIC_BETA_DECISION.md). Engineering is idle on release code until the operator completes staging/deploy gates; residual High Must-Fix remains in [RC1_BLOCKERS.md](../reports/RC1_BLOCKERS.md) for post-beta / GA.

---

## How to use

1. Schedule work by moving a **small** consumer-focused slice from [ROADMAP.md](../../ROADMAP.md) into this board as **Todo**.  
2. Keep exactly **one** **Current Task** (or none while awaiting the next scheduled Todo).  
3. Do **not** pull paused Business/Enterprise items without an explicit priority change.  
4. On completion: **Current Task** → **Review** (if needed) → **Done**; then pick the next **Todo**.  
5. Append a short note to [CHANGELOG.md](./CHANGELOG.md) when a task reaches **Done**.
