# API Contracts

## Next.js webhook routes

- `POST /api/webhooks/instagram/comments`
- `POST /api/webhooks/tiktok/comments`
- `POST /api/webhooks/stripe`
- `GET /api/health/orchestration`

Instagram webhook requirements:
- `x-hub-signature-256` header must be present.
- Payload must be HMAC SHA-256 signed with `INSTAGRAM_WEBHOOK_SECRET` (fallback `INSTAGRAM_APP_SECRET`).
- Webhook setup challenge uses `GET /api/webhooks/instagram/comments` with `hub.verify_token` matching `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`.

TikTok webhook requirements:
- `x-tiktok-signature` (or `x-tt-signature`) header must be present.
- Payload must be HMAC SHA-256 signed with `TIKTOK_WEBHOOK_SECRET` (fallback `TIKTOK_CLIENT_SECRET`).

Stripe webhook requirements:
- `stripe-signature` header must be present.
- Payload must be signed with `STRIPE_WEBHOOK_SECRET`.
- Supported billing lifecycle events:
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `checkout.session.completed`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`

Orchestration health route (`GET /api/health/orchestration`):
- Returns effective orchestration mode and source (`env` or default fallback).
- Returns raw `COMMENT_ORCHESTRATION_MODE` value (if set) and invalid-value fallback metadata.
- Returns `workerRequired` and resolved `temporalConfig` (`address`, `namespace`, `taskQueue`, plus default-value flags).
- Returns `warnings` for invalid mode values.
- Intended for operational debugging; does not return secrets.

Payload:

```json
{
  "accountId": "<convex_account_id>",
  "platformCommentId": "<provider_comment_id>",
  "platformPostId": "<provider_post_id>",
  "commenterPlatformId": "<provider_user_id>",
  "text": "comment content"
}
```

## OAuth callback route

- `GET /api/oauth/:platform/callback?code=...`
- `POST /api/oauth/:platform/refresh`
- `POST /api/oauth/:platform/disconnect`

Used to complete provider token exchange/account linking, token refresh, and disconnect.

OAuth callback requirements:
- `state` should include `ownerUserId` (JSON or base64url JSON). `clerkUserId` is accepted as fallback to resolve owner user. Optional `returnUrl`.
- For provider-denied auth, callback reads `error` and `error_description` and redirects with `oauth=error`.
- Tokens are stored in `socialAccounts` via encrypted token references.

OAuth refresh payload:

```json
{
  "accountId": "<convex_account_id>"
}
```

OAuth disconnect payload:

```json
{
  "accountId": "<convex_account_id>"
}
```

OAuth disconnect behavior:
- Requires authenticated owner access.
- Removes stored local credentials and deactivates account in app data.
- Attempts provider-side token revocation for TikTok.
- Instagram provider-side revocation is skipped due to a provider API limitation:
  Meta Instagram Basic Display API does not expose a token revocation endpoint.
  Disconnect only removes local credentials; users must revoke app access manually in Instagram/Meta app settings.

## Message/comment data lifecycle

- When a creator resolves an item by `approve+send`, `edit+send`, or `reject`, message/comment-scoped Convex data for that item must be deleted.
- Minimal audit metadata must remain for traceability (for example: `candidateId`, `commentId`, `messageId`, actor, action, timestamp, final status).
- Audit logs are retained for 4 calendar months and purged by a scheduled backend job.
- This lifecycle rule applies to `reviews:*` review resolution mutations.

## Convex functions

- `comments:ingestPlatformComment`
- `comments:listInboxComments`
- `persona:upsertPersonaProfile`
- `skills:generateSkillDraft`
- `skills:generateSkillDraftFromRawInputs`
- `skills:approveSkillVersion`
- `drafts:createReplyCandidate` (active worker routing path)
- `reviews:cleanupResolvedMessageData`
- `autopilot:upsertAutopilotSettings`
- `billing:getUsageSummary`
- `billing:reserveTokensForGeneration`
- `billing:finalizeTokenReservation`
- `billing:upsertBillingAccount`
- `devSeed:seedDefaultAccount` (dev utility)
- `devSeed:getFirstAccountId` (dev utility)
- `notifications:listPendingNotificationEvents`
- `notifications:enqueueNotificationEvent` (testing/admin utility)
- `notifications:claimNextPendingNotification`
- `notifications:markNotificationSent`
- `notifications:markNotificationFailed`
