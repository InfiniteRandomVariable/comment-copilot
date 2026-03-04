# Observability Baseline Verification (Stage 1)

## Scope

Stage 1 Item 2 observability baseline for:

- error signal visibility,
- request latency visibility by key routes,
- webhook failure detection and routing.

Current status: **partial**. This document captures what is available now, verification commands, and known gaps still required for Item 2 completion.

## Current Signals (Implemented)

### Error visibility

- Webhook and OAuth APIs return explicit error responses with status codes.
- Worker processes log fatal startup/runtime errors to stderr.
- Inbox send path emits structured telemetry events (`inbox_send.*`) for dedupe, send success, and receipt/audit failures.

### Runtime health visibility

- `GET /api/health/orchestration` reports:
  - resolved orchestration mode,
  - mode source (`env` or default fallback),
  - Temporal config defaults and warnings.

### Webhook failure detection baseline

- smoke scripts verify webhook route behavior:
  - `scripts/smoke-tiktok-webhook.sh`
  - `scripts/smoke-stripe-webhook.sh`

## Verification Commands

Run from repo root:

1. Required quality gate:

```bash
pnpm ci:check
```

2. Orchestration runtime health:

```bash
curl -sS "$APP_URL/api/health/orchestration"
```

3. Webhook route smoke checks:

```bash
APP_URL="$APP_URL" ./scripts/smoke-tiktok-webhook.sh
APP_URL="$APP_URL" ./scripts/smoke-stripe-webhook.sh
```

4. Inbox send telemetry summary from log file:

```bash
pnpm report:web:inbox-send:telemetry -- <log-file-path>
```

## Latency Visibility Baseline

Key routes:

- `/api/webhooks/instagram/comments`
- `/api/webhooks/tiktok/comments`
- `/api/webhooks/stripe`
- `/api/health/orchestration`

Current approach is log-platform derived (ingress/app logs) rather than an in-repo metrics exporter. For Stage 1 completion, capture p50/p95/p99 for these routes from your deployment logging/monitoring platform and attach snapshots/queries to Stage 1 evidence.

## Alert Routing Baseline

Routing currently relies on:

- on-call triage process: `docs/ops/incident-triage-escalation-flow.md`
- outage response runbook: `docs/ops/provider-outage-runbook.md`
- token/billing escalation path: `docs/ops/token-billing-incident-runbook.md`

## Remaining Gaps To Close Item 2

- runtime-verified error tracking integration evidence attached.
- route-level p50/p95/p99 evidence for key webhook/health paths attached.
- tested webhook failure alert routing artifact attached (owner + destination + drill output).
