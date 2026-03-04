# Comment Copilot

Comment Copilot is a standalone web app for TikTok and Instagram creators to manage comments with AI-assisted responses.

## Hard isolation from SwapSafe

This project is intentionally isolated:
- Separate codebase and dependency graph.
- Separate auth, infra, secrets, and runtime.
- Separate data model and audit logs.

## Stack

- Frontend: Next.js + TypeScript
- App data and realtime: Convex
- Auth: Clerk
- Workflow orchestration: Temporal (default) or inline mode
- Agent flow: Context Builder -> Reply Generator -> Safety Gate

## Key product features

- Unified comment inbox.
- Hybrid autopilot (auto-send only low-risk/high-confidence replies).
- Owner-controlled persona configuration.
- Generated and approved account-level `SKILL.md` versions.
- Audit trail for every model decision and send action.
- Token-aware billing controls (8k warning, 10k free-tier cap, paid overage).

## Project layout

- `apps/web`: Next.js app and webhook endpoints.
- `apps/worker`: Temporal workflows and AI activities.
- `convex`: Convex schema, queries, mutations, and actions.
- `packages/shared`: Shared type definitions.
- `docs`: Product and operational docs.
- `infra`: Isolation and deployment guardrails.

## Operations docs

- Active phase policy and promotion rules: `docs/dev-phase-policy.md`
- Orchestration modes and cutover guide: `docs/orchestration.md`
- Active dev boundary (autonomous agent scope): `docs/dev-phase-ops-hardening.md`
- Stage 2 boundary (beta readiness): `docs/dev-phase-stage-2-beta-readiness.md`
- Stage 3 boundary (controlled beta): `docs/dev-phase-stage-3-controlled-beta.md`
- Stage 4 boundary (scale launch): `docs/dev-phase-stage-4-scale-launch.md`
- Stage evidence records: `docs/ops/stage-1-evidence.md`, `docs/ops/stage-2-evidence.md`, `docs/ops/stage-3-evidence.md`, `docs/ops/stage-4-evidence.md`
- Production deploy checklist: `docs/ops/production-deploy-checklist.md`
- Deploy checklist dry-run evidence (2026-03-04): `docs/ops/deploy-checklist-dry-run-2026-03-04.md`

## Testing

- Phase boundary quality gate (required): `pnpm verify:phase-boundary`
- Full CI-equivalent gate (recommended before push): `pnpm ci:check`
- Inbox send integration tests (local): `pnpm test:web:inbox`
- OAuth integration tests (local): `pnpm test:web:oauth`
- OAuth integration tests (CI mode + JUnit): `pnpm test:web:oauth:ci`
- Webhooks E2E integration tests (local): `pnpm test:web:webhooks:e2e`
- Webhooks E2E integration tests (CI mode + JUnit): `pnpm test:web:webhooks:e2e:ci`
- Inbox telemetry parser integration tests (local): `pnpm test:web:telemetry`
- Sync OAuth quality-gate baseline from current JUnit report: `pnpm sync:web:oauth:quality-gate`
  Prevents lowering baseline by default; use `node scripts/update-oauth-quality-gate.mjs ... --allow-decrease` for intentional decreases.
- Sync Webhooks E2E quality-gate baseline from current JUnit report: `pnpm sync:web:webhooks:e2e:quality-gate`
- OAuth JUnit report summary (GitHub annotations/summary helper): `pnpm report:web:oauth:junit`
- Inbox send telemetry report from app logs: `pnpm report:web:inbox-send:telemetry -- <log-file-path>`
- OAuth JUnit quality gate (minimum count + zero failures/errors): `pnpm verify:web:oauth:junit`
- Webhooks E2E JUnit quality gate (minimum count + zero failures/errors): `pnpm verify:web:webhooks:e2e:junit`
- OAuth quality gate config (minimum test baseline): `apps/web/tests/oauth-quality-gate.json`
- Webhooks E2E quality gate config (minimum test baseline): `apps/web/tests/webhooks-e2e-quality-gate.json`

## Next steps

1. Install dependencies: `pnpm install`
2. Configure `.env.local` from `.env.example`
   Orchestration mode: `COMMENT_ORCHESTRATION_MODE=temporal` (default) or `COMMENT_ORCHESTRATION_MODE=inline` to run workflow stages directly in the web process without Temporal
   Required for billing webhook: `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
   Required for OAuth callback/refresh: `SOCIAL_TOKEN_ENCRYPTION_KEY` and platform app credentials
   Required for draft generation: `AI_API_KEY`, `AI_MODEL`, and `AI_CHAT_COMPLETIONS_URL`
   Required for safety moderation: `AI_MODERATION_MODEL` and `AI_MODERATION_URL` (optional `AI_MODERATION_API_KEY`, otherwise falls back to `AI_API_KEY`)
   Required for platform reply send: `INSTAGRAM_COMMENT_REPLY_URL_TEMPLATE` and `TIKTOK_COMMENT_REPLY_URL`
   `pnpm dev:web` auto-syncs root `.env.local` into `apps/web/.env.local` before startup
3. Start Convex: `pnpm dev:convex`
4. Start web app: `pnpm dev:web`
5. Start worker service (Temporal mode only): `pnpm dev:worker`
6. Start notification sender worker: `pnpm dev:notifications`
7. Run Stripe webhook smoke check: `pnpm smoke:stripe:webhook`
8. If data is empty, seed a dev account via `devSeed:seedDefaultAccount` in Convex dashboard
