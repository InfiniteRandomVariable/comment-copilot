# Error Tracking Integration Guide (Stage 1)

## Scope

Stage 1 Item 2 error-tracking baseline for production services:

- `apps/web` webhook and OAuth API routes
- `apps/worker` workflow worker
- `apps/worker` notification worker

This guide defines minimum integration requirements and verification evidence needed to close the Item 2 error-tracking sub-scope.

## Current Status

- Structured API error responses exist for webhook/OAuth routes.
- Worker processes log fatal errors to stderr.
- Centralized external error tracker configuration evidence is still pending.

Do not mark Item 2 `Done` until runtime-integrated tracking proof is attached.

## Integration Requirements

1. Capture unhandled exceptions and handled critical failures from:
   - webhook routes (`instagram`, `tiktok`, `stripe`)
   - OAuth callback/refresh/disconnect handlers
   - worker startup and workflow execution loops
   - notification worker send/claim/fail loops
2. Include release and environment metadata (service name, commit SHA, environment).
3. Route production high-severity errors to on-call notification destination.

## Minimum Event Schema

Each tracked error should include:

- service (`web`, `worker`, `notification-worker`)
- route/workflow identifier (when applicable)
- severity (`error` or `fatal`)
- timestamp (UTC)
- deployment/release id
- correlation id or account id (when available and safe)

## Verification Procedure

1. Deploy integration-enabled build to staging/production-like environment.
2. Trigger one controlled failure per service:
   - invalid webhook signature request
   - worker connection/startup failure simulation
   - notification delivery failure simulation
3. Confirm each failure appears in the external error tracker with required fields.
4. Confirm routing destination receives alert for configured severity threshold.

## Evidence To Attach

Attach to Stage 1 evidence before completion:

- screenshot/export of captured errors for all three services,
- alert-routing proof (notification destination + acknowledgment),
- short note mapping captured events back to triggering test actions.

## Related Docs

- `docs/ops/webhook-failure-alert-routing.md`
- `docs/ops/observability-baseline-verification.md`
- `docs/ops/incident-triage-escalation-flow.md`
