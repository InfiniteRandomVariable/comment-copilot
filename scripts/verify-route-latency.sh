#!/usr/bin/env bash
set -euo pipefail

APP_URL="${APP_URL:-http://localhost:3100}"
SAMPLES="${SAMPLES:-25}"

if ! [[ "$SAMPLES" =~ ^[0-9]+$ ]] || [[ "$SAMPLES" -le 0 ]]; then
  echo "SAMPLES must be a positive integer. Received: $SAMPLES"
  exit 1
fi

tmp_dir="$(mktemp -d /tmp/comment_copilot_latency_XXXXXX)"
trap 'rm -rf "$tmp_dir"' EXIT

percentile_from_sorted_file() {
  local file="$1"
  local pct="$2"
  local count
  count="$(wc -l < "$file" | tr -d ' ')"
  if [[ "$count" -eq 0 ]]; then
    echo "n/a"
    return 0
  fi

  local idx=$(( (pct * count + 99) / 100 ))
  if [[ "$idx" -lt 1 ]]; then idx=1; fi
  if [[ "$idx" -gt "$count" ]]; then idx="$count"; fi
  sed -n "${idx}p" "$file"
}

avg_from_file() {
  local file="$1"
  awk '{ sum += $1 } END { if (NR == 0) print "n/a"; else printf "%.2f", sum / NR }' "$file"
}

status_summary() {
  local file="$1"
  awk '
    { counts[$1] += 1 }
    END {
      first = 1
      for (code in counts) {
        if (!first) printf ","
        printf "%sx%d", code, counts[code]
        first = 0
      }
      if (first) printf "n/a"
    }
  ' "$file"
}

measure_route() {
  local label="$1"
  local method="$2"
  local path="$3"
  local data="${4:-}"

  local timings_file="$tmp_dir/${label}.timings"
  local status_file="$tmp_dir/${label}.status"
  : > "$timings_file"
  : > "$status_file"

  local url="${APP_URL%/}${path}"

  for _ in $(seq 1 "$SAMPLES"); do
    local response
    if [[ "$method" == "GET" ]]; then
      response="$(curl -sS -o /dev/null -w "%{http_code} %{time_total}" "$url" || true)"
    else
      response="$(curl -sS -o /dev/null -w "%{http_code} %{time_total}" \
        -X "$method" \
        -H "content-type: application/json" \
        --data "$data" \
        "$url" || true)"
    fi

    local status time_sec
    status="$(echo "$response" | awk '{print $1}')"
    time_sec="$(echo "$response" | awk '{print $2}')"

    if [[ -z "$status" || "$status" == "000" || -z "$time_sec" ]]; then
      echo "Route latency verification failed: could not reach ${url}"
      exit 1
    fi

    awk -v t="$time_sec" 'BEGIN { printf "%.2f\n", t * 1000 }' >> "$timings_file"
    echo "$status" >> "$status_file"
  done

  sort -n "$timings_file" -o "$timings_file"

  local p50 p95 p99 avg statuses
  p50="$(percentile_from_sorted_file "$timings_file" 50)"
  p95="$(percentile_from_sorted_file "$timings_file" 95)"
  p99="$(percentile_from_sorted_file "$timings_file" 99)"
  avg="$(avg_from_file "$timings_file")"
  statuses="$(status_summary "$status_file")"

  echo "| ${path} | ${method} | ${p50} | ${p95} | ${p99} | ${avg} | ${statuses} |"
}

echo "Route latency verification"
echo "- app_url: ${APP_URL}"
echo "- samples_per_route: ${SAMPLES}"
echo
echo "| Route | Method | p50_ms | p95_ms | p99_ms | avg_ms | statuses |"
echo "| --- | --- | ---: | ---: | ---: | ---: | --- |"
measure_route "health_orchestration" "GET" "/api/health/orchestration"
measure_route "stripe_webhook" "POST" "/api/webhooks/stripe" "{}"
measure_route "instagram_webhook" "POST" "/api/webhooks/instagram/comments" "{}"
measure_route "tiktok_webhook" "POST" "/api/webhooks/tiktok/comments" "{}"
