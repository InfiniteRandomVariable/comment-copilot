# Webhook Replay Runbook

## Purpose

Recover from failed or dropped webhook processing for comment ingestion routes without introducing duplicate side effects.

## Trigger Conditions

Start this runbook when any of the following is observed:

- Repeated non-2xx responses from `/api/webhooks/tiktok/comments` or `/api/webhooks/instagram/comments`.
- Alert email/event for `webhook_processing_failed`.
- Missing expected comment ingestion in inbox relative to provider delivery logs.

## Primary Owners

- Primary: App On-Call Engineer
- Secondary: Platform Integrations Owner

## Triage Inputs

Collect before replaying:

- Platform (`tiktok` or `instagram`)
- Endpoint path
- Raw payload body
- Signature header values
- First failure timestamp (UTC)
- Error response body and HTTP code

## Replay Procedure

1. Confirm service health:

```bash
curl -sS http://localhost:3100/api/health/orchestration
```

2. Verify the target account exists:

```bash
pnpm exec convex run devSeed:getFirstAccountId --typecheck disable --codegen disable
```

3. Save original webhook payload to a file (example):

```bash
cat > /tmp/webhook-replay-payload.json <<'JSON'
{ "accountId": "<accountId>", "platformCommentId": "<id>", "...": "..." }
JSON
```

4. Recompute signature with the configured webhook secret and replay to the same route:

```bash
SIG=$(cat /tmp/webhook-replay-payload.json | openssl dgst -sha256 -hmac "$TIKTOK_WEBHOOK_SECRET" -binary | base64)
curl -sS -o /tmp/webhook-replay-response.json -w "%{http_code}" \
  -X POST "http://localhost:3100/api/webhooks/tiktok/comments" \
  -H "content-type: application/json" \
  -H "x-tiktok-signature: sha256=${SIG}" \
  --data-binary @/tmp/webhook-replay-payload.json
```

5. If replay still fails, capture response and escalate (see triage/escalation flow).

## Verification Checklist

- Replay returns HTTP 200.
- Response body contains `{ "ok": true }`.
- Comment appears in inbox/review flow for target account.
- No duplicate send/reply side effects are observed.

## Rollback / Exit Criteria

Rollback from active replay attempts when:

- Signature validation cannot be reproduced safely.
- Payload integrity cannot be confirmed.
- Multiple replay attempts return persistent 5xx.

Exit incident when:

- Webhook route stabilizes at expected success/error baseline.
- Backlog is processed or explicitly queued for follow-up.
- Incident summary and artifacts are logged.

## Escalation Path

- 0-15 min: App On-Call Engineer
- 15-30 min: Platform Integrations Owner
- 30+ min or customer-visible impact: Engineering Lead + Product/Support lead

## Required Artifacts

- Replay payload file path
- Replay command and response status/body
- Relevant web logs and Convex logs
- Final incident note with root cause and follow-ups
