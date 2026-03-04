#!/usr/bin/env bash
set -euo pipefail

APP_URL="${APP_URL:-http://localhost:3100}"
ENDPOINT="${APP_URL%/}/api/webhooks/stripe"

payload='{"id":"evt_smoke_test","type":"checkout.session.completed","data":{"object":{}}}'
response_file="/tmp/comment_copilot_stripe_smoke_response.json"
rm -f "$response_file"

status_code=$(curl -sS -o "$response_file" -w "%{http_code}" \
  -X POST "$ENDPOINT" \
  -H "content-type: application/json" \
  --data "$payload" || true)

if [[ "$status_code" == "000" ]]; then
  echo "Smoke check failed: could not connect to $ENDPOINT"
  exit 1
fi

if [[ "$status_code" != "400" ]]; then
  echo "Expected HTTP 400 when stripe-signature is missing, got: $status_code"
  echo "Response body:"
  cat "$response_file" || true
  exit 1
fi

echo "Smoke check passed: webhook endpoint is live and signature enforcement is active (HTTP 400 without signature)."
