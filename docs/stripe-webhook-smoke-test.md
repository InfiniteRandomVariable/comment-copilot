# Stripe Webhook Smoke Test

## Prerequisites

1. `apps/web` is running locally on port `3100`.
2. `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set in `.env.local`.

## A) Fast local check (no Stripe CLI)

This verifies signature enforcement behavior.

```bash
cd comment-copilot
APP_URL=http://localhost:3100 ./scripts/smoke-stripe-webhook.sh
```

Expected result:
- Script passes only if `/api/webhooks/stripe` returns HTTP `400` when `stripe-signature` is missing.

## B) Real signed webhook check (Stripe CLI)

1. Forward webhooks to your local endpoint:

```bash
stripe listen --forward-to localhost:3100/api/webhooks/stripe
```

2. In another terminal, trigger a lifecycle event:

```bash
stripe trigger customer.subscription.updated
```

3. Confirm event processing:
- Next.js logs show successful webhook handling.
- Convex `stripeWebhookEvents` records the event id with `processed` status.
- `billingAccounts` updates `planType` and `billingStatus`.

## Notes

- For deterministic account linking, include `accountId` in Stripe metadata when creating checkout/session/subscription.
- If metadata is missing, account resolution falls back to stored `stripeCustomerId` or `stripeSubscriptionId`.
