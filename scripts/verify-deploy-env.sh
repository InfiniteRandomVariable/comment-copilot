#!/usr/bin/env bash
set -euo pipefail

load_env_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$file"
    set +a
  fi
}

load_env_file ".env.local"
load_env_file "apps/web/.env.local"

missing=0

require_var() {
  local key="$1"
  local value="${!key:-}"
  if [[ -z "$value" ]]; then
    echo "Missing required env: $key"
    missing=$((missing + 1))
  fi
}

require_any() {
  local first="$1"
  local second="$2"
  local first_value="${!first:-}"
  local second_value="${!second:-}"
  if [[ -z "$first_value" && -z "$second_value" ]]; then
    echo "Missing required env: set $first or $second"
    missing=$((missing + 1))
  fi
}

mode="$(echo "${COMMENT_ORCHESTRATION_MODE:-temporal}" | tr '[:upper:]' '[:lower:]')"
if [[ "$mode" != "inline" && "$mode" != "temporal" ]]; then
  mode="temporal"
fi

echo "Checking deploy env for mode=$mode"

# Core web + Convex
require_any "CONVEX_URL" "NEXT_PUBLIC_CONVEX_URL"
require_var "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
require_var "CLERK_SECRET_KEY"
require_var "SOCIAL_TOKEN_ENCRYPTION_KEY"

# Webhook security and billing
require_var "STRIPE_SECRET_KEY"
require_var "STRIPE_WEBHOOK_SECRET"
require_var "INSTAGRAM_WEBHOOK_SECRET"
require_any "TIKTOK_WEBHOOK_SECRET" "TIKTOK_CLIENT_SECRET"

# Reply send integrations
require_var "INSTAGRAM_COMMENT_REPLY_URL_TEMPLATE"
require_var "TIKTOK_COMMENT_REPLY_URL"

# Explicit AI provider config (required for deploy readiness)
require_var "AI_API_KEY"
require_var "AI_MODEL"
require_var "AI_CHAT_COMPLETIONS_URL"
require_var "AI_MODERATION_MODEL"
require_var "AI_MODERATION_URL"

# Temporal mode requirements
if [[ "$mode" == "temporal" ]]; then
  require_var "TEMPORAL_ADDRESS"
  require_var "TEMPORAL_NAMESPACE"
fi

# Notification worker requirements
delivery_mode="$(echo "${NOTIFICATION_DELIVERY_MODE:-log}" | tr '[:upper:]' '[:lower:]')"
if [[ "$delivery_mode" == "resend" ]]; then
  require_var "RESEND_API_KEY"
  require_var "NOTIFICATION_FROM_EMAIL"
elif [[ "$delivery_mode" == "ses" ]]; then
  require_var "SES_REGION"
  if [[ -z "${SES_FROM_EMAIL:-}" && -z "${NOTIFICATION_FROM_EMAIL:-}" ]]; then
    echo "Missing required env: set SES_FROM_EMAIL or NOTIFICATION_FROM_EMAIL for SES delivery"
    missing=$((missing + 1))
  fi
fi

if [[ "$missing" -gt 0 ]]; then
  echo "Deploy env verification failed with $missing missing requirement(s)."
  exit 1
fi

echo "Deploy env verification passed."
