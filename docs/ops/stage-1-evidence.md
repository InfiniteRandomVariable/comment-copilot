# Stage 1 Evidence: Ops Hardening

## Metadata

- Stage ID: stage-1
- Boundary Doc: docs/dev-phase-ops-hardening.md
- Stage Status: In Progress
- Exit Gate Approved: No
- Owner: TBD
- Overall Signoff: Pending
- Last Updated: 2026-03-04

## Scope Item Evidence

| Item | Pass/Fail | Required Tests | Artifacts/Links | Owner Signoff | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | PASS | `pnpm ci:check`, `pnpm verify:phase-boundary` | CI workflow logs + retained JUnit artifacts | Approved | CI workflows now avoid conflicting pnpm pins and avoid unresolved cache-dependency paths (repo has no tracked lockfile), restoring gate execution reliability. |
| 2 | PENDING | `pnpm ci:check`, `pnpm --filter @copilot/web test:webhooks:e2e:ci`, `node scripts/report-webhook-latency.mjs /tmp/stage1_item2_webhook_observability.log` | `apps/web/app/api/_lib/webhookObservability.ts`; `apps/web/app/api/_lib/errorTracking.ts`; `scripts/report-webhook-latency.mjs`; `apps/web/tests/webhooks.e2e.integration.test.ts`; `apps/web/test-results/webhooks.e2e.junit.xml`; `/tmp/stage1_item2_webhook_observability.log`; `/tmp/stage1_item2_webhook_latency_report.txt` | Pending | Structured webhook latency/failure logs plus alert-routing metadata are emitted for Instagram/TikTok/Stripe; unexpected webhook failures forward to a configurable external error-tracking sink. Owner signoff and live Stripe-route runtime evidence remain pending before PASS/Done. |
| 3 | PENDING | `pnpm ci:check`, incident runbook walkthrough checks | Pending | Pending | Runbooks exist but not fully completed/rehearsed. |
| 4 | PENDING | `pnpm ci:check`, deploy checklist dry-run checks | Pending | Pending | Unified production checklist not finalized. |

## Exceptions

- None.
