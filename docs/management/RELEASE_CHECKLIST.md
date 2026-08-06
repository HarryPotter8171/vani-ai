# VANI AI — Release Checklist

> Per-release operational checklist. For first public launch and full deploy detail, see [LAUNCH_CHECKLIST.md](../../LAUNCH_CHECKLIST.md).  
> Companion: [CHANGELOG.md](./CHANGELOG.md), [KNOWN_ISSUES.md](./KNOWN_ISSUES.md), [docs/BACKUP.md](../BACKUP.md).

**Release:** _(version / tag)_  
**Target env:** staging → production  
**Owner:** _

---

## 1. Pre-release

- [ ] CI green (backend tests, frontend tests, build, e2e as applicable)
- [ ] [CHANGELOG.md](./CHANGELOG.md) **Unreleased** section reviewed and ready to cut
- [ ] No open P0 issues in [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)
- [ ] P1 issues reviewed; accepted risks documented
- [ ] Env / secrets verified for target environment (never commit `.env`)
- [ ] Feature flags / plan gates checked for intended audience

## 2. Staging verification

- [ ] Deploy to staging with release tag / `SENTRY_RELEASE` if used
- [ ] `GET /health` and `GET /ready` (or project equivalents) OK
- [ ] Sign-in / auth smoke
- [ ] One chat stream (send + receive)
- [ ] Billing / entitlement smoke if release touches billing
- [ ] Rollback path confirmed (previous image/tag available)

## 3. Production cut

- [ ] Mongo dump + uploads backup ([docs/BACKUP.md](../BACKUP.md))
- [ ] Deploy production
- [ ] Post-deploy health / ready checks
- [ ] Smoke: auth, chat, one critical path from this release
- [ ] Monitor errors / latency for agreed soak window

## 4. Post-release

- [ ] Move changelog entries from Unreleased → versioned section
- [ ] Tag git release if not already tagged
- [ ] Update [SPRINT_BOARD.md](./SPRINT_BOARD.md) / close related items
- [ ] Note follow-ups in [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) or [ROADMAP.md](../../ROADMAP.md)

---

## Abort criteria

Stop or roll back if:

- Auth is broken
- Chat streaming fails for healthy clients
- Data corruption / failed migrations
- Uncontained P0 after deploy
