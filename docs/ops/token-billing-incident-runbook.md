# Token and Billing Incident Runbook

## Purpose

Handle incidents involving token usage limits, billing state mismatches, or Stripe event processing anomalies.

## Trigger Conditions

Start this runbook when:

- Users report unexpected generation pauses or cap enforcement.
- Billing plan/status appears incorrect in app vs Stripe state.
- Stripe webhook processing is failing, delayed, or deduping unexpectedly.

## Primary Owners

- Primary: Billing Owner / App On-Call
- Secondary: Webhook Integrations Owner

## Diagnostic Steps

1. Resolve target account:

```bash
pnpm exec convex run devSeed:getFirstAccountId --typecheck disable --codegen disable
```

2. Inspect billing usage summary:

```bash
pnpm exec convex run billing:getUsageSummary "{\"accountId\":\"<accountId>\"}" --typecheck disable --codegen disable
```

3. Validate Stripe webhook edge behavior:

```bash
APP_URL=http://localhost:3100 pnpm smoke:stripe:webhook
```

4. If needed, inspect recent Stripe event handling records and billing account state in Convex dashboard.

## Recovery Actions

1. Correct account billing status via validated event replay or controlled mutation path.
2. Re-run usage summary query and confirm expected plan/status.
3. Confirm notification events for warning/cap behavior are consistent with token usage.
4. Record all manual interventions in incident notes.

## Verification Checklist

- `billing:getUsageSummary` returns expected `billingPlan`, `billingStatus`, and token counters.
- Stripe webhook endpoint enforces signature validation.
- Any replayed billing event is reflected once (no duplicate side effects).

## Rollback / Exit Criteria

Rollback manual changes if they diverge from verified Stripe/account state.

Exit incident when:

- Account state is consistent across app and provider records.
- Token gating behavior matches documented policy.
- Incident artifacts and follow-up items are logged.

## Escalation Path

- 0-20 min: Billing Owner / App On-Call
- 20-40 min: Engineering Lead
- 40+ min or revenue impact: Product and support stakeholders

## Required Artifacts

- Account ID and affected month key
- Usage summary snapshots (before/after)
- Webhook command outputs
- Incident decision log
