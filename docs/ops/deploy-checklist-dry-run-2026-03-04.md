# Deploy Checklist Dry-Run Evidence (2026-03-04)

## Stage Scope

- Stage: `stage-1`
- Scope item: `4` (production deploy/environment checklist)
- Exercise date: 2026-03-04

## Commands Executed

```bash
pnpm sync:web:env
pnpm dev:web
pnpm dev:notifications
curl -sS http://localhost:3100/api/health/orchestration
pnpm exec convex run devSeed:getFirstAccountId --typecheck disable --codegen disable
APP_URL=http://localhost:3100 pnpm smoke:stripe:webhook
ARTIFACT_DIR=/tmp/stage1_item4_deploy_checklist_verify_20260304 APP_URL=http://localhost:3100 VERIFY_CONVEX=0 pnpm verify:deploy:checklist
ARTIFACT_DIR=/tmp/stage1_item4_deploy_rehearsal_20260304_v3 APP_URL=http://localhost:3100 pnpm rehearse:deploy:rollback
```

## Dry-Run Results

- Env sync completed (`apps/web/.env.local` already in sync).
- Web startup succeeded before and after restart.
- Notification worker startup succeeded before and after restart (`worker started`).
- Orchestration health endpoint returned `ok=true` before and after web restart.
- Stripe webhook smoke passed before and after web restart (`exit=0` both runs).
- Convex API reachability check succeeded (`devSeed:getFirstAccountId` returned account metadata).
- Consolidated deploy-checklist verification passed with runtime checks (`verify:phase-boundary`, env sync, health, stripe smoke).
- Automated rollback rehearsal script completed with PID-scoped web/worker restarts and successful post-restart health + smoke checks.
- Re-running against a non-empty artifact directory fails fast unless `ALLOW_OVERWRITE=1` is set.

## Rollback Rehearsal Outcome

- Rehearsed web rollback by restarting web process and re-running health + smoke checks.
- Rehearsed notification worker rollback by restarting worker and confirming startup log.
- Automated rehearsal avoids broad `pkill` usage by managing process lifecycles via captured PIDs.
- Post-rollback validations remained green.

## Noted Risk During Optional Local Convex-Dev Rehearsal

A separate optional local `pnpm dev:convex` attempt failed with schema validation mismatch on existing `notificationEvents.eventType="webhook_processing_failed"` data:

- artifact: `/tmp/stage1_item4_deploy_dryrun_20260304/convex-dev.log`

This indicates local branch/schema drift relative to active data; deploy checklist now explicitly requires Convex compatibility checks as part of pre-deploy verification.

## Artifact Paths

Primary dry-run artifacts:

- `/tmp/stage1_item4_deploy_dryrun_20260304_v3/sync-web-env.log`
- `/tmp/stage1_item4_deploy_dryrun_20260304_v3/dev-web-1.log`
- `/tmp/stage1_item4_deploy_dryrun_20260304_v3/dev-web-2.log`
- `/tmp/stage1_item4_deploy_dryrun_20260304_v3/dev-notifications-1.log`
- `/tmp/stage1_item4_deploy_dryrun_20260304_v3/dev-notifications-2.log`
- `/tmp/stage1_item4_deploy_dryrun_20260304_v3/health-before.json`
- `/tmp/stage1_item4_deploy_dryrun_20260304_v3/health-after-web-restart.json`
- `/tmp/stage1_item4_deploy_dryrun_20260304_v3/stripe-smoke-before.log`
- `/tmp/stage1_item4_deploy_dryrun_20260304_v3/stripe-smoke-after-web-restart.log`
- `/tmp/stage1_item4_deploy_dryrun_20260304_v3/summary.txt`

Consolidated deploy-checklist verification artifacts:

- `/tmp/stage1_item4_deploy_checklist_verify_20260304/phase-boundary.log`
- `/tmp/stage1_item4_deploy_checklist_verify_20260304/sync-web-env.log`
- `/tmp/stage1_item4_deploy_checklist_verify_20260304/orchestration-health.json`
- `/tmp/stage1_item4_deploy_checklist_verify_20260304/stripe-smoke.log`

Automated rollback rehearsal artifacts:

- `/tmp/stage1_item4_deploy_rehearsal_20260304_v3/sync-web-env.log`
- `/tmp/stage1_item4_deploy_rehearsal_20260304_v3/dev-web-1.log`
- `/tmp/stage1_item4_deploy_rehearsal_20260304_v3/dev-web-2.log`
- `/tmp/stage1_item4_deploy_rehearsal_20260304_v3/dev-notifications-1.log`
- `/tmp/stage1_item4_deploy_rehearsal_20260304_v3/dev-notifications-2.log`
- `/tmp/stage1_item4_deploy_rehearsal_20260304_v3/health-before.json`
- `/tmp/stage1_item4_deploy_rehearsal_20260304_v3/health-after-web-restart.json`
- `/tmp/stage1_item4_deploy_rehearsal_20260304_v3/stripe-smoke-before.log`
- `/tmp/stage1_item4_deploy_rehearsal_20260304_v3/stripe-smoke-after-web-restart.log`
- `/tmp/stage1_item4_deploy_rehearsal_20260304_v3/summary.txt`

Optional convex-dev rehearsal artifact:

- `/tmp/stage1_item4_deploy_dryrun_20260304/convex-dev.log`

## Conclusion

Stage 1 Item 4 checklist and rollback rehearsal evidence are now documented, including consolidated deploy-checklist verification artifacts and automated rollback rehearsal artifacts. Owner signoff remains pending before Item 4 can be marked `Done`.
