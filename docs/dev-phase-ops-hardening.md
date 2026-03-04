# Dev Phase Boundary: Ops Hardening (Stage 1)

## Purpose

This phase defines the only allowed development scope until completion.
All autonomous coding-agent work must stay within this boundary.

## Entry Gate

- None. This is the first enforced phase in the stage sequence.

## Phase Scope (Only)

1. CI merge gate enforcement is active and stable:
   - `pnpm ci:check` runs on PRs and main merges.
   - Quality gate artifacts/reports are retained.
2. Production observability baseline is completed:
   - error tracking integration,
   - request latency visibility (at least p50/p95/p99 by key routes),
   - webhook failure alerting with actionable routing.
3. Incident runbooks are completed:
   - webhook replay runbook,
   - provider outage runbook,
   - token/billing incident runbook,
   - triage + escalation flow.
4. Production deploy/environment checklist is completed:
   - single checklist for web + Convex + notification worker,
   - rollout and rollback steps,
   - validation checks after deploy.

## Out Of Scope (Blocked During This Phase)

- New product features unrelated to this phase.
- UI redesigns not required by observability/runbook/deploy checklist work.
- New platform integrations.
- Schema/domain expansions not required for observability or incident handling.
- Performance optimization work not tied to latency observability.

## Autonomous Agent Rules

- Work only on Stage 1 scope items.
- Any request outside this phase must be rejected/deferred and logged under "Deferred Work".
- No task outside Stage 1 is allowed until all mandatory Stage 1 tests pass and evidence is recorded.
- Ship in small, reviewable PR-sized increments.
- Every increment must include:
  - docs updates,
  - validation evidence (tests/checks),
  - explicit done/remaining status per phase item,
  - exact commands executed and links to artifacts/evidence entries.
- If any gate fails, stop and create a remediation task before additional work.

## Required Test Gate (Must Pass)

The following are mandatory before marking any scope item as `Done`:

1. Baseline CI quality gate:
   - `pnpm ci:check`
2. Stage-specific operational validation evidence:
   - observability verification outputs for error tracking, latency, and alert routing,
   - incident runbook exercise evidence for replay/outage/billing scenarios,
   - deployment checklist dry-run evidence with rollback rehearsal notes.
3. Phase policy compliance:
   - `pnpm verify:phase-boundary`

## Evidence Required

- Record all Stage 1 evidence in `docs/ops/stage-1-evidence.md`.
- Every completed scope item must include:
  - command/test evidence,
  - artifacts/links,
  - owner/date,
  - signoff status.
- Item status cannot be moved to `Done` unless evidence status is `PASS` with owner signoff.

## Definition Of Done

Stage 1 is complete only when all conditions below are met:

1. **Observability**
   - Error tracking is configured and verified in runtime.
   - Latency metrics are available for key API routes (including webhooks).
   - Webhook failure alerts are documented, tested, and routed to owners.
2. **Runbooks**
   - Replay/outage/billing runbooks are present in `docs/ops/`.
   - Each runbook includes trigger conditions, step-by-step actions, verification, rollback/exit criteria, and owner/escalation path.
3. **Deploy Checklist**
   - A single production deployment runbook/checklist covers:
     - env validation,
     - deploy order,
     - smoke tests,
     - rollback procedure,
     - post-deploy monitoring window.
4. **Status Closure**
   - This file is marked `Stage Status: Done`.
   - `docs/ops/stage-1-evidence.md` is marked exit-gate approved.
   - README links to the finalized runbooks/checklists.

## Exit Gate

Stage 1 exits only when all are true:

- All four scope items are `Done`.
- Required tests/validations are passing and recorded.
- `docs/ops/stage-1-evidence.md` is complete and signoff-approved.
- No unresolved `Stage1-Critical` blockers remain.

## Promotion Rule

- Stage 2 work is blocked until Stage 1 exit gate passes.
- Any out-of-bound request must be captured under "Deferred Work".
- Promotion authority is controlled by `docs/dev-phase-policy.md`.

## Deliverables

- `docs/ops/webhook-replay-runbook.md`
- `docs/ops/provider-outage-runbook.md`
- `docs/ops/token-billing-incident-runbook.md`
- `docs/ops/production-deploy-checklist.md`
- Observability integration/config docs (provider-specific) and verification notes.

## Status Tracker

- Stage Status: In Progress
- Item 1 (CI gate): Done | Tests Passed: Yes | Evidence Linked: Yes | Owner Signoff: Yes
- Item 2 (observability): In Progress | Tests Passed: Partial | Evidence Linked: Yes | Owner Signoff: No
- Item 3 (incident runbooks): In Progress | Tests Passed: No | Evidence Linked: Partial | Owner Signoff: No
- Item 4 (deploy/env checklist): In Progress | Tests Passed: No | Evidence Linked: No | Owner Signoff: No

## Deferred Work

Use this section for anything requested that is outside this boundary.

## Next Phase

After this file is fully marked Done, continue with:
- `docs/dev-phase-stage-2-beta-readiness.md`
