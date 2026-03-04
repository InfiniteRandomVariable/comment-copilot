# Observability Verification Evidence (2026-03-04)

## Stage Scope

- Stage: `stage-1`
- Scope item: `2` (production observability baseline)
- Verification date: 2026-03-04

## Verification Coverage

- Request latency visibility (p50/p95/p99) for key routes
- Webhook failure alert routing verification
- Error-tracking coverage status

## Commands and Checks

Latency sampling artifact (25 samples/route):

- `pnpm verify:latency:routes`
- output artifact: `/tmp/stage1_item2_latency_20260304/route-latency.md`
- rerun artifact: `/tmp/stage1_item2_latency_20260304_rerun/route-latency.md`

Webhook failure alert routing verification:

- failing TikTok webhook call (expected 500 in local env with missing AI generation URL)
- pending + claim notification checks:
  - `notifications:listPendingNotificationEvents`
  - `notifications:claimNextPendingNotification`
- artifacts under `/tmp/stage1_item2_webhook_alert_routing_20260304_live2/`

## Results

### 1) Latency visibility

From `/tmp/stage1_item2_latency_20260304_rerun/route-latency.md`:

- `/api/health/orchestration` GET: p50 `7.59ms`, p95 `8.70ms`, p99 `9.25ms`
- `/api/webhooks/stripe` POST: p50 `7.91ms`, p95 `8.54ms`, p99 `8.84ms`
- `/api/webhooks/instagram/comments` POST: p50 `7.73ms`, p95 `8.46ms`, p99 `9.00ms`
- `/api/webhooks/tiktok/comments` POST: p50 `7.46ms`, p95 `8.23ms`, p99 `8.88ms`

This satisfies the stage requirement for p50/p95/p99 visibility on key routes.

### 2) Webhook failure alert routing

From `/tmp/stage1_item2_webhook_alert_routing_20260304_live2/`:

- failing webhook returned HTTP `500` with error payload.
- `notificationEvents` pending record captured:
  - `eventType: "webhook_processing_failed"`
  - payload includes `platform`, `route`, `error`, and `statusCode`.
- claim mutation returned recipient fields and same event metadata.

This verifies alert enqueue + actionable routing path for webhook processing failures.

### 3) Error-tracking status

Current evidence in this cycle confirms runtime failure capture through webhook failure alert events and logs, but does not yet include an external error-tracking provider dashboard/query capture in this branch.

## Artifact Paths

- `/tmp/stage1_item2_latency_20260304/orchestration-health.json`
- `/tmp/stage1_item2_latency_20260304/route-latency.md`
- `/tmp/stage1_item2_latency_20260304_rerun/route-latency.md`
- `/tmp/stage1_item2_webhook_alert_routing_20260304_live2/orchestration-health.json`
- `/tmp/stage1_item2_webhook_alert_routing_20260304_live2/tiktok-status.txt`
- `/tmp/stage1_item2_webhook_alert_routing_20260304_live2/tiktok-response.json`
- `/tmp/stage1_item2_webhook_alert_routing_20260304_live2/pending-notifications.json`
- `/tmp/stage1_item2_webhook_alert_routing_20260304_live2/claimed-notification.json`
- `/tmp/stage1_item2_webhook_alert_routing_20260304_live2/dev-web.tail.log`

## Conclusion

Stage 1 Item 2 evidence is now consolidated for latency and webhook alert routing with concrete artifacts. Item 2 remains `PENDING` until owner signoff and explicit error-tracking provider verification evidence are recorded.
