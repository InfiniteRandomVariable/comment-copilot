# Stage 2 Item 3 Evidence (Usage Dashboards)

## Scope
- Stage: `stage-2`
- Item: `3` usage dashboards
- Date: `2026-03-05`

## Delivered
- Added Convex query for aggregated usage metrics:
  - `convex/usageDashboard.ts`
  - `convex/lib/usageDashboard.ts`
- Added customer-visible usage dashboard page:
  - `apps/web/app/usage/page.tsx`
- Added navigation entry:
  - `apps/web/components/nav.tsx`
- Added metrics aggregation tests:
  - `apps/web/tests/usage-dashboard.metrics.integration.test.ts`

## Metrics Covered
- Auto-send rate
- Send success/failure rates
- Review backlog size and age/staleness
- Token burn trend (daily month view, utilization, average/day)

## Validation Commands
```bash
pnpm --filter @copilot/web test:telemetry
pnpm --filter @copilot/web typecheck
pnpm verify:phase-boundary
pnpm ci:check
```

## Validation Result
- All commands passed on 2026-03-05.

## Owner Signoff
- Pending
