# Dev Phase Policy

## Purpose

This file is the single source of truth for autonomous agent phase enforcement.
Only one stage may be active at a time.

## Enforcement Mode

- Mode: CI Enforced
- Required CI check: `phase-boundary-check`

## Stage Sequence

1. `stage-1` -> `docs/dev-phase-ops-hardening.md`
2. `stage-2` -> `docs/dev-phase-stage-2-beta-readiness.md`
3. `stage-3` -> `docs/dev-phase-stage-3-controlled-beta.md`
4. `stage-4` -> `docs/dev-phase-stage-4-scale-launch.md`

## Active Stage

ACTIVE_STAGE_ID=stage-2
ACTIVE_BOUNDARY_DOC=docs/dev-phase-stage-2-beta-readiness.md
ACTIVE_EVIDENCE_DOC=docs/ops/stage-2-evidence.md
STAGE_SEQUENCE=stage-1,stage-2,stage-3,stage-4
LAST_UPDATED=2026-03-05

## Transition Rules

- Prior stages must be complete before the next stage can become active.
- Future stages must not be marked `Stage Status: Done` while a prior stage is still active.
- Promotion requires:
  - boundary doc `Stage Status: Done`,
  - all scope items set to `Done` with tests/evidence/signoff marked `Yes`,
  - matching stage evidence doc exit-gate approval and overall signoff.

## Execution Continuity

- Work continuously until the task is complete.
- Do not stop to give progress updates or ask for confirmation unless one of the following is true:
  1. A destructive or irreversible action is needed.
  2. Credentials or secrets are required.
  3. There is a genuine architectural fork with materially different tradeoffs.
  4. You are blocked by missing information.
- Otherwise, make reasonable decisions and continue.

## Git Worktree And PR Policy

Use git worktree only when there is a strong reason, such as a major feature, major milestone, long-running task, or parallel
  work that must stay isolated.

Rules:
- Do not create a worktree by default.
- Do not create a worktree for small changes, minor fixes, or short tasks.
- Use the current workspace unless isolation is clearly needed.
- Create a worktree only when:
  1. the task is a major feature or milestone,
  2. the work will be long-running,
  3. parallel isolated work is necessary,
  4. keeping the main workspace clean is important.
- Never open PRs for incremental progress.
- Never use PRs as status updates.
- Commit and push freely as internal checkpoints.
- Open one PR only when:
  1. the stage goal is complete,
  2. build/typecheck/tests pass,
  3. the branch is merge-ready.
- Prefer squash merge.
- Interrupt the human only for critical decisions:
  auth/permissions, payments, DB migrations, infra/deploy,
  secrets, destructive actions, or major architecture forks.

## Baseline Mandatory Tests (All Stages)

- `pnpm ci:check`
- `pnpm verify:phase-boundary`

## Evidence Schema (All Stages)

Each stage evidence file in `docs/ops/` must include:

- `Stage ID`
- `Boundary Doc`
- `Stage Status`
- `Exit Gate Approved`
- `Owner`
- `Overall Signoff`
- Scope-item evidence rows with:
  - `Item`
  - `Pass/Fail`
  - `Required Tests`
  - `Artifacts/Links`
  - `Owner Signoff`
  - `Notes`
