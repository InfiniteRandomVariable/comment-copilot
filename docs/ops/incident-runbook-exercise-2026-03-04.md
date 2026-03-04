# Incident Runbook Exercise Evidence (2026-03-04)

## Stage Scope

- Stage: `stage-1`
- Scope item: `3` (incident runbooks)
- Exercise date: 2026-03-04

## Exercise Coverage

- Webhook replay drill
- Provider outage/degraded dependency triage signal checks
- Token/billing diagnostics via usage summary query

## Walkthrough Status

| Scenario | Runbook | Status | Evidence |
| --- | --- | --- | --- |
| Webhook replay | `docs/ops/webhook-replay-runbook.md` | PASS | `/tmp/stage1_item3_incident_runbook_exercise_20260304_v3/tiktok-first-response.json`, `/tmp/stage1_item3_incident_runbook_exercise_20260304_v3/tiktok-replay-response.json` |
| Provider outage triage signals | `docs/ops/incident-triage-escalation-flow.md` | PASS | `/tmp/stage1_item3_incident_runbook_exercise_20260304_v3/orchestration-health.json`, `/tmp/stage1_item3_incident_runbook_exercise_20260304_v3/stripe-smoke.log` |
| Token/billing diagnostics | `docs/ops/incident-triage-escalation-flow.md` | PASS | `/tmp/stage1_item3_incident_runbook_exercise_20260304_v3/billing-usage-summary.json` |

## Commands Executed

```bash
pnpm dev:web
ARTIFACT_DIR=/tmp/stage1_item3_incident_runbook_exercise_20260304_v3 APP_URL=http://localhost:3100 pnpm rehearse:incident:runbooks
```

## Dry-Run Results

- Health check passed (`/api/health/orchestration` returned HTTP 200 with `ok=true`).
- Billing summary query returned expected structured usage data for month `2026-03`.
- Stripe webhook smoke passed (`HTTP 400` without signature as expected).
- TikTok webhook replay drill via automated script:
  - first delivery: HTTP `500`
  - replay of same payload/signature: HTTP `200`
- Re-running against a non-empty artifact directory fails fast unless `ALLOW_OVERWRITE=1` is set.

## Artifact Paths

- `/tmp/stage1_item3_incident_runbook_exercise_20260304_v3/orchestration-health.json`
- `/tmp/stage1_item3_incident_runbook_exercise_20260304_v3/account-raw.json`
- `/tmp/stage1_item3_incident_runbook_exercise_20260304_v3/account-id.txt`
- `/tmp/stage1_item3_incident_runbook_exercise_20260304_v3/billing-usage-summary.json`
- `/tmp/stage1_item3_incident_runbook_exercise_20260304_v3/stripe-smoke.log`
- `/tmp/stage1_item3_incident_runbook_exercise_20260304_v3/stripe-smoke-exit.txt`
- `/tmp/stage1_item3_incident_runbook_exercise_20260304_v3/tiktok-first-status.txt`
- `/tmp/stage1_item3_incident_runbook_exercise_20260304_v3/tiktok-first-response.json`
- `/tmp/stage1_item3_incident_runbook_exercise_20260304_v3/tiktok-replay-status.txt`
- `/tmp/stage1_item3_incident_runbook_exercise_20260304_v3/tiktok-replay-response.json`
- `/tmp/stage1_item3_incident_runbook_exercise_20260304_v3/tiktok-payload.json`
- `/tmp/stage1_item3_incident_runbook_exercise_20260304_v3/summary.txt`

## Conclusion

Stage 1 Item 3 runbook exercises were executed with recorded outputs for replay, outage triage checks, and billing diagnostics using an automated rehearsal command. Owner signoff remains pending before marking Item 3 `Done`.
