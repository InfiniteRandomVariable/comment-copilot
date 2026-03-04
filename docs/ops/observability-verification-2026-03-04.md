# Observability Verification Evidence (2026-03-04)

## Stage Scope

- Stage: `stage-1`
- Scope item: `2` (production observability baseline)
- Verification date: 2026-03-04

## Verification Coverage

- Request latency visibility (p50/p95/p99) for key routes
- Webhook failure alert routing verification
- External error-tracking integration verification

## Commands and Checks

### 1) Latency sampling (25 samples/route)

- `pnpm verify:latency:routes`
- output artifact: `/tmp/stage1_item2_latency_20260304/route-latency.md`
- rerun artifact: `/tmp/stage1_item2_latency_20260304_rerun/route-latency.md`

### 2) Webhook failure alert routing

- failing TikTok webhook call (expected 500 in local env with missing AI generation URL)
- pending + claim notification checks:
  - `notifications:listPendingNotificationEvents`
  - `notifications:claimNextPendingNotification`
- artifacts under `/tmp/stage1_item2_webhook_alert_routing_20260304_live2/`

### 3) External error-tracking sink

- started local ingest endpoint (`http://127.0.0.1:4310/ingest`) as provider stand-in
- ran web app with `ERROR_TRACKING_WEBHOOK_URL=http://127.0.0.1:4310/ingest`
- triggered failing TikTok webhook via:

```bash
APP_URL=http://localhost:3100 VERIFY_CONVEX=0 ./scripts/smoke-tiktok-webhook.sh
```

- verified ingest endpoint received JSON error event payload

### 4) Automated regression coverage

- `pnpm --filter @copilot/web test:webhooks:e2e`
- assertion coverage includes: external error-tracking event dispatch from TikTok and Instagram webhook failure paths

## Results

### 1) Latency visibility

From `/tmp/stage1_item2_latency_20260304_rerun/route-latency.md`:

- `/api/health/orchestration` GET: p50 `7.59ms`, p95 `8.70ms`, p99 `9.25ms`
- `/api/webhooks/stripe` POST: p50 `7.91ms`, p95 `8.54ms`, p99 `8.84ms`
- `/api/webhooks/instagram/comments` POST: p50 `7.73ms`, p95 `8.46ms`, p99 `9.00ms`
- `/api/webhooks/tiktok/comments` POST: p50 `7.46ms`, p95 `8.23ms`, p99 `8.88ms`

This satisfies p50/p95/p99 visibility for key routes.

### 2) Webhook failure alert routing

From `/tmp/stage1_item2_webhook_alert_routing_20260304_live2/`:

- failing webhook returned HTTP `500` with error payload.
- `notificationEvents` pending record captured:
  - `eventType: "webhook_processing_failed"`
  - payload includes `platform`, `route`, `error`, and `statusCode`.
- claim mutation returned recipient fields and same event metadata.

This verifies alert enqueue + actionable routing path for webhook processing failures.

### 3) External error-tracking integration

From `/tmp/stage1_item2_error_tracking_webhook_20260304/`:

- ingest path received: `/ingest`
- captured event payload included:
  - `source: "webhook:tiktok_comments"`
  - `category: "webhook_processing_failed"`
  - `message: "AI_CHAT_COMPLETIONS_URL is not set for worker generation"`
  - route + account metadata and timestamp

This verifies error events are exported to an external sink when configured.

### 4) Automated regression coverage

- `tests/webhooks.e2e.integration.test.ts` passed with 8/8 tests.
- includes cases: `"reports tiktok processing failures to external error tracking webhook"` and `"reports instagram processing failures to external error tracking webhook"`
- validates payload fields (`source`, `category`, `message`, `metadata.route`, `metadata.accountId`, `metadata.statusCode`).

## Artifact Paths

Latency:

- `/tmp/stage1_item2_latency_20260304/orchestration-health.json`
- `/tmp/stage1_item2_latency_20260304/route-latency.md`
- `/tmp/stage1_item2_latency_20260304_rerun/route-latency.md`

Webhook alert routing:

- `/tmp/stage1_item2_webhook_alert_routing_20260304_live2/orchestration-health.json`
- `/tmp/stage1_item2_webhook_alert_routing_20260304_live2/tiktok-status.txt`
- `/tmp/stage1_item2_webhook_alert_routing_20260304_live2/tiktok-response.json`
- `/tmp/stage1_item2_webhook_alert_routing_20260304_live2/pending-notifications.json`
- `/tmp/stage1_item2_webhook_alert_routing_20260304_live2/claimed-notification.json`
- `/tmp/stage1_item2_webhook_alert_routing_20260304_live2/dev-web.tail.log`

Error-tracking sink verification:

- `/tmp/stage1_item2_error_tracking_webhook_20260304/orchestration-health.json`
- `/tmp/stage1_item2_error_tracking_webhook_20260304/tiktok-smoke.log`
- `/tmp/stage1_item2_error_tracking_webhook_20260304/received-path.txt`
- `/tmp/stage1_item2_error_tracking_webhook_20260304/received-headers.json`
- `/tmp/stage1_item2_error_tracking_webhook_20260304/received-body.json`
- `/tmp/stage1_item2_error_tracking_webhook_20260304/dev-web.tail.log`

## Conclusion

Stage 1 Item 2 observability verification now includes latency visibility, webhook failure alert routing, and external error-tracking export evidence. Error sink runtime verification was executed for TikTok, and the same sink helper is wired in TikTok, Instagram, and Stripe catch paths (inferred from route code updates). Item 2 remains `PENDING` until owner signoff.
