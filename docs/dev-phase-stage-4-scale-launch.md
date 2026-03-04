# Dev Phase Boundary: Stage 4 Scale Launch

## Purpose

This phase governs promotion from controlled beta to scale-ready public launch posture.
Autonomous coding-agent work must stay within this boundary only.

## Entry Gate

- Stage 3 (`docs/dev-phase-stage-3-controlled-beta.md`) is marked complete.
- `docs/ops/stage-3-evidence.md` is exit-gate approved.
- Active stage in `docs/dev-phase-policy.md` is set to `stage-4`.

## Phase Scope (Only)

1. Scale architecture readiness:
   - finalize orchestration mode decision for launch scale,
   - execute Temporal cutover (if required by traffic/risk profile),
   - validate multi-instance behavior and idempotency at scale.
2. Reliability and SLO readiness:
   - define and enforce service SLOs/error budgets,
   - alerting coverage for user-impacting failures,
   - run staged failover/rollback drills.
3. Capacity and performance validation:
   - representative load testing for webhook and inbox critical paths,
   - throughput and latency verification against targets,
   - scaling and cost guardrails.
4. Launch operations readiness:
   - on-call rota and escalation readiness,
   - support workflow for launch incidents,
   - release checklist and go/no-go criteria.

## Out Of Scope (Blocked During This Phase)

- Non-essential product expansion that increases launch risk.
- Experimental architecture changes without measurable launch benefit.
- Long-horizon roadmap items not required for launch readiness.

## Autonomous Agent Rules

- Work only on Stage 4 scope items and prioritize launch reliability over feature velocity.
- Any change that impacts reliability must include rollback instructions.
- Keep launch criteria objective and measurable.
- No task outside Stage 4 is allowed until mandatory tests pass and evidence is recorded.
- Defer non-launch-critical requests into "Deferred Work".

## Required Test Gate (Must Pass)

The following are mandatory before marking any Stage 4 scope item as `Done`:

1. Baseline CI quality gate:
   - `pnpm ci:check`
2. Stage-focused validation:
   - load/performance tests for webhook and inbox critical paths,
   - SLO/error-budget validation checks,
   - failover/rollback drill validation evidence.
3. Phase policy compliance:
   - `pnpm verify:phase-boundary`

## Evidence Required

- Record all Stage 4 evidence in `docs/ops/stage-4-evidence.md`.
- Every completed scope item must include:
  - command/test evidence,
  - load/SLO/failover artifacts,
  - owner/date,
  - signoff status.
- Item status cannot be moved to `Done` unless evidence status is `PASS` with owner signoff.

## Definition Of Done

Stage 4 is complete only when all are true:

1. Launch architecture path is validated in production-like conditions.
2. SLOs, alerting, and incident response are operationally proven.
3. Load/performance testing confirms expected launch envelope.
4. Launch runbook/checklists are complete and rehearsed.
5. Go/no-go criteria are met and documented for launch sign-off.

## Exit Gate

Stage 4 exits only when all are true:

- All four Stage 4 scope items are `Done`.
- Required tests/validations are passing and recorded.
- `docs/ops/stage-4-evidence.md` is complete and signoff-approved.
- No unresolved `Stage4-Critical` blockers remain.

## Promotion Rule

- No post-launch phase work is allowed until Stage 4 exit gate passes.
- Any out-of-bound request must be captured under "Deferred Work".
- Promotion authority is controlled by `docs/dev-phase-policy.md`.

## Deliverables

- `docs/ops/scale-launch-runbook.md`
- `docs/ops/slo-and-alert-policy.md`
- `docs/ops/load-test-plan-and-results.md`
- `docs/ops/launch-go-no-go-checklist.md`

## Status Tracker

- Stage Status: Pending
- Item 1 (architecture readiness): Pending | Tests Passed: No | Evidence Linked: No | Owner Signoff: No
- Item 2 (reliability/SLO): Pending | Tests Passed: No | Evidence Linked: No | Owner Signoff: No
- Item 3 (capacity/performance): Pending | Tests Passed: No | Evidence Linked: No | Owner Signoff: No
- Item 4 (launch operations): Pending | Tests Passed: No | Evidence Linked: No | Owner Signoff: No

## Deferred Work

Capture out-of-bound requests here for post-launch phases.
