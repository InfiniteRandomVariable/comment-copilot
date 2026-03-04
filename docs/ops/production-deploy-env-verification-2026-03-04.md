# Production Deploy Env Verification (2026-03-04)

## Metadata

- Date (UTC): 2026-03-04
- Scope item: Stage 1 Item 4 (deploy/env checklist)
- Command: `pnpm verify:deploy:env`

## Result

- Status: FAIL
- Mode detected: `inline`
- Missing required env vars:
  - `SOCIAL_TOKEN_ENCRYPTION_KEY`
  - `INSTAGRAM_WEBHOOK_SECRET`
  - `INSTAGRAM_COMMENT_REPLY_URL_TEMPLATE`
  - `TIKTOK_COMMENT_REPLY_URL`
  - `AI_API_KEY`
  - `AI_CHAT_COMPLETIONS_URL`
  - `AI_MODERATION_MODEL`
  - `AI_MODERATION_URL`

## Follow-up

1. Populate missing vars in the target deploy environment.
2. Re-run `pnpm verify:deploy:env` and attach PASS output.
3. Execute deploy dry-run smoke checks and attach evidence.
