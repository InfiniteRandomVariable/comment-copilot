# Webhook Failure Alert Routing

## Scope

Stage 1 Item 2 alert routing baseline for webhook failures on:

- `POST /api/webhooks/instagram/comments`
- `POST /api/webhooks/tiktok/comments`
- `POST /api/webhooks/stripe`

This document defines detection thresholds, routing owners, and escalation timing.

## Detection Signals

Primary detection sources:

- deployment/platform HTTP error-rate dashboards,
- application logs for webhook routes,
- smoke script failure during validation windows:
  - `./scripts/smoke-tiktok-webhook.sh`
  - `./scripts/smoke-stripe-webhook.sh`

Correlated signals:

- sudden growth in pending review backlog,
- creator-reported missing comment ingestion,
- repeated webhook provider retries or signature failures.

## Alert Triggers

Trigger an alert when one or more thresholds are exceeded:

- webhook `5xx` rate >= 5% for 5 minutes on any route,
- sustained route unavailability (`000`/connectivity failures) for 2 minutes,
- two consecutive smoke-check failures in deploy/post-deploy window,
- confirmed missing webhook ingestion for a known valid provider delivery.

## Routing Matrix

- Primary owner: Backend on-call engineer.
- Secondary owner: Product/operations owner.
- Incident commander: assigned by backend on-call at incident start.

Routing by severity:

- `SEV-3` (single-account/limited impact): backend on-call only.
- `SEV-2` (multi-account degraded behavior): backend on-call + product/ops owner.
- `SEV-1` (broad creator impact/data risk): immediate incident channel + leadership escalation.

## Escalation Timeline

- `SEV-3`: escalate to `SEV-2` if unresolved after 30 minutes.
- `SEV-2`: escalate to `SEV-1` if impact widens or unresolved after 30 minutes.
- `SEV-1`: incident commander posts updates every 10 minutes until stabilized.

## Immediate Response Actions

1. Open incident record with timestamp, affected routes, and severity.
2. Execute route health checks:

```bash
curl -sS "$APP_URL/api/health/orchestration"
APP_URL="$APP_URL" ./scripts/smoke-tiktok-webhook.sh
APP_URL="$APP_URL" ./scripts/smoke-stripe-webhook.sh
```

3. Confirm affected account scope via Convex inbox query sampling:

```bash
pnpm exec convex run comments:listInboxComments '{"accountId":"<accountId>","status":"pending_review"}' --typecheck disable --codegen disable
```

4. Route to incident playbook:
   - provider-side degradation -> `docs/ops/provider-outage-runbook.md`
   - replay required -> `docs/ops/webhook-replay-runbook.md`
   - billing/webhook coupling -> `docs/ops/token-billing-incident-runbook.md`

## Drill and Evidence Requirements

For Stage 1 completion, attach:

- one alert-routing drill record (trigger -> route -> owner acknowledgment),
- timestamped owner acknowledgment evidence,
- linked incident timeline showing escalation path and final severity.

## Current Status

Alert routing policy is documented in this file. Drill execution evidence and owner signoff remain required before Item 2 can move to `Done`.
