# Token/Billing Incident Runbook

## Scope

Handle production incidents affecting token enforcement and billing correctness:

- free-tier warning/cap behavior (`8k` warning, `10k` hard cap),
- billing plan/status drift (free vs paid),
- token notification delivery failures,
- Stripe lifecycle mapping or delayed webhook effects.

This runbook is for Stage 1 ops hardening and focuses on containment, verification, and controlled recovery.

## Trigger Conditions

Start this runbook when one or more are true:

- creators report unexpected `FREE_TIER_TOKEN_CAP_REACHED` blocks,
- free-tier accounts exceed expected limits without blocking,
- warning/cap emails are missing or delayed,
- billing plan/status in app does not match subscription state,
- Stripe webhook incidents affect billing updates.

## Severity Guidance

- `SEV-2`: localized account impact, workaround available.
- `SEV-1`: broad creator-impacting billing/token failures.

Declare severity and incident owner at runbook start.

## Immediate Containment

1. Open incident channel/ticket and record impact window.
2. Identify affected account IDs and segment by symptom.
3. Pause high-risk automation for affected accounts (disable autopilot):

```bash
pnpm exec convex run autopilot:upsertAutopilotSettings '{"accountId":"<accountId>","enabled":false,"maxRiskScore":0.35,"minConfidenceScore":0.6}' --typecheck disable --codegen disable
```

4. Avoid bulk manual billing mutations until current state is captured.

## Triage Checklist

### A) Usage and billing snapshot

For each affected account:

```bash
pnpm exec convex run billing:getUsageSummary '{"accountId":"<accountId>"}' --typecheck disable --codegen disable
```

Capture:

- `billingPlan`
- `billingStatus`
- `usedTokens`
- `includedTokens`
- `warningThreshold`
- `hardCap`

### B) Notification queue health

```bash
pnpm exec convex run notifications:listPendingNotificationEvents '{"accountId":"<accountId>","limit":50}' --typecheck disable --codegen disable
```

If queue is growing or stuck:

- ensure notification worker is running: `pnpm dev:notifications`,
- verify worker env (delivery mode and provider credentials) per `docs/notification-worker.md`.

### C) Stripe webhook surface check

```bash
APP_URL="$APP_URL" ./scripts/smoke-stripe-webhook.sh
```

Pass condition confirms endpoint reachability + signature enforcement path.

## Incident Playbooks

### 1) Unexpected cap block on paid account

Symptoms:

- account should be paid but gets free-tier cap behavior.

Actions:

1. Confirm summary mismatch (`billingPlan=free` unexpectedly).
2. Validate Stripe event flow (status page + webhook smoke + recent webhook history in logs/dashboard).
3. Apply temporary correction only if mismatch is confirmed:

```bash
pnpm exec convex run billing:upsertBillingAccount '{"accountId":"<accountId>","planType":"paid","billingStatus":"active"}' --typecheck disable --codegen disable
```

4. Re-run `billing:getUsageSummary` and verify `billingPlan=paid`.

### 2) Free-tier cap not enforced when expected

Symptoms:

- usage is above included tokens and generation is still flowing for free plan.

Actions:

1. Confirm current `billingPlan` and `billingStatus`.
2. Validate worker callers are still using reserve/finalize flow.
3. If account should be constrained and is marked incorrectly, correct billing state:

```bash
pnpm exec convex run billing:upsertBillingAccount '{"accountId":"<accountId>","planType":"free","billingStatus":"active"}' --typecheck disable --codegen disable
```

4. Re-check summary and monitor for expected cap enforcement on next attempts.

### 3) Warning/cap notifications missing

Symptoms:

- expected threshold/cap events exist but no delivery.

Actions:

1. Inspect pending queue for affected account.
2. Restart/recover notification worker and provider credentials.
3. For approved backfill, enqueue missing event explicitly:

```bash
pnpm exec convex run notifications:enqueueNotificationEvent '{"accountId":"<accountId>","monthKey":"<YYYY-MM>","eventType":"token_warning_threshold","payloadJson":"{}"}' --typecheck disable --codegen disable
```

Use `eventType` as needed:

- `token_warning_threshold`
- `token_free_tier_cap_reached`

## Recovery Procedure

1. Re-verify each affected account with `billing:getUsageSummary`.
2. Confirm pending notification backlog is decreasing.
3. If autopilot was disabled, restore intended account setting:

```bash
pnpm exec convex run autopilot:upsertAutopilotSettings '{"accountId":"<accountId>","enabled":true,"maxRiskScore":0.35,"minConfidenceScore":0.6}' --typecheck disable --codegen disable
```

4. Monitor incident cohort for at least 30 minutes for regression.

## Rollback / Exit Criteria

Rollback immediately if:

- corrective account mutations worsen mismatch,
- notification backlog accelerates after recovery actions,
- new billing-state inconsistencies appear across unaffected accounts.

Exit this runbook when all are true:

- billing/token behavior matches expected plan policy for impacted accounts,
- notification queue is stable or draining,
- incident timeline includes commands run, outcomes, and owner signoff.

## Owner And Escalation Path

- Primary owner: Backend on-call engineer.
- Secondary owner: Product/operations owner.
- Escalate to incident commander for:
  - `SEV-1`,
  - cross-account corruption concerns,
  - unresolved creator-impacting mismatch beyond 30 minutes.

## Evidence Artifacts To Attach

- `billing:getUsageSummary` outputs before/after remediation.
- notification queue snapshots from `notifications:listPendingNotificationEvents`.
- stripe smoke check output (`smoke-stripe-webhook.sh`).
- incident timeline with impacted accounts, actions, and final signoff.
