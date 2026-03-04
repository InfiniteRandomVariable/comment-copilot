#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if rg -n --hidden \
  --glob '!node_modules/**' \
  --glob '!.next/**' \
  --glob '!.git/**' \
  --glob '!.env' \
  --glob '!.env.*' \
  --glob '!**/.env' \
  --glob '!**/.env.*' \
  --glob '!docs/**' \
  --glob '!infra/**' \
  --glob '!README.md' \
  --glob '!scripts/check-isolation.sh' \
  'swapsafe|SwapSafe|backend1|v0-testing' . >/tmp/isolation_hits.txt; then
  echo "Isolation check failed. Found SwapSafe references:"
  cat /tmp/isolation_hits.txt
  exit 1
fi

echo "Isolation check passed."
