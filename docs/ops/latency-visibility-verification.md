# Latency Visibility Verification (Stage 1)

## Scope

Stage 1 Item 2 latency visibility evidence for key routes:

- `POST /api/webhooks/instagram/comments`
- `POST /api/webhooks/tiktok/comments`
- `POST /api/webhooks/stripe`
- `GET /api/health/orchestration`

Goal: provide repeatable steps to collect and attach p50/p95/p99 latency evidence from production logging/monitoring.

## Evidence Standard

For each route, capture:

- p50 latency
- p95 latency
- p99 latency
- query time window (UTC)
- environment and release SHA

Attach screenshots/export links to Stage 1 evidence.

## Data Sources

Preferred:

- production ingress/API gateway metrics
- APM/service monitoring dashboard with route-level percentiles

Fallback:

- structured request logs with response-time field, aggregated in log analytics

Local curl timings are only a sanity check and do not replace percentile evidence.

## Verification Procedure

1. Confirm deployment health:

```bash
curl -sS "$APP_URL/api/health/orchestration"
```

2. Run webhook sanity checks:

```bash
APP_URL="$APP_URL" ./scripts/smoke-tiktok-webhook.sh
APP_URL="$APP_URL" ./scripts/smoke-stripe-webhook.sh
```

3. In monitoring platform, query each route for recent stable traffic window (recommended: last 60 minutes).
4. Record p50/p95/p99 per route.
5. Export or screenshot results with visible timestamps.
6. Attach artifacts to `docs/ops/stage-1-evidence.md` Item 2 row.

## Optional Local Timing Sanity Check

Use only for quick endpoint responsiveness checks:

```bash
curl -sS -o /dev/null -w "time_total=%{time_total}\n" "$APP_URL/api/health/orchestration"
```

This is not percentile-grade evidence and cannot be used alone for Item 2 closure.

## Drill Notes Template

For each verification run, record:

- date/time (UTC):
- environment:
- release SHA:
- route:
- p50/p95/p99:
- artifact link:
- verifier:

## Remaining Requirement To Close Item 2

Item 2 remains incomplete until p50/p95/p99 artifacts are attached for all key routes and owner signoff is recorded.
