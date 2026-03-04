# Dev Phase Boundary: Stage 3 Controlled Beta

## Purpose

This phase governs controlled beta operations with real user cohorts and data-driven tuning.
Autonomous coding-agent work must stay within this boundary only.

## Entry Gate

- Stage 2 (`docs/dev-phase-stage-2-beta-readiness.md`) is marked complete.
- `docs/ops/stage-2-evidence.md` is exit-gate approved.
- Active stage in `docs/dev-phase-policy.md` is set to `stage-3`.

## Phase Scope (Only)

1. Controlled cohort onboarding:
   - explicit cohort definition and rollout cadence,
   - onboarding checklist and support handoff,
   - cohort-level monitoring.
2. Weekly quality/safety review loop:
   - recurring measurement of response quality and safety outcomes,
   - tracked issue categories and action ownership,
   - documented weekly decisions.
3. Heuristic tuning from production signals:
   - risk/confidence threshold tuning by account profile,
   - measured impact before/after each change,
   - rollback plan for tuning regressions.
4. Provider resilience tuning:
   - rate-limit protection improvements,
   - retry/backoff tuning from real telemetry,
   - reduced failure impact during provider instability.

## Out Of Scope (Blocked During This Phase)

- Unrelated feature roadmap expansion.
- Large architecture migrations not required for controlled-beta reliability.
- Broad public launch messaging/go-to-market execution (Stage 4+ concern).

## Autonomous Agent Rules

- Work only on Stage 3 scope items and prioritize measurable reliability/quality/safety improvements.
- Every change must link to observed beta telemetry or incident evidence.
- Keep a changelog of tuning decisions and outcomes.
- No task outside Stage 3 is allowed until mandatory tests pass and evidence is recorded.
- Defer non-beta-critical work into "Deferred Work".

## Required Test Gate (Must Pass)

The following are mandatory before marking any Stage 3 scope item as `Done`:

1. Baseline CI quality gate:
   - `pnpm ci:check`
2. Stage-focused validation:
   - reliability/safety regression checks for changed heuristics and routing logic,
   - before/after telemetry evidence showing impact,
   - rollback validation for tuning changes.
3. Phase policy compliance:
   - `pnpm verify:phase-boundary`

## Evidence Required

- Record all Stage 3 evidence in `docs/ops/stage-3-evidence.md`.
- Every completed scope item must include:
  - command/test evidence,
  - telemetry and incident artifacts,
  - owner/date,
  - signoff status.
- Item status cannot be moved to `Done` unless evidence status is `PASS` with owner signoff.

## Definition Of Done

Stage 3 is complete only when all are true:

1. Controlled cohorts are onboarded with stable support operations.
2. Weekly quality/safety reviews are consistently executed and documented.
3. Threshold/routing tuning is evidence-based with rollback-ready controls.
4. Provider rate-limit/retry tuning demonstrably reduces failure impact.
5. Beta operational KPIs meet target bands for promotion to Stage 4.

## Exit Gate

Stage 3 exits only when all are true:

- All four Stage 3 scope items are `Done`.
- Required tests/validations are passing and recorded.
- `docs/ops/stage-3-evidence.md` is complete and signoff-approved.
- No unresolved `Stage3-Critical` blockers remain.

## Promotion Rule

- Stage 4 work is blocked until Stage 3 exit gate passes.
- Any out-of-bound request must be captured under "Deferred Work".
- Promotion authority is controlled by `docs/dev-phase-policy.md`.

## Deliverables

- `docs/ops/controlled-beta-operations.md`
- `docs/ops/quality-safety-weekly-review.md`
- `docs/ops/heuristics-tuning-log.md`
- Provider resilience tuning notes and validation artifacts.

## Status Tracker

- Stage Status: Pending
- Item 1 (cohort onboarding): Pending | Tests Passed: No | Evidence Linked: No | Owner Signoff: No
- Item 2 (weekly review loop): Pending | Tests Passed: No | Evidence Linked: No | Owner Signoff: No
- Item 3 (heuristic tuning): Pending | Tests Passed: No | Evidence Linked: No | Owner Signoff: No
- Item 4 (provider resilience): Pending | Tests Passed: No | Evidence Linked: No | Owner Signoff: No

## Deferred Work

Capture out-of-bound requests here for later phases.
