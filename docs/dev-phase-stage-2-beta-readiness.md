# Dev Phase Boundary: Stage 2 Beta Readiness

## Purpose

This phase defines what must be completed before broad real-user beta usage.
Autonomous coding-agent work must stay within this boundary only.

## Entry Gate

- Stage 1 (`docs/dev-phase-ops-hardening.md`) is marked complete.
- `docs/ops/stage-1-evidence.md` is exit-gate approved.
- Active stage in `docs/dev-phase-policy.md` is set to `stage-2`.

## Phase Scope (Only)

1. Complete operator UX:
   - autopilot threshold editing UX,
   - explicit autopilot kill switch UX,
   - clear persistence/validation states.
2. Inbox productivity improvements:
   - filtering and queue clarity,
   - review throughput helpers (faster approve/reject/send flows),
   - reduced operator friction for high-volume comment handling.
3. Usage dashboards:
   - auto-send rate,
   - review backlog size/age,
   - token burn trends,
   - send success/failure rates.
4. Customer-facing account health surfaces:
   - connection status visibility (Instagram/TikTok),
   - token/usage health visibility and meaningful warnings.

## Out Of Scope (Blocked During This Phase)

- New platform support.
- Major model/pipeline architecture changes.
- Enterprise multi-tenant feature expansion unrelated to beta usability.
- Scale-only infrastructure redesign that belongs to Stage 4.

## Autonomous Agent Rules

- Work only on Stage 2 scope items.
- Reject/defer requests outside this boundary into "Deferred Work".
- No task outside Stage 2 is allowed until mandatory tests pass and evidence is recorded.
- Ship in small increments with explicit acceptance checks.
- Every increment must include:
  - UX/behavior documentation updates,
  - test updates,
  - done/remaining notes against Stage 2 scope,
  - exact commands executed and evidence links.

## Required Test Gate (Must Pass)

The following are mandatory before marking any Stage 2 scope item as `Done`:

1. Baseline CI quality gate:
   - `pnpm ci:check`
2. Stage-focused validation (based on impacted area):
   - `pnpm test:web:inbox`
   - `pnpm test:web:telemetry`
   - targeted UI/integration validation for changed operator UX, inbox, dashboard, or account health flows.
3. Phase policy compliance:
   - `pnpm verify:phase-boundary`

## Evidence Required

- Record all Stage 2 evidence in `docs/ops/stage-2-evidence.md`.
- Every completed scope item must include:
  - required test commands and results,
  - artifact links,
  - owner/date,
  - signoff status.
- Item status cannot be moved to `Done` unless evidence status is `PASS` with owner signoff.

## Definition Of Done

Stage 2 is complete only when all are true:

1. Operator controls are complete and reliable.
2. Inbox workflow supports practical daily moderation throughput.
3. Usage dashboard metrics are visible and trustworthy.
4. End users can clearly see account connection/token health states.
5. Validation coverage exists for core Stage 2 behaviors.
6. README and phase docs are updated to reflect completion.

## Exit Gate

Stage 2 exits only when all are true:

- All four Stage 2 scope items are `Done`.
- Required tests/validations are passing and recorded.
- `docs/ops/stage-2-evidence.md` is complete and signoff-approved.
- No unresolved `Stage2-Critical` blockers remain.

## Promotion Rule

- Stage 3 work is blocked until Stage 2 exit gate passes.
- Any out-of-bound request must be captured under "Deferred Work".
- Promotion authority is controlled by `docs/dev-phase-policy.md`.

## Deliverables

- UI updates for operator controls and inbox productivity.
- Dashboard screens/components for usage metrics.
- Connection/token health status surfaces.
- Updated docs for beta operator workflow.

## Status Tracker

- Stage Status: In Progress
- Item 1 (operator UX): In Progress | Tests Passed: Yes | Evidence Linked: Yes | Owner Signoff: No
- Item 2 (inbox productivity): Done | Tests Passed: Yes | Evidence Linked: Yes | Owner Signoff: Yes
- Item 3 (usage dashboards): In Progress | Tests Passed: Yes | Evidence Linked: Yes | Owner Signoff: No
- Item 4 (customer-facing health): In Progress | Tests Passed: Yes | Evidence Linked: Yes | Owner Signoff: No

## Deferred Work

Capture out-of-bound requests here for later phases.
- 2026-03-05: Added repository-wide agent coding guidelines and local skill scaffolding (`AGENTS.md`, `docs/agent-coding-guidelines.md`, `.skills/app-dev-coding-guide/`) as process/workflow governance outside Stage 2 product scope.
- 2026-03-05: Updated global git worktree/PR policy wording per owner request (process policy change outside Stage 2 product scope).
