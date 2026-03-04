# Billing and Token Metering

## Policy defaults

- Free plan included tokens: 10,000 per calendar month.
- Warning threshold: 8,000 tokens.
- Free plan hard stop: above 10,000 tokens generation is blocked.
- Paid overage estimate: $1.99 per additional 50,000 tokens.

## Data model

- `billingAccounts`: plan and Stripe linkage per account.
- `monthlyTokenUsage`: running monthly counters and threshold timestamps.
- `tokenReservations`: pre-generation reservations for deterministic cap checks.
- `tokenUsageEvents`: reserve/finalize event ledger.
- `notificationEvents`: `pending -> sending -> sent/failed` warning and cap notifications with retry metadata.

## Runtime flow

1. Worker calls `billing:reserveTokensForGeneration` before generation.
2. If free-tier cap would be exceeded, mutation throws `FREE_TIER_TOKEN_CAP_REACHED`.
3. On successful generation, worker calls `billing:finalizeTokenReservation` with actual token counts.
4. Notification worker claims `pending` events, moves them to `sending`, and marks `sent/failed`.

## Notification worker

- Start command: `pnpm dev:notifications`
- Delivery modes:
  - `NOTIFICATION_DELIVERY_MODE=log` (default, prints instead of sending)
  - `NOTIFICATION_DELIVERY_MODE=resend` (real emails via Resend API)
  - `NOTIFICATION_DELIVERY_MODE=ses` (real emails via AWS SES)
- Required for resend mode:
  - `RESEND_API_KEY`
  - `NOTIFICATION_FROM_EMAIL`
- Required for SES mode:
  - `SES_REGION`
  - `SES_FROM_EMAIL` (or fallback `NOTIFICATION_FROM_EMAIL`)
  - AWS credentials available in worker runtime

## Stripe integration surface

`POST /api/webhooks/stripe` performs signature verification and maps lifecycle events into billing state.

Metadata requirements:
- Include `accountId` in Stripe metadata when creating subscriptions/checkout sessions.
- If metadata is missing on later events, resolver falls back to stored `stripeCustomerId` or `stripeSubscriptionId`.

Idempotency:
- Each Stripe event id is recorded in `stripeWebhookEvents`.
- Duplicate event ids are ignored safely.
