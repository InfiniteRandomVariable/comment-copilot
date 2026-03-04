# Production Deploy Checklist

## Scope

Single deployment checklist for Stage 1 covering:

- web app (`apps/web`)
- Convex backend (`convex`)
- notification worker (`apps/worker` `dev:notifications`)

This checklist includes preflight validation, deploy order, rollback steps, and post-deploy monitoring.

## Roles

- Deployer: executes rollout steps.
- Verifier: validates smoke checks and monitoring.
- Incident owner: approves rollback if required.

Do not deploy solo for production changes. Require at least one verifier.

## Preconditions

- Stage boundary checks are green for release commit:
  - `pnpm verify:phase-boundary`
  - `pnpm ci:check`
- Release branch/commit is tagged in incident/change ticket.
- Access to deployment targets for web, Convex, and worker runtimes.

## Preflight Environment Validation

### A) Required shared environment

- `CONVEX_URL`
- `NEXT_PUBLIC_CONVEX_URL`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `SOCIAL_TOKEN_ENCRYPTION_KEY`
- `COMMENT_ORCHESTRATION_MODE`

### B) Webhook/OAuth and provider integration

- `INSTAGRAM_APP_SECRET` or `INSTAGRAM_WEBHOOK_SECRET`
- `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`
- `TIKTOK_CLIENT_SECRET` or `TIKTOK_WEBHOOK_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `AI_API_KEY` and moderation/model envs

### C) Worker-specific

Temporal worker (if `COMMENT_ORCHESTRATION_MODE=temporal`):

- `TEMPORAL_ADDRESS`
- `TEMPORAL_NAMESPACE` (optional default)
- `TEMPORAL_TASK_QUEUE` (optional default)

Notification worker:

- `NOTIFICATION_DELIVERY_MODE`
- `NOTIFICATION_MAX_ATTEMPTS`
- delivery provider credentials (`RESEND_API_KEY` / SES env) if not `log` mode

## Deploy Order (Production)

1. Prepare release artifacts/builds for target commit.
2. Deploy Convex changes first.
3. Deploy web app second.
4. Deploy notification worker third.
5. Deploy Temporal worker when orchestration mode is `temporal` and worker changes are included.
6. Confirm all services report healthy before traffic ramp.

Rationale:

- Convex-first prevents web calling missing backend mutations/queries.
- Web-before-worker allows API surface validation before async processing ramps.

## Rollout Procedure

1. Announce deploy start in ops channel with release SHA and owner.
2. Apply Convex deploy.
3. Deploy web service and wait for healthy instances.
4. Deploy notification worker and confirm process starts without env errors.
5. If applicable, deploy Temporal worker and verify worker connection to queue.
6. Run smoke checks.
7. Start monitoring window.

## Smoke Tests (Required)

Run immediately after rollout:

1. Orchestration health endpoint:

```bash
curl -sS "$APP_URL/api/health/orchestration"
```

Expect `ok: true` and expected mode/config values.

2. Stripe webhook signature enforcement:

```bash
APP_URL="$APP_URL" ./scripts/smoke-stripe-webhook.sh
```

3. TikTok webhook end-to-end smoke:

```bash
APP_URL="$APP_URL" ./scripts/smoke-tiktok-webhook.sh
```

4. Notification worker queue sanity (sample):

```bash
pnpm exec convex run notifications:listPendingNotificationEvents '{"limit":20}' --typecheck disable --codegen disable
```

Expect no abnormal growth in pending events after rollout.

## Post-Deploy Monitoring Window

Minimum monitoring window: 30 minutes.

Track:

- web 5xx and webhook route error rate,
- `GET /api/health/orchestration` stability,
- notification queue backlog (`pending` growth vs drain),
- incident alerts related to OAuth/webhooks/billing.

Document checkpoints at `+5`, `+15`, and `+30` minutes.

## Rollback Criteria

Rollback immediately if one or more are true:

- sustained 5xx or failing webhook smoke checks,
- worker startup failure with no rapid fix,
- queue backlog spike indicating processing failure,
- severe creator-facing regression confirmed by verifier.

## Rollback Steps

1. Announce rollback start with reason and owner.
2. Roll back web service to last known good release.
3. Roll back worker services to matching last known good release.
4. Revert Convex deploy only if schema/function mismatch caused the incident.
5. Re-run smoke tests against rolled-back state.
6. Continue monitoring for 30 minutes and close incident only after stability.

## Exit Criteria

Deployment is complete only when all are true:

- smoke tests pass,
- monitoring window completes without critical regression,
- release ticket includes deploy and verification evidence,
- rollback readiness status is recorded (not needed/executed).

## Evidence To Capture

- release SHA and deploy timestamps,
- smoke test command outputs,
- monitoring window notes,
- rollback notes (if rollback executed).
