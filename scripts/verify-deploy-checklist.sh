#!/usr/bin/env bash
set -euo pipefail

APP_URL="${APP_URL:-http://localhost:3100}"
VERIFY_RUNTIME="${VERIFY_RUNTIME:-1}"
VERIFY_CONVEX="${VERIFY_CONVEX:-0}"
ARTIFACT_DIR="${ARTIFACT_DIR:-/tmp/comment_copilot_deploy_checklist_verify}"

mkdir -p "$ARTIFACT_DIR"

echo "[deploy-checklist] running phase boundary gate"
pnpm verify:phase-boundary | tee "$ARTIFACT_DIR/phase-boundary.log"

echo "[deploy-checklist] syncing web env"
pnpm sync:web:env | tee "$ARTIFACT_DIR/sync-web-env.log"

if [[ "$VERIFY_RUNTIME" == "1" ]]; then
  HEALTH_URL="${APP_URL%/}/api/health/orchestration"
  echo "[deploy-checklist] checking runtime health at $HEALTH_URL"
  curl -sS "$HEALTH_URL" | tee "$ARTIFACT_DIR/orchestration-health.json" > /dev/null

  if ! rg -q '"ok"\s*:\s*true' "$ARTIFACT_DIR/orchestration-health.json"; then
    echo "[deploy-checklist] health check did not return ok=true"
    cat "$ARTIFACT_DIR/orchestration-health.json"
    exit 1
  fi

  echo "[deploy-checklist] running stripe webhook smoke"
  APP_URL="$APP_URL" ./scripts/smoke-stripe-webhook.sh | tee "$ARTIFACT_DIR/stripe-smoke.log"
else
  echo "[deploy-checklist] runtime checks skipped (VERIFY_RUNTIME=$VERIFY_RUNTIME)"
fi

if [[ "$VERIFY_CONVEX" == "1" ]]; then
  echo "[deploy-checklist] verifying convex API reachability"
  pnpm exec convex run devSeed:getFirstAccountId --typecheck disable --codegen disable \
    | tee "$ARTIFACT_DIR/convex-account-check.json"
else
  echo "[deploy-checklist] convex check skipped (VERIFY_CONVEX=$VERIFY_CONVEX)"
fi

echo "[deploy-checklist] verification complete"
echo "[deploy-checklist] artifacts: $ARTIFACT_DIR"
