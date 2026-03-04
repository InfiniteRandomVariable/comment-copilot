# Production Deploy Dry-Run Record (2026-03-04)

## Metadata

- Date (UTC): 2026-03-04
- Environment: local dry-run (`APP_URL=http://localhost:3100`)
- Deployer: autonomous agent
- Scope item: Stage 1 Item 4 (deploy/env checklist)

## Preconditions

- `pnpm verify:phase-boundary`: PASS
- `pnpm ci:check`: PASS

## Executed Steps

1. Started web process via `pnpm dev:web`.
2. Verified runtime endpoint:
   - `curl -fsS http://localhost:3100/api/health/orchestration`
3. Ran webhook smoke checks:
   - `APP_URL=http://localhost:3100 ./scripts/smoke-stripe-webhook.sh`
   - `APP_URL=http://localhost:3100 ./scripts/smoke-tiktok-webhook.sh`

## Results

### Orchestration health

- Status: PASS
- Result excerpt:
  - `ok: true`
  - `mode: inline`
  - `workerRequired: false`

### Stripe webhook smoke

- Status: PASS
- Output excerpt:
  - `Smoke check passed: webhook endpoint is live and signature enforcement is active (HTTP 400 without signature).`

### TikTok webhook smoke

- Status: FAIL
- Output excerpt:
  - `Expected HTTP 200 from TikTok webhook endpoint, got: 500`
  - `{"ok":false,"error":"AI_CHAT_COMPLETIONS_URL is not set for worker generation"}`

## Rollback Rehearsal Notes

- Rollback criterion was met due failed post-deploy smoke check.
- Rehearsed decision path from `docs/ops/production-deploy-checklist.md`:
  - halt rollout,
  - diagnose config mismatch,
  - only proceed after smoke checks pass.
- No production rollback executed (local dry-run only).

## Follow-up Actions

1. Ensure deploy environment includes `AI_CHAT_COMPLETIONS_URL` (and related AI generation env) before next rollout rehearsal.
2. Re-run full dry-run and capture all smoke checks as PASS.
3. Attach rerun evidence and request owner signoff for Item 4 closure.
