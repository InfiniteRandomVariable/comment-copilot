# Webhook Replay Runbook

## Scope

Replay missed or failed inbound comment webhooks for:

- `POST /api/webhooks/instagram/comments`
- `POST /api/webhooks/tiktok/comments`

This runbook is for Stage 1 incident response only and focuses on safe replay without creating duplicate downstream workflow starts.

## Trigger Conditions

Start this runbook when one or more are true:

- Webhook endpoint returns sustained `5xx` or provider retries spike.
- Signature or secret misconfiguration caused valid events to be rejected (`400`/`401`).
- Ops detects missing inbox comments compared to provider-side event logs.
- Incident commander requests deterministic replay for a known outage window.

## Preconditions

- App is reachable at `APP_URL` (default local: `http://localhost:3100`).
- Required webhook secrets are present in runtime env:
  - `INSTAGRAM_WEBHOOK_SECRET` (or `INSTAGRAM_APP_SECRET`)
  - `TIKTOK_WEBHOOK_SECRET` (or `TIKTOK_CLIENT_SECRET`)
- Target `accountId` and affected `platformCommentId` values are identified from incident logs.

## Triage And Stabilization

1. Record incident start time, affected platform(s), and suspected root cause.
2. Confirm current endpoint behavior:
   - `curl -i "$APP_URL/api/webhooks/instagram/comments"` should not return network/connectivity errors.
   - `curl -i "$APP_URL/api/webhooks/tiktok/comments"` should not return network/connectivity errors.
3. If secrets are misconfigured, fix env first and redeploy before replay.
4. Build a replay batch from provider/audit logs with required payload fields:
   - `accountId`
   - `platformCommentId`
   - `platformPostId`
   - `commenterPlatformId`
   - `text`

## Replay Procedure

### A) TikTok replay (single event)

1. Prepare payload JSON:

```json
{
  "accountId": "<convex_account_id>",
  "platformCommentId": "<provider_comment_id>",
  "platformPostId": "<provider_post_id>",
  "commenterPlatformId": "<provider_user_id>",
  "text": "original comment text"
}
```

2. Generate timestamp and signature:

```bash
timestamp="$(date +%s)"
payload='{"accountId":"<id>","platformCommentId":"<comment>","platformPostId":"<post>","commenterPlatformId":"<user>","text":"<text>"}'
signature="$(printf '%s' "$timestamp.$payload" | openssl dgst -sha256 -hmac "$TIKTOK_WEBHOOK_SECRET" -hex | sed 's/^.* //')"
```

3. Send replay request:

```bash
curl -sS -X POST "$APP_URL/api/webhooks/tiktok/comments" \
  -H "content-type: application/json" \
  -H "x-tiktok-signature: $signature" \
  -H "x-tiktok-request-timestamp: $timestamp" \
  --data "$payload"
```

Expected result: HTTP `200` with `{"ok":true}`.

### B) Instagram replay (single event)

1. Prepare payload JSON with the same required fields.
2. Generate signature:

```bash
payload='{"accountId":"<id>","platformCommentId":"<comment>","platformPostId":"<post>","commenterPlatformId":"<user>","text":"<text>"}'
signature="sha256=$(printf '%s' "$payload" | openssl dgst -sha256 -hmac "$INSTAGRAM_WEBHOOK_SECRET" -hex | sed 's/^.* //')"
```

3. Send replay request:

```bash
curl -sS -X POST "$APP_URL/api/webhooks/instagram/comments" \
  -H "content-type: application/json" \
  -H "x-hub-signature-256: $signature" \
  --data "$payload"
```

Expected result: HTTP `200` with `{"ok":true}`.

### C) Batch replay guidance

- Replay oldest events first to preserve ordering assumptions.
- Use controlled batches (for example, 50 events per batch) and verify between batches.
- Keep a replay ledger (timestamp, platform, `platformCommentId`, result code, operator).

## Verification

After each batch:

1. Confirm webhook response status and body (`200` + `ok: true`).
2. Verify comment ingestion in Convex:

```bash
pnpm exec convex run comments:listInboxComments '{"accountId":"<accountId>","status":"pending_review"}' --typecheck disable --codegen disable
```

3. Confirm expected `platformCommentId` values are present.
4. Re-send one already-replayed payload and confirm no duplicate processing symptoms:
   - request still returns `200`,
   - no duplicate comment rows for the same `(platform, platformCommentId)` key.

## Rollback / Exit Criteria

Stop replay immediately and escalate if:

- replay requests return sustained `5xx`,
- signature errors persist after env correction,
- data integrity checks show unexpected duplicates or cross-account ingestion.

Exit this runbook when all are true:

- affected backlog is replayed,
- expected comments are visible in inbox queries,
- incident timeline and replay ledger are attached to the incident ticket.

## Owner And Escalation Path

- Primary owner: Backend on-call engineer.
- Secondary owner: Product/operations owner for creator-facing impact decisions.
- Escalate to incident commander when:
  - replay exceeds 30 minutes without backlog reduction,
  - data integrity concerns are detected,
  - provider-side outage prevents successful replay.

## Evidence Artifacts To Attach

- Replay command history (sanitized; no secrets).
- Convex verification outputs for sampled comment IDs.
- Incident notes with start/end times, operator, and outcome.
