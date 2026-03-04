#!/usr/bin/env bash
set -euo pipefail

APP_URL="${APP_URL:-http://localhost:3100}"
ARTIFACT_DIR="${ARTIFACT_DIR:-/tmp/stage1_item3_incident_runbook_exercise_latest}"
VERIFY_CONVEX="${VERIFY_CONVEX:-1}"
ALLOW_OVERWRITE="${ALLOW_OVERWRITE:-0}"

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

mkdir -p "$ARTIFACT_DIR"
if [[ -n "$(find "$ARTIFACT_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]] && [[ "$ALLOW_OVERWRITE" != "1" ]]; then
  echo "[incident-rehearsal] artifact directory is not empty: $ARTIFACT_DIR"
  echo "[incident-rehearsal] set ALLOW_OVERWRITE=1 to reuse this directory"
  exit 1
fi

extract_account_id() {
  local raw="$1"
  local id=""

  id=$(echo "$raw" | sed -n 's/.*"accountId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)
  if [[ -z "$id" ]]; then
    id=$(echo "$raw" | sed -n "s/.*accountId[[:space:]]*:[[:space:]]*['\"]\([^'\"]*\)['\"].*/\1/p" | head -n1)
  fi
  if [[ -z "$id" ]]; then
    id=$(echo "$raw" | sed -n 's/^"\([a-z0-9]\{20,64\}\)"$/\1/p' | head -n1)
  fi
  if [[ -z "$id" ]]; then
    id=$(echo "$raw" | grep -Eo '[a-z0-9]{20,64}' | head -n1 || true)
  fi

  echo "$id"
}

resolve_account_id() {
  if [[ -n "${INCIDENT_TEST_ACCOUNT_ID:-}" ]]; then
    echo "$INCIDENT_TEST_ACCOUNT_ID"
    return 0
  fi

  local first_result=""
  local account_id=""

  first_result=$(pnpm exec convex run devSeed:getFirstAccountId --typecheck disable --codegen disable 2>/dev/null || true)
  echo "$first_result" > "$ARTIFACT_DIR/account-raw.json"
  account_id=$(extract_account_id "$first_result")
  if [[ -n "$account_id" ]]; then
    echo "$account_id"
    return 0
  fi

  local seeded_result=""
  seeded_result=$(pnpm exec convex run devSeed:getOrSeedDefaultAccountId --typecheck disable --codegen disable 2>/dev/null || true)
  echo "$seeded_result" > "$ARTIFACT_DIR/account-seeded-raw.json"
  account_id=$(extract_account_id "$seeded_result")
  if [[ -n "$account_id" ]]; then
    echo "$account_id"
    return 0
  fi

  echo ""
}

echo "[incident-rehearsal] checking orchestration health"
rm -f "$ARTIFACT_DIR/orchestration-health.json"
health_status=$(curl -sS -o "$ARTIFACT_DIR/orchestration-health.json" -w "%{http_code}" "${APP_URL%/}/api/health/orchestration" || true)
if [[ "$health_status" != "200" ]]; then
  echo "[incident-rehearsal] health check failed with HTTP $health_status"
  [[ -f "$ARTIFACT_DIR/orchestration-health.json" ]] && cat "$ARTIFACT_DIR/orchestration-health.json" || true
  exit 1
fi
if ! grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' "$ARTIFACT_DIR/orchestration-health.json"; then
  echo "[incident-rehearsal] health check payload missing ok=true"
  cat "$ARTIFACT_DIR/orchestration-health.json"
  exit 1
fi

ACCOUNT_ID="$(resolve_account_id)"
if [[ -z "$ACCOUNT_ID" ]]; then
  echo "[incident-rehearsal] failed to resolve accountId"
  exit 1
fi
printf '%s\n' "$ACCOUNT_ID" > "$ARTIFACT_DIR/account-id.txt"

if [[ "$VERIFY_CONVEX" == "1" ]]; then
  echo "[incident-rehearsal] querying billing usage summary"
  pnpm exec convex run billing:getUsageSummary "{\"accountId\":\"${ACCOUNT_ID}\"}" --typecheck disable --codegen disable \
    > "$ARTIFACT_DIR/billing-usage-summary.json"
else
  echo "[incident-rehearsal] skipping convex usage summary (VERIFY_CONVEX=$VERIFY_CONVEX)"
fi

echo "[incident-rehearsal] running stripe smoke"
APP_URL="$APP_URL" pnpm smoke:stripe:webhook > "$ARTIFACT_DIR/stripe-smoke.log" 2>&1
printf '0\n' > "$ARTIFACT_DIR/stripe-smoke-exit.txt"

TIKTOK_SIGNING_SECRET="${TIKTOK_WEBHOOK_SECRET:-${TIKTOK_CLIENT_SECRET:-}}"
if [[ -z "$TIKTOK_SIGNING_SECRET" ]]; then
  echo "[incident-rehearsal] missing TikTok signing secret"
  exit 1
fi

nonce="$(date +%s)"
request_timestamp="$(date +%s)"
platform_comment_id="incident-replay-comment-${nonce}"
message_id="incident-replay-message-${nonce}"
payload=$(cat <<JSON
{
  "accountId": "${ACCOUNT_ID}",
  "platformCommentId": "${platform_comment_id}",
  "platformPostId": "incident-replay-post-${nonce}",
  "commenterPlatformId": "incident-replay-user-${nonce}",
  "messageId": "${message_id}",
  "text": "Incident replay drill payload",
  "sourceVideoTitle": "Incident Replay Drill",
  "commenterUsername": "incident_replay_user"
}
JSON
)
printf '%s\n' "$payload" > "$ARTIFACT_DIR/tiktok-payload.json"

signature=$(printf '%s' "${request_timestamp}.${payload}" | openssl dgst -sha256 -hmac "$TIKTOK_SIGNING_SECRET" | awk '{print $2}')

echo "[incident-rehearsal] sending first TikTok webhook delivery"
first_status=$(curl -sS -o "$ARTIFACT_DIR/tiktok-first-response.json" -w "%{http_code}" \
  -X POST "${APP_URL%/}/api/webhooks/tiktok/comments" \
  -H "content-type: application/json" \
  -H "x-tiktok-signature: ${signature}" \
  -H "x-tiktok-request-timestamp: ${request_timestamp}" \
  --data "$payload" || true)
printf '%s\n' "$first_status" > "$ARTIFACT_DIR/tiktok-first-status.txt"

echo "[incident-rehearsal] replaying same TikTok webhook payload"
second_status=$(curl -sS -o "$ARTIFACT_DIR/tiktok-replay-response.json" -w "%{http_code}" \
  -X POST "${APP_URL%/}/api/webhooks/tiktok/comments" \
  -H "content-type: application/json" \
  -H "x-tiktok-signature: ${signature}" \
  -H "x-tiktok-request-timestamp: ${request_timestamp}" \
  --data "$payload" || true)
printf '%s\n' "$second_status" > "$ARTIFACT_DIR/tiktok-replay-status.txt"

if [[ "$second_status" != "200" ]]; then
  echo "[incident-rehearsal] replay delivery did not return HTTP 200 (got $second_status)"
  cat "$ARTIFACT_DIR/tiktok-replay-response.json" || true
  exit 1
fi

cat > "$ARTIFACT_DIR/summary.txt" <<SUMMARY
Incident runbook rehearsal completed.
APP_URL=$APP_URL
account_id=$ACCOUNT_ID
first_tiktok_status=$first_status
replay_tiktok_status=$second_status
artifacts=$ARTIFACT_DIR
SUMMARY

echo "[incident-rehearsal] complete"
echo "[incident-rehearsal] artifacts: $ARTIFACT_DIR"
