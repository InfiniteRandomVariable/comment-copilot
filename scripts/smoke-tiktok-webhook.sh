#!/usr/bin/env bash
set -euo pipefail

APP_URL="${APP_URL:-http://localhost:3100}"
ENDPOINT="${APP_URL%/}/api/webhooks/tiktok/comments"
VERIFY_CONVEX="${VERIFY_CONVEX:-1}"

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

TIKTOK_SIGNING_SECRET="${TIKTOK_WEBHOOK_SECRET:-${TIKTOK_CLIENT_SECRET:-}}"
if [[ -z "$TIKTOK_SIGNING_SECRET" ]]; then
  echo "Smoke check failed: set TIKTOK_WEBHOOK_SECRET (or TIKTOK_CLIENT_SECRET) for webhook signature."
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
  if [[ -n "${TIKTOK_TEST_ACCOUNT_ID:-}" ]]; then
    echo "$TIKTOK_TEST_ACCOUNT_ID"
    return 0
  fi

  local first_result=""
  local account_id=""

  first_result=$(pnpm exec convex run devSeed:getFirstAccountId --typecheck disable --codegen disable 2>/dev/null || true)
  account_id=$(extract_account_id "$first_result")
  if [[ -n "$account_id" ]]; then
    echo "$account_id"
    return 0
  fi

  local seeded_result=""
  seeded_result=$(pnpm exec convex run devSeed:getOrSeedDefaultAccountId --typecheck disable --codegen disable 2>/dev/null || true)
  account_id=$(extract_account_id "$seeded_result")
  if [[ -n "$account_id" ]]; then
    echo "$account_id"
    return 0
  fi

  echo ""
}

ACCOUNT_ID="$(resolve_account_id)"
if [[ -z "$ACCOUNT_ID" ]]; then
  echo "Smoke check failed: could not resolve an accountId from Convex."
  echo "Set TIKTOK_TEST_ACCOUNT_ID and retry."
  exit 1
fi

nonce="$(date +%s)"
platform_comment_id="smoke-tiktok-comment-${nonce}"
message_id="smoke-tiktok-message-${nonce}"
platform_post_id="smoke-tiktok-post-${nonce}"
commenter_platform_id="smoke-tiktok-user-${nonce}"
commenter_video_id="smoke-tiktok-video-${nonce}"

payload=$(cat <<JSON
{
  "accountId": "${ACCOUNT_ID}",
  "platformCommentId": "${platform_comment_id}",
  "platformPostId": "${platform_post_id}",
  "commenterPlatformId": "${commenter_platform_id}",
  "messageId": "${message_id}",
  "text": "Love this. Where can I buy it?",
  "sourceVideoTitle": "Smoke Test TikTok Video",
  "commenterUsername": "smoke_test_user",
  "commenterLatestVideoId": "${commenter_video_id}",
  "commenterLatestVideoTitle": "Smoke Test Commenter Video"
}
JSON
)

signature=$(printf '%s' "$payload" | openssl dgst -sha256 -hmac "$TIKTOK_SIGNING_SECRET" -binary | base64)

response_file="/tmp/comment_copilot_tiktok_webhook_smoke_response.json"
rm -f "$response_file"

status_code=$(curl -sS -o "$response_file" -w "%{http_code}" \
  -X POST "$ENDPOINT" \
  -H "content-type: application/json" \
  -H "x-tiktok-signature: sha256=${signature}" \
  --data "$payload" || true)

if [[ "$status_code" == "000" ]]; then
  echo "Smoke check failed: could not connect to $ENDPOINT"
  exit 1
fi

if [[ "$status_code" != "200" ]]; then
  echo "Expected HTTP 200 from TikTok webhook endpoint, got: $status_code"
  echo "Response body:"
  cat "$response_file" || true
  exit 1
fi

if ! grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' "$response_file"; then
  echo "Expected response body to include {\"ok\": true}."
  echo "Response body:"
  cat "$response_file" || true
  exit 1
fi

if [[ "$VERIFY_CONVEX" == "1" ]]; then
  found="0"
  for _ in $(seq 1 20); do
    pending_result=$(pnpm exec convex run comments:listInboxComments "{\"accountId\":\"${ACCOUNT_ID}\",\"status\":\"pending_review\"}" --typecheck disable --codegen disable 2>/dev/null || true)

    if echo "$pending_result" | grep -q "$platform_comment_id"; then
      found="1"
      break
    fi

    sleep 1
  done

  if [[ "$found" != "1" ]]; then
    echo "Webhook was accepted but pending_review verification failed."
    echo "Could not find platformCommentId ${platform_comment_id} in comments:listInboxComments status=pending_review."
    exit 1
  fi
fi

echo "Smoke check passed: TikTok webhook accepted and processed for account ${ACCOUNT_ID}."
echo "platformCommentId=${platform_comment_id}"
