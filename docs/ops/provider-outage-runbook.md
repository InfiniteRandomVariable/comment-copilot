# Provider Outage Runbook

## Purpose

Provide a consistent response for upstream provider outages affecting comment workflows, webhook handling, or billing.

## Trigger Conditions

Start this runbook when one or more occur:

- Elevated 5xx / timeout rates against AI, social API, Stripe, Convex, or Temporal dependencies.
- Health checks or workflow execution show provider-specific failures.
- Provider status page confirms incident impacting required APIs.

## Primary Owners

- Primary: App On-Call Engineer
- Secondary: Infra/Platform Owner

## Severity Guidelines

- Sev-1: End-to-end comment processing unavailable for most traffic.
- Sev-2: Partial degradation or delayed processing with workaround.
- Sev-3: Isolated failures with low customer impact.

## Immediate Actions (0-15 min)

1. Acknowledge incident and set severity.
2. Confirm blast radius with logs and error samples.
3. Identify failing provider and endpoint(s).
4. If Temporal path is unavailable and inline mode is viable, prepare controlled fallback based on `docs/orchestration.md`.

## Containment and Recovery

1. Apply safe degradation:
   - Pause risky automations if required.
   - Preserve inbound payloads for replay.
2. Monitor key routes:

```bash
curl -sS http://localhost:3100/api/health/orchestration
```

3. Validate webhook edge behavior (example Stripe signature guard):

```bash
APP_URL=http://localhost:3100 pnpm smoke:stripe:webhook
```

4. Continue provider status tracking and update ETA every 15 minutes for active Sev-1/Sev-2.

## Verification Checklist

- Provider error rate returns to baseline.
- Health endpoint reports expected orchestration mode and no new warnings.
- Affected webhook routes return expected status profile.
- Backlog replay plan is documented and started.

## Rollback / Exit Criteria

Rollback temporary toggles/workarounds when provider recovers and validations pass.

Exit incident when:

- Service is stable for one monitoring window (minimum 30 minutes).
- Deferred payload replay is complete or scheduled with owner.
- Post-incident follow-ups are recorded.

## Escalation Path

- 0-15 min: App On-Call Engineer
- 15-30 min: Infra/Platform Owner
- 30+ min: Engineering Lead and stakeholder communication owner

## Required Artifacts

- Timeline (UTC)
- Provider incident links/snapshots
- Commands run and outputs
- Recovery validation logs
