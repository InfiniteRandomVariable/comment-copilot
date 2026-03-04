# Provider Outage Runbook

## Scope

Handle upstream provider outages that impact creator workflows:

- Instagram API or auth endpoints
- TikTok API or auth endpoints
- Stripe webhook/event delivery surface

This runbook focuses on incident triage, containment, and safe recovery for Stage 1 operations hardening.

## Trigger Conditions

Start this runbook when one or more are true:

- sudden spike of provider-facing failures in send or auth flows,
- repeated `oauth=error` or token-refresh failures in Settings,
- webhook acceptance drops or repeated provider delivery retries,
- provider status page confirms degraded service or outage,
- on-call detects creator-impacting backlog growth tied to one provider.

## Severity Guidance

- `SEV-2`: partial outage with manual workaround available.
- `SEV-1`: broad outage with blocked send/auth workflows or severe creator impact.

Declare severity in the incident channel/ticket at runbook start.

## Immediate Containment

1. Declare incident commander and comms owner.
2. Record outage start time, affected provider, and affected surfaces:
   - webhook ingestion,
   - send/reply path,
   - OAuth connect/refresh/disconnect,
   - billing webhook handling (Stripe).
3. Reduce outbound blast radius for impacted accounts by disabling autopilot:

```bash
pnpm exec convex run autopilot:upsertAutopilotSettings '{"accountId":"<accountId>","enabled":false,"maxRiskScore":0.35,"minConfidenceScore":0.6}' --typecheck disable --codegen disable
```

4. Keep inbound ingestion active unless data corruption risk is observed.

## Health Checks And Triage

### A) Verify app runtime and orchestration state

```bash
curl -sS "$APP_URL/api/health/orchestration"
```

Confirm:

- `ok: true`
- expected orchestration mode (`temporal` or `inline`)
- no unexpected runtime warnings

### B) Verify webhook reachability/signature path

For TikTok:

```bash
APP_URL="$APP_URL" ./scripts/smoke-tiktok-webhook.sh
```

For Stripe endpoint signature enforcement:

```bash
APP_URL="$APP_URL" ./scripts/smoke-stripe-webhook.sh
```

Interpretation:

- smoke check passes -> app endpoint path is alive; likely provider-side degradation.
- smoke check fails -> app/env/runtime issue; treat as internal incident and remediate first.

### C) Verify data-plane impact

Sample affected accounts and check inbox backlog state:

```bash
pnpm exec convex run comments:listInboxComments '{"accountId":"<accountId>","status":"pending_review"}' --typecheck disable --codegen disable
```

Check for missing expected `platformCommentId` records or abnormal growth.

## Provider-Specific Mitigation

### Instagram / TikTok outage

1. Keep autopilot disabled for affected accounts.
2. Avoid bulk retries against a degraded provider.
3. Guide creators to manual review queue until provider recovery.
4. If token/auth behavior is degraded, pause token-refresh guidance and re-attempt after provider green status.

### Stripe outage or delayed events

1. Confirm app endpoint still enforces signatures (`smoke-stripe-webhook.sh`).
2. Do not mutate billing state manually without incident-commander approval.
3. Track delayed event window for replay/verification once Stripe recovers.

## Recovery Procedure

When provider status returns healthy:

1. Re-run runtime and webhook smoke checks.
2. Re-enable autopilot per account (if previously enabled):

```bash
pnpm exec convex run autopilot:upsertAutopilotSettings '{"accountId":"<accountId>","enabled":true,"maxRiskScore":0.35,"minConfidenceScore":0.6}' --typecheck disable --codegen disable
```

3. Process backlog in controlled batches.
4. For missed inbound comments, execute replay flow from:
   - `docs/ops/webhook-replay-runbook.md`.
5. Verify stabilization:
   - webhook smoke scripts passing,
   - backlog decreasing,
   - no sustained new provider-send/auth failures.

## Rollback / Exit Criteria

Stop recovery rollout and re-enter containment if:

- failure rate re-spikes after re-enabling autopilot,
- backlog grows despite replay/retry steps,
- cross-account data inconsistencies are detected.

Exit this runbook when all are true:

- provider status stable for monitoring window (minimum 30 minutes),
- impacted accounts have controlled backlog and normal processing trend,
- incident notes include timeline, mitigation actions, and final owner signoff.

## Owner And Escalation Path

- Primary owner: Backend on-call engineer.
- Secondary owner: Product/operations owner (creator communications).
- Escalate to incident commander immediately for:
  - `SEV-1` declaration,
  - data-integrity risk,
  - outage duration > 30 minutes with unresolved creator impact.

## Evidence Artifacts To Attach

- Orchestration health output samples (`GET /api/health/orchestration`).
- Smoke script outputs (`smoke-tiktok-webhook.sh`, `smoke-stripe-webhook.sh`).
- Convex snapshots showing backlog trend before/after mitigation.
- Incident timeline with severity, owner, and recovery checkpoints.
