# Webhook Alert Routing Verification (2026-03-04)

## Scope

- Stage: `stage-1`
- Scope item: `2` (production observability baseline)
- Verification target: webhook failure alerting with actionable routing for comment webhook failures.

## Commands Run

```bash
pnpm dev:convex
pnpm dev:web
curl -sS http://localhost:3100/api/health/orchestration
pnpm exec convex run devSeed:getFirstAccountId --typecheck disable --codegen disable
curl -sS -o /tmp/stage1_item2_webhook_alert_routing_20260304_live2/tiktok-response.json -w "%{http_code}" \
  -X POST "http://localhost:3100/api/webhooks/tiktok/comments" \
  -H "content-type: application/json" \
  -H "x-tiktok-signature: sha256=<computed>" \
  --data @/tmp/stage1_item2_webhook_alert_routing_20260304_live2/request-payload.json
pnpm exec convex run notifications:listPendingNotificationEvents "{\"accountId\":\"j5746ef9edrcmn7mase0qcm0t1822tb7\",\"limit\":20}" --typecheck disable --codegen disable
pnpm exec convex run notifications:claimNextPendingNotification "{\"accountId\":\"j5746ef9edrcmn7mase0qcm0t1822tb7\",\"maxAttempts\":5}" --typecheck disable --codegen disable
```

## Results

- Webhook request returned HTTP `500` with expected processing error:
  - `{"ok":false,"error":"AI_CHAT_COMPLETIONS_URL is not set for worker generation"}`
- A notification event was created with:
  - `eventType: "webhook_processing_failed"`
  - `status: "pending"`
  - payload containing `platform`, `route`, `error`, and `statusCode`.
- Claiming the next pending notification (account-scoped) returned:
  - `eventType: "webhook_processing_failed"`
  - recipient resolution fields (`recipientEmail`, `recipientName`).

## Artifacts

- `/tmp/stage1_item2_webhook_alert_routing_20260304_live2/tiktok-status.txt`
- `/tmp/stage1_item2_webhook_alert_routing_20260304_live2/tiktok-response.json`
- `/tmp/stage1_item2_webhook_alert_routing_20260304_live2/pending-notifications.json`
- `/tmp/stage1_item2_webhook_alert_routing_20260304_live2/claimed-notification.json`
- `/tmp/stage1_item2_webhook_alert_routing_20260304_live2/dev-web.tail.log`

## Conclusion

Webhook failure alert routing is verified for TikTok comment webhook failure path and notification claim path. This covers the alert enqueue + routing evidence for Stage 1 Item 2 in the current increment.
