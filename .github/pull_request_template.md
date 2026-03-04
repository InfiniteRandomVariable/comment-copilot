## Active Stage (Required)
- ACTIVE_STAGE_ID from `docs/dev-phase-policy.md`: `<stage-1|stage-2|stage-3|stage-4>`
- Boundary doc used: `<path>`
- Evidence doc used: `<path>`
- Scope item targeted: `Item <n>`

## Template Selection
- [ ] I used the matching stage template from `.github/PULL_REQUEST_TEMPLATE/`
- [ ] This PR is fully within the active stage boundary
- [ ] Out-of-scope requests were deferred and logged

### Stage-Specific Templates
- `stage-1-ops-hardening.md`
- `stage-2-beta-readiness.md`
- `stage-3-controlled-beta.md`
- `stage-4-scale-launch.md`

## Mandatory Checks
- [ ] `pnpm verify:phase-boundary`
- [ ] `pnpm ci:check`

## Evidence Updates
- [ ] Updated corresponding `docs/ops/stage-*-evidence.md`
- [ ] Updated stage boundary status tracker
- [ ] Added artifact links
