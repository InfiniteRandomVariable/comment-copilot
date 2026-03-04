# Dev Seed Utility

Use this when `accounts` is empty and you need an `accountId` for tests.

## Functions

- `devSeed:seedDefaultAccount` (mutation)
- `devSeed:getFirstAccountId` (query)

## Quick start

1. Open Convex dashboard -> Functions.
2. Run mutation `devSeed:seedDefaultAccount` with `{}`.
3. Copy returned `accountId`.
4. Use that `accountId` in `notifications:enqueueNotificationEvent`.

## Optional custom payload

```json
{
  "clerkUserId": "dev_clerk_user_2",
  "email": "lauyukpui@yahoo.com",
  "displayName": "Creator Two",
  "platform": "instagram",
  "platformAccountId": "dev-instagram-acct-002",
  "handle": "creator2",
  "accountDisplayName": "Creator Two Account"
}
```

## Idempotency behavior

- Re-running with same `clerkUserId` + `platformAccountId` will reuse/update existing rows.
- Billing profile is auto-created if missing.
