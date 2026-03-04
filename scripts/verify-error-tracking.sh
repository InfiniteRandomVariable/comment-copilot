#!/usr/bin/env bash
set -euo pipefail

if [[ -f ".env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env.local"
  set +a
fi

if [[ -f "apps/web/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "apps/web/.env.local"
  set +a
fi

echo "Checking error-tracking query path via Convex agentRuns..."
result="$(pnpm exec convex run agentRuns:listRecentRunsByStatus '{"runStatus":"failed","limit":5}' --typecheck disable --codegen disable)"

echo "Recent failed agent run rows (up to 5):"
echo "$result"

if [[ -z "${result// }" ]]; then
  echo "Error tracking verification failed: empty response."
  exit 1
fi

echo "Error tracking verification query succeeded."
