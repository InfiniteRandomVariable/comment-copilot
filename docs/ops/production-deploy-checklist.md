# Production Deploy Checklist

## Scope

This checklist covers production deployment readiness and rollout for:

- `apps/web` (Next.js API/webhooks)
- Convex backend functions/schema
- notification worker (`pnpm dev:notifications` runtime)
- comment orchestration mode (`inline` or `temporal`)

## Pre-Deploy (Required)

1. Confirm active stage policy and boundary:
   - `pnpm verify:phase-boundary`
2. Run full quality gate:
   - `pnpm ci:check`
3. Verify production env contract:
   - `pnpm verify:deploy:env`
4. Confirm orchestration mode and required processes:
   - `inline`: web + Convex + notification worker
   - `temporal`: web + Convex + notification worker + worker service
5. Confirm deploy window owner + rollback owner are assigned.

## Deploy Order

1. Deploy Convex changes first (schema/functions) if included in release.
2. Deploy `apps/web` release.
3. Ensure notification worker is running with updated env/config.
4. If mode is `temporal`, ensure worker service is running and healthy.

## Post-Deploy Validation (Required)

1. Orchestration health:
   - `curl -fsS https://<app-domain>/api/health/orchestration`
   - Confirm `ok: true` and expected mode.
2. Webhook smoke checks:
   - `APP_URL=https://<app-domain> ./scripts/smoke-stripe-webhook.sh`
   - `APP_URL=https://<app-domain> ./scripts/smoke-tiktok-webhook.sh`
3. Review logs/alerts for:
   - webhook 5xx spikes,
   - workflow start failures,
   - notification worker send failures.
4. Monitor for 30 minutes minimum before declaring rollout complete.

## Rollback Triggers

Trigger rollback if any occurs during rollout window:

- smoke checks fail,
- sustained webhook 5xx errors,
- workflow processing not reaching expected states,
- notification worker cannot process pending events.

## Rollback Steps

1. Halt further rollout traffic.
2. Revert `apps/web` to last known good release.
3. Revert Convex deployment only if release included incompatible schema/function changes.
4. Revert orchestration mode to last known good value if mode change was included.
5. Verify rollback health:
   - `curl -fsS https://<app-domain>/api/health/orchestration`
   - `APP_URL=https://<app-domain> ./scripts/smoke-stripe-webhook.sh`
   - `APP_URL=https://<app-domain> ./scripts/smoke-tiktok-webhook.sh`
6. Record incident + remediation notes in Stage 1 evidence.

## Exit Criteria

All must be true:

- pre-deploy checks passed,
- deploy order completed,
- post-deploy validation passed,
- no rollback triggers active,
- evidence record updated with date, commands, and owner signoff status.
