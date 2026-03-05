# Stage 2 Evidence: Beta Readiness

## Metadata

- Stage ID: stage-2
- Boundary Doc: docs/dev-phase-stage-2-beta-readiness.md
- Stage Status: In Progress
- Exit Gate Approved: No
- Owner: Kevin Lau
- Overall Signoff: Pending
- Last Updated: 2026-03-05

## Scope Item Evidence

| Item | Pass/Fail | Required Tests | Artifacts/Links | Owner Signoff | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | PENDING | `pnpm --filter @copilot/web test tests/settings.actions.integration.test.ts`; `pnpm verify:phase-boundary`; `pnpm ci:check` | `apps/web/app/settings/page.tsx`, `apps/web/app/settings/actions.ts`, `apps/web/tests/settings.actions.integration.test.ts`, `apps/web/components/save-autopilot-submit.tsx` | Pending | Operator UX controls validated: per-account autopilot thresholds, explicit kill switch, and persistence/error states. Revalidated on 2026-03-05; awaiting owner signoff. |
| 2 | PASS | `pnpm --filter @copilot/web test:inbox`; `pnpm verify:phase-boundary`; `pnpm ci:check` | `apps/web/app/inbox/page.tsx`, `apps/web/app/inbox/actions.ts`, `apps/web/app/inbox/filtering.ts`, `apps/web/tests/inbox.actions.integration.test.ts` | Approved | Inbox productivity improvements verified: filters (platform/intent/backlog-age/search), queue staleness/age signals, quick approve+send, and redirect context preservation across actions/pagination. Revalidated on 2026-03-05 with all required gates passing. |
| 3 | PENDING | `pnpm --filter @copilot/web test:telemetry`; `pnpm --filter @copilot/web typecheck`; `pnpm verify:phase-boundary`; `pnpm ci:check` | `convex/usageDashboard.ts`, `convex/lib/usageDashboard.ts`, `apps/web/app/usage/page.tsx`, `apps/web/components/nav.tsx`, `apps/web/tests/usage-dashboard.metrics.integration.test.ts`, `docs/ops/stage-2-item-3-usage-dashboard-evidence-2026-03-05.md` | Pending | Added usage dashboard metrics pipeline and `/usage` page covering auto-send rate, send success/failure rates, review backlog size/age, and token burn trend snapshots (daily month view). Validation gates passed on 2026-03-05; awaiting owner signoff. |
| 4 | PENDING | `pnpm --filter @copilot/web test tests/settings.health.integration.test.ts`; `pnpm --filter @copilot/web test:telemetry`; `pnpm --filter @copilot/web typecheck`; `pnpm verify:phase-boundary`; `pnpm ci:check` | `apps/web/app/settings/page.tsx`, `apps/web/app/settings/health.ts`, `apps/web/tests/settings.health.integration.test.ts`, `docs/ops/stage-2-item-4-account-health-evidence-2026-03-05.md` | Pending | Added customer-facing account health signals in Settings: connection status, token expiry health, and token usage/billing warning states with actionable copy. Validation re-run on 2026-03-05; awaiting owner signoff. |

## Exceptions

- None.
