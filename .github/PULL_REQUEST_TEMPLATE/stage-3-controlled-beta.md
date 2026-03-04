## Stage Boundary
- Active policy doc: `docs/dev-phase-policy.md`
- Active stage doc: `docs/dev-phase-stage-3-controlled-beta.md`
- Evidence doc: `docs/ops/stage-3-evidence.md`
- Scope item targeted: `Item <n>`

## Scope Check
- [ ] This PR changes only one Stage 3 scope item
- [ ] Out-of-scope requests were not implemented (logged in `Deferred Work` if needed)
- [ ] PR-sized chunk only (no unrelated changes)

## Why
Describe why this change is needed and how it maps to Stage 3 item `<n>`.

## Changes
List the concrete implementation changes.

## Tests (Required)
- [ ] `pnpm verify:phase-boundary`
- [ ] `pnpm ci:check`

### Stage 3 Validation
- [ ] Change is tied to observed beta telemetry or incident evidence
- [ ] Before/after quality/safety or reliability impact is documented
- [ ] Rollback path validated for tuning/routing changes

## Evidence Updates (Required)
- [ ] Updated `docs/ops/stage-3-evidence.md`
- [ ] Updated `docs/dev-phase-stage-3-controlled-beta.md` status tracker
- [ ] Added telemetry/incident artifact links

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
- [ ] Commit title uses: `stage3(item-<n>): <imperative summary>`
- [ ] Commit body includes:
  - `Why: ...`
  - `Tests: ...`
  - `Evidence: ...`
