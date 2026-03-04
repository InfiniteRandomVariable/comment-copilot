# Notification Worker

The notification worker sends email alerts for token thresholds (`8k warning`, `10k cap reached`) and webhook failures (`webhook_processing_failed`) by consuming `notificationEvents`.

## Start

```bash
cd /Users/kevinlau/Documents/Dev/MyMarketPlaceGuard/tempFiles/comment-copilot
pnpm dev:notifications
```

## Environment variables

- `NOTIFICATION_DELIVERY_MODE=log|resend|ses` (default `log`)
- `NOTIFICATION_POLL_MS` (default `5000`)
- `NOTIFICATION_MAX_ATTEMPTS` (default `5`)
- `CONVEX_URL` (required)

For resend mode:
- `RESEND_API_KEY`
- `NOTIFICATION_FROM_EMAIL`

For SES mode:
- `SES_REGION`
- `SES_FROM_EMAIL` (falls back to `NOTIFICATION_FROM_EMAIL`)
- AWS credentials available to the process (env vars, shared config, or IAM role)

## Event lifecycle

- `pending`: queued and waiting
- `sending`: claimed by worker
- `sent`: delivered successfully
- `failed`: exhausted retries or non-retryable failure

## Local test flow

1. Ensure `pnpm dev:convex` is running.
2. Start worker: `pnpm dev:notifications`.
3. Enqueue a test event in Convex dashboard or via function call:
   - `notifications:enqueueNotificationEvent`
4. Confirm event transitions to `sent` (log mode) or receives email (resend mode).
