## Stage Boundary
- Active policy doc: `docs/dev-phase-policy.md`
- Active stage doc: `docs/dev-phase-stage-2-beta-readiness.md`
- Evidence doc: `docs/ops/stage-2-evidence.md`
- Scope item targeted: `Item <n>`

## Scope Check
- [ ] This PR changes only one Stage 2 scope item
- [ ] Out-of-scope requests were not implemented (logged in `Deferred Work` if needed)
- [ ] PR-sized chunk only (no unrelated changes)

## Why
Describe why this change is needed and how it maps to Stage 2 item `<n>`.

## Changes
List the concrete implementation changes.

## Tests (Required)
- [ ] `pnpm verify:phase-boundary`
- [ ] `pnpm ci:check`

### Stage 2 Validation
- [ ] Operator UX / inbox / dashboard / account health validation added or updated
- [ ] Impacted tests updated (`test:web:inbox`, `test:web:telemetry`, targeted integration tests)

## Evidence Updates (Required)
- [ ] Updated `docs/ops/stage-2-evidence.md`
- [ ] Updated `docs/dev-phase-stage-2-beta-readiness.md` status tracker
- [ ] Added artifact links

### Evidence Links
- `<link 1>`
- `<link 2>`
- `<link 3>`

## Status Tracker Delta
Before:
- Item `<n>`: `<status> | Tests Passed: <...> | Evidence Linked: <...> | Owner Signoff: <...>`

After:
- Item `<n>`: `<status> | Tests Passed: <...> | Evidence Linked: <...> | Owner Signoff: <...>`

## Risk and Rollback
- Risk level: `<low|medium|high>`
- Rollback steps:
  1. `<step>`
  2. `<step>`

## Commit Message Format Check
- [ ] Commit title uses: `stage2(item-<n>): <imperative summary>`
- [ ] Commit body includes:
  - `Why: ...`
  - `Tests: ...`
  - `Evidence: ...`
