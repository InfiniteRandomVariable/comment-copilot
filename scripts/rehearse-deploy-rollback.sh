#!/usr/bin/env bash
set -euo pipefail

APP_URL="${APP_URL:-http://localhost:3100}"
ARTIFACT_DIR="${ARTIFACT_DIR:-/tmp/comment_copilot_deploy_rehearsal}"
WEB_START_TIMEOUT_SECS="${WEB_START_TIMEOUT_SECS:-90}"
WORKER_START_TIMEOUT_SECS="${WORKER_START_TIMEOUT_SECS:-45}"
WORKER_READY_PATTERN="${WORKER_READY_PATTERN:-worker started}"
ALLOW_OVERWRITE="${ALLOW_OVERWRITE:-0}"

WEB_PID=""
WORKER_PID=""

mkdir -p "$ARTIFACT_DIR"
if [[ -n "$(find "$ARTIFACT_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]] && [[ "$ALLOW_OVERWRITE" != "1" ]]; then
  echo "[deploy-rehearsal] artifact directory is not empty: $ARTIFACT_DIR"
  echo "[deploy-rehearsal] set ALLOW_OVERWRITE=1 to reuse this directory"
  exit 1
fi

stop_pid() {
  local pid="$1"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
}

cleanup() {
  stop_pid "$WORKER_PID"
  stop_pid "$WEB_PID"
}

trap cleanup EXIT

wait_for_health() {
  local pid="$1"
  local timeout_secs="$2"
  local probe_file="$ARTIFACT_DIR/health-probe.json"
  local health_url="${APP_URL%/}/api/health/orchestration"
  local start_ts
  start_ts=$(date +%s)

  while true; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "[deploy-rehearsal] web process exited before becoming healthy"
      return 1
    fi

    status_code=$(curl -s -o "$probe_file" -w "%{http_code}" "$health_url" || true)
    if [[ "$status_code" == "200" ]] && grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' "$probe_file"; then
      return 0
    fi

    now_ts=$(date +%s)
    if (( now_ts - start_ts >= timeout_secs )); then
      echo "[deploy-rehearsal] timed out waiting for healthy web endpoint: $health_url"
      [[ -f "$probe_file" ]] && cat "$probe_file" || true
      return 1
    fi

    sleep 2
  done
}

wait_for_log_pattern() {
  local pid="$1"
  local log_file="$2"
  local pattern="$3"
  local timeout_secs="$4"
  local start_ts
  start_ts=$(date +%s)

  while true; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "[deploy-rehearsal] process exited before ready pattern was observed"
      return 1
    fi

    if grep -Eq "$pattern" "$log_file" 2>/dev/null; then
      return 0
    fi

    now_ts=$(date +%s)
    if (( now_ts - start_ts >= timeout_secs )); then
      echo "[deploy-rehearsal] timed out waiting for pattern '$pattern' in $log_file"
      tail -n 120 "$log_file" || true
      return 1
    fi

    sleep 2
  done
}

start_web() {
  local log_file="$1"
  echo "[deploy-rehearsal] starting web: $log_file"
  pnpm dev:web >"$log_file" 2>&1 &
  WEB_PID=$!
  wait_for_health "$WEB_PID" "$WEB_START_TIMEOUT_SECS"
}

start_worker() {
  local log_file="$1"
  echo "[deploy-rehearsal] starting notification worker: $log_file"
  pnpm dev:notifications >"$log_file" 2>&1 &
  WORKER_PID=$!
  wait_for_log_pattern "$WORKER_PID" "$log_file" "$WORKER_READY_PATTERN" "$WORKER_START_TIMEOUT_SECS"
}

echo "[deploy-rehearsal] syncing web env"
pnpm sync:web:env | tee "$ARTIFACT_DIR/sync-web-env.log"

start_web "$ARTIFACT_DIR/dev-web-1.log"
start_worker "$ARTIFACT_DIR/dev-notifications-1.log"

curl -sS "${APP_URL%/}/api/health/orchestration" > "$ARTIFACT_DIR/health-before.json"
APP_URL="$APP_URL" ./scripts/smoke-stripe-webhook.sh | tee "$ARTIFACT_DIR/stripe-smoke-before.log"

echo "[deploy-rehearsal] restarting web for rollback rehearsal"
stop_pid "$WEB_PID"
WEB_PID=""
start_web "$ARTIFACT_DIR/dev-web-2.log"
curl -sS "${APP_URL%/}/api/health/orchestration" > "$ARTIFACT_DIR/health-after-web-restart.json"
APP_URL="$APP_URL" ./scripts/smoke-stripe-webhook.sh | tee "$ARTIFACT_DIR/stripe-smoke-after-web-restart.log"

echo "[deploy-rehearsal] restarting notification worker for rollback rehearsal"
stop_pid "$WORKER_PID"
WORKER_PID=""
start_worker "$ARTIFACT_DIR/dev-notifications-2.log"

cat > "$ARTIFACT_DIR/summary.txt" <<SUMMARY
Deploy rollback rehearsal completed.
APP_URL=$APP_URL
web_pid_final=$WEB_PID
worker_pid_final=$WORKER_PID
artifacts=$ARTIFACT_DIR
SUMMARY

echo "[deploy-rehearsal] complete"
echo "[deploy-rehearsal] artifacts: $ARTIFACT_DIR"
