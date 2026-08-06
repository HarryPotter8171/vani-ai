#!/usr/bin/env bash
# VANI AI — backup tooling + restore-drill verification (RC2-3).
#
# Validates that mongodump/mongorestore are available and (optionally)
# exercises a dump against a reachable Mongo URI into a temp directory.
# Does NOT overwrite production data. Full restore drills belong in staging
# — see docs/BACKUP.md and docs/OPERATIONS.md.
#
# Usage:
#   ./scripts/verify-backup.sh              # tool presence only
#   MONGODB_URI='mongodb://...' ./scripts/verify-backup.sh --dump
#   docker compose exec -T mongo ...        # see docs/BACKUP.md for compose

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-}"

echo "==> VANI backup verification"
echo "    root: $ROOT"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "FAIL: missing required tool: $1" >&2
    echo "      Install MongoDB Database Tools: https://www.mongodb.com/docs/database-tools/" >&2
    exit 1
  fi
  echo "OK: $1 → $(command -v "$1")"
}

need mongodump
need mongorestore

if [[ "$MODE" != "--dump" ]]; then
  echo
  echo "Tooling OK. Re-run with --dump and MONGODB_URI set to create a"
  echo "non-destructive dump under ./backups/verify-*/ (staging/local only)."
  echo "Compose helper:"
  echo "  BACKUP_DIR=./backups/\$(date -u +%Y%m%dT%H%M%SZ)"
  echo "  mkdir -p \"\$BACKUP_DIR\""
  echo "  docker compose exec -T mongo mongodump --db=vani-ai --archive --gzip > \"\$BACKUP_DIR/vani-ai.archive.gz\""
  exit 0
fi

if [[ -z "${MONGODB_URI:-}" ]]; then
  echo "FAIL: MONGODB_URI is required for --dump" >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups/verify-$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$BACKUP_DIR"
echo "==> Dumping to $BACKUP_DIR"
mongodump --uri="$MONGODB_URI" --out="$BACKUP_DIR" --gzip
echo "OK: dump complete"
echo "    Restore drill (staging URI only):"
echo "    mongorestore --uri=\"\$STAGING_MONGODB_URI\" --gzip --drop \"$BACKUP_DIR/<db-name>\""
echo "    Then: curl -fsS \"\$API/ready\" && sign-in smoke (docs/BACKUP.md)."
