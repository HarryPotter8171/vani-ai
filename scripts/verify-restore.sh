#!/usr/bin/env bash
# VANI AI — restore tooling verifier (engineering-controlled).
#
# Confirms mongorestore is present and prints a dry-run restore recipe.
# Optionally validates that a prior dump directory looks well-formed.
# NEVER runs --drop against a live URI unless RESTORE_CONFIRM=YES is set
# (staging only — see docs/BACKUP.md).
#
# Usage:
#   ./scripts/verify-restore.sh
#   ./scripts/verify-restore.sh --check-dump ./backups/verify-...
#   STAGING_MONGODB_URI=... DUMP_DIR=... RESTORE_CONFIRM=YES ./scripts/verify-restore.sh --restore

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-}"
ARG2="${2:-}"

echo "==> VANI restore tooling verification"
echo "    root: $ROOT"

if ! command -v mongorestore >/dev/null 2>&1; then
  echo "FAIL: missing mongorestore" >&2
  echo "      Install MongoDB Database Tools: https://www.mongodb.com/docs/database-tools/" >&2
  exit 1
fi
echo "OK: mongorestore → $(command -v mongorestore)"

if ! command -v mongodump >/dev/null 2>&1; then
  echo "FAIL: missing mongodump (pair with restore tooling)" >&2
  exit 1
fi
echo "OK: mongodump → $(command -v mongodump)"

if [[ "$MODE" == "--check-dump" ]]; then
  DUMP_DIR="${ARG2:-}"
  if [[ -z "$DUMP_DIR" || ! -d "$DUMP_DIR" ]]; then
    echo "FAIL: --check-dump requires an existing dump directory" >&2
    exit 1
  fi
  # mongodump --out creates <dir>/<dbName>/; archive dumps are files.
  if find "$DUMP_DIR" -type f \( -name "*.bson*" -o -name "*.archive*" -o -name "*.gz" \) | head -1 | grep -q .; then
    echo "OK: dump artifacts found under $DUMP_DIR"
  else
    echo "FAIL: no bson/archive artifacts under $DUMP_DIR" >&2
    exit 1
  fi
  exit 0
fi

if [[ "$MODE" == "--restore" ]]; then
  if [[ "${RESTORE_CONFIRM:-}" != "YES" ]]; then
    echo "FAIL: refusing restore without RESTORE_CONFIRM=YES (staging only)" >&2
    exit 1
  fi
  if [[ -z "${STAGING_MONGODB_URI:-}" ]]; then
    echo "FAIL: STAGING_MONGODB_URI is required for --restore" >&2
    exit 1
  fi
  if [[ -z "${DUMP_DIR:-}" || ! -d "${DUMP_DIR}" ]]; then
    echo "FAIL: DUMP_DIR must point to a mongodump output directory" >&2
    exit 1
  fi
  echo "==> Restoring $DUMP_DIR → STAGING_MONGODB_URI (with --drop)"
  mongorestore --uri="$STAGING_MONGODB_URI" --gzip --drop "$DUMP_DIR"
  echo "OK: restore complete — run ./scripts/staging-smoke.sh against the staging API"
  exit 0
fi

echo
echo "Tooling OK. Dry-run restore recipe (staging URI only):"
echo "  1. ./scripts/verify-backup.sh --dump   # or use an existing dump"
echo "  2. ./scripts/verify-restore.sh --check-dump \"\$BACKUP_DIR\""
echo "  3. STAGING_MONGODB_URI=... DUMP_DIR=\$BACKUP_DIR RESTORE_CONFIRM=YES \\"
echo "       ./scripts/verify-restore.sh --restore"
echo "  4. API_BASE=https://staging-api... ./scripts/staging-smoke.sh"
echo "  5. Operator: sign-in + open a known chat (docs/BACKUP.md)"
exit 0
