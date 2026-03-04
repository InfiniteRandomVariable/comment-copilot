# Production Deploy and Environment Checklist

## Purpose

Single operational checklist for deploying web + Convex + notification worker with validation and rollback controls.

## Ownership

- Primary: App On-Call Engineer
- Secondary: Platform/Infra Owner

## Pre-Deploy Gate

1. Confirm phase-policy gate is green:

```bash
pnpm verify:phase-boundary
pnpm ci:check
```

2. Verify env sync and required variables are present for target environment:

```bash
pnpm sync:web:env
```

Required groups:

- Web/Orchestration: `COMMENT_ORCHESTRATION_MODE`, `CONVEX_URL` or `NEXT_PUBLIC_CONVEX_URL`
- Webhooks: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, platform webhook secrets
- Notifications: `NOTIFICATION_DELIVERY_MODE`, SES or Resend credentials as configured
- AI/Worker: generation and moderation endpoint/API key variables

3. Convex readiness check (deployment/API reachability):

```bash
pnpm exec convex run devSeed:getFirstAccountId --typecheck disable --codegen disable
```

4. Run consolidated deploy-checklist verification (runtime checks require web service up):

```bash
APP_URL=http://<app-url> VERIFY_CONVEX=0 pnpm verify:deploy:checklist
```

## Deploy Order

1. Deploy Convex functions/schema changes.
2. Deploy web app.
3. Deploy notification worker.
4. Verify end-to-end smoke checks.

## Smoke Checks

Run after deploy and again after any rollback action:

```bash
curl -sS http://<app-url>/api/health/orchestration
APP_URL=http://<app-url> pnpm smoke:stripe:webhook
APP_URL=http://<app-url> VERIFY_CONVEX=0 pnpm verify:deploy:checklist
```

Expected:

- Health route returns `{"ok": true, ...}`.
- Stripe smoke returns pass message with expected HTTP 400 signature enforcement behavior.
- Consolidated verification exits with code 0 and records artifacts.

## Rollback Procedure

Trigger rollback if smoke checks fail, error rates spike, or critical workflows regress.

1. Roll back web to last known good build/version.
2. Roll back notification worker to last known good build/version.
3. If deploy included Convex schema/function changes, roll forward with a compatibility fix rather than destructive schema rollback.
4. Re-run smoke checks and capture outputs.

## Post-Deploy Monitoring Window

Monitor for at least 30 minutes:

- API error rates and webhook statuses
- Notification worker send/retry errors
- Billing/webhook signature edge behavior

If stable for one full window, mark deploy complete.

## Evidence Requirements

Capture and link:

- exact commands run
- smoke outputs
- rollback rehearsal notes/results
- consolidated verification artifact directory
- incident/escalation notes if triggered
