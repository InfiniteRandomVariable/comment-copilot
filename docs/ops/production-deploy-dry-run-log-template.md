# Production Deploy Dry-Run Log Template

## Purpose

Template for capturing Stage 1 Item 4 dry-run and rollback rehearsal evidence tied to:

- `docs/ops/production-deploy-checklist.md`

Use one filled record per rehearsal run and attach it in Stage 1 evidence.

## Dry-Run Record

- Date (UTC):
- Environment:
- Release SHA:
- Deployer:
- Verifier:
- Incident Owner:

### Preflight Validation

- `pnpm verify:phase-boundary`: `PASS | FAIL`
- `pnpm ci:check`: `PASS | FAIL`
- Required env variables validated: `YES | NO`
- Notes:

### Deploy Order Rehearsal

Record completion and timestamp for each:

1. Convex deploy simulated/applied: `DONE | FAIL`
2. Web deploy simulated/applied: `DONE | FAIL`
3. Notification worker deploy simulated/applied: `DONE | FAIL`
4. Temporal worker deploy (if applicable): `DONE | N/A | FAIL`

Notes:

### Smoke Checks

- `curl -sS "$APP_URL/api/health/orchestration"`: `PASS | FAIL`
- `APP_URL="$APP_URL" ./scripts/smoke-stripe-webhook.sh`: `PASS | FAIL`
- `APP_URL="$APP_URL" ./scripts/smoke-tiktok-webhook.sh`: `PASS | FAIL`
- `notifications:listPendingNotificationEvents` sanity check: `PASS | FAIL`

Notes:

### Monitoring Window

- +5 min check: `PASS | FAIL`
- +15 min check: `PASS | FAIL`
- +30 min check: `PASS | FAIL`
- Observed regressions: `NONE | YES (details)`

Notes:

### Rollback Rehearsal

- Rollback trigger used:
- Web rollback rehearsal: `PASS | FAIL`
- Worker rollback rehearsal: `PASS | FAIL`
- Convex rollback decision logic validated: `PASS | FAIL`
- Post-rollback smoke checks: `PASS | FAIL`

Notes:

## Outcome

- Dry-run result: `PASS | FAIL`
- Rollback rehearsal result: `PASS | FAIL`
- Follow-up actions:
  1.
  2.
- Owner signoff: `APPROVED | PENDING`
- Signoff date (UTC):

## Attachment Checklist

- command outputs/screenshots attached
- monitoring snapshots attached
- rollback rehearsal notes attached
- links recorded in `docs/ops/stage-1-evidence.md` Item 4
