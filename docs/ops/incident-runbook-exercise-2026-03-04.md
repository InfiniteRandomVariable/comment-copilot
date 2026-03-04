# Incident Runbook Exercise Evidence (2026-03-04)

## Stage Scope

- Stage: `stage-1`
- Scope item: `3` (incident runbooks)
- Exercise date: 2026-03-04

## Exercise Coverage

- Webhook replay drill
- Provider outage/degraded dependency drill
- Token/billing diagnostic drill

## Walkthrough Status

| Scenario | Runbook | Status | Evidence |
| --- | --- | --- | --- |
| Webhook replay | `docs/ops/webhook-replay-runbook.md` | PASS | `/tmp/stage1_item3_incident_runbook_exercise_20260304/tiktok-first-response.json`, `/tmp/stage1_item3_incident_runbook_exercise_20260304/tiktok-replay-response.json` |
| Provider outage triage | `docs/ops/provider-outage-runbook.md` | PASS | `/tmp/stage1_item3_incident_runbook_exercise_20260304/orchestration-health.json`, `/tmp/stage1_item3_incident_runbook_exercise_20260304/stripe-smoke.log` |
| Token/billing diagnostics | `docs/ops/token-billing-incident-runbook.md` | PASS | `/tmp/stage1_item3_incident_runbook_exercise_20260304/billing-usage-summary.json` |

## Commands Executed

```bash
pnpm dev:convex
pnpm dev:web
curl -sS http://localhost:3100/api/health/orchestration
pnpm exec convex run devSeed:getFirstAccountId --typecheck disable --codegen disable
pnpm exec convex run billing:getUsageSummary "{\"accountId\":\"j5746ef9edrcmn7mase0qcm0t1822tb7\"}" --typecheck disable --codegen disable
APP_URL=http://localhost:3100 pnpm smoke:stripe:webhook
curl -sS -o /tmp/stage1_item3_incident_runbook_exercise_20260304/tiktok-first-response.json -w "%{http_code}" -X POST http://localhost:3100/api/webhooks/tiktok/comments ...
curl -sS -o /tmp/stage1_item3_incident_runbook_exercise_20260304/tiktok-replay-response.json -w "%{http_code}" -X POST http://localhost:3100/api/webhooks/tiktok/comments ...
```

## Results

- Health check: `ok=true`, orchestration mode `inline`.
- Billing summary query returned expected structured usage data for month `2026-03`.
- Stripe webhook smoke test passed (`HTTP 400` without signature as expected).
- TikTok webhook replay drill:
  - first delivery: HTTP `500`, error `AI_CHAT_COMPLETIONS_URL is not set for worker generation`
  - replay of same payload/signature: HTTP `200`, response `{ "ok": true }`

## Artifact Paths

- `/tmp/stage1_item3_incident_runbook_exercise_20260304/orchestration-health.json`
- `/tmp/stage1_item3_incident_runbook_exercise_20260304/account-raw.json`
- `/tmp/stage1_item3_incident_runbook_exercise_20260304/account-id.txt`
- `/tmp/stage1_item3_incident_runbook_exercise_20260304/billing-usage-summary.json`
- `/tmp/stage1_item3_incident_runbook_exercise_20260304/stripe-smoke.log`
- `/tmp/stage1_item3_incident_runbook_exercise_20260304/stripe-smoke-exit.txt`
- `/tmp/stage1_item3_incident_runbook_exercise_20260304/tiktok-first-status.txt`
- `/tmp/stage1_item3_incident_runbook_exercise_20260304/tiktok-first-response.json`
- `/tmp/stage1_item3_incident_runbook_exercise_20260304/tiktok-replay-status.txt`
- `/tmp/stage1_item3_incident_runbook_exercise_20260304/tiktok-replay-response.json`
- `/tmp/stage1_item3_incident_runbook_exercise_20260304/dev-web.tail.log`

## Conclusion

Stage 1 Item 3 runbook exercises were executed with recorded outputs for replay, outage triage signal checks, and billing diagnostics. Owner signoff remains pending before marking Item 3 `Done`.
