#!/usr/bin/env bash
# VANI AI — staging probe smoke (engineering-controlled).
#
# Validates /health, /ready, and /version against a running API.
# Does NOT perform OAuth or chat (operator-owned interactive smoke).
#
# Usage:
#   API_BASE=http://localhost:5001 ./scripts/staging-smoke.sh
#   ./scripts/staging-smoke.sh https://api.staging.example.com

set -euo pipefail

API_BASE="${1:-${API_BASE:-http://127.0.0.1:5001}}"
API_BASE="${API_BASE%/}"

echo "==> VANI staging probe smoke"
echo "    API_BASE=$API_BASE"

need_jq=0
if command -v jq >/dev/null 2>&1; then
  need_jq=1
fi

fetch() {
  local path="$1"
  local url="${API_BASE}${path}"
  echo "-- GET $path"
  local body
  local code
  body="$(curl -fsS -w "\n%{http_code}" "$url")" || {
    echo "FAIL: request to $url failed" >&2
    exit 1
  }
  code="$(echo "$body" | tail -n1)"
  body="$(echo "$body" | sed '$d')"
  if [[ "$code" != "200" ]]; then
    echo "FAIL: $path returned HTTP $code" >&2
    echo "$body" >&2
    exit 1
  fi
  if [[ "$need_jq" -eq 1 ]]; then
    echo "$body" | jq -c .
  else
    echo "$body"
  fi
}

fetch /health
fetch /ready
fetch /version

if [[ "$need_jq" -eq 1 ]]; then
  ready="$(curl -fsS "${API_BASE}/ready")"
  status="$(echo "$ready" | jq -r '.status // empty')"
  if [[ -n "$status" && "$status" != "ready" && "$status" != "ok" ]]; then
    # Accept either shape used historically
    echo "WARN: /ready status field is '$status' (continuing if HTTP 200)"
  fi
fi

echo
echo "OK: health / ready / version probes passed"
echo "Operator next: Google sign-in + one chat stream (LAUNCH_CHECKLIST §1 post-deploy)."
