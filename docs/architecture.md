# Architecture

## Core services

- `apps/web`: Next.js UI + provider webhook endpoints.
- `convex`: Realtime application data, queries, and mutations.
- `apps/worker`: Temporal workflows and AI activity execution.

See `docs/orchestration.md` for runtime mode selection (`temporal` vs `inline`) and cutover steps.

## Pipeline

1. Context Builder: retrieves active skill and comment context.
2. Reply Generator: reserves token budget, creates draft response, and finalizes usage.
3. Safety Gate: evaluates risk and routes to auto-send or human review.

Lifecycle requirement:
- After a user sends or rejects a message/comment, message/comment-scoped Convex data for that item is deleted.
- Keep only minimal audit metadata for traceability.
- Retain audit logs for 4 calendar months; a daily Convex cron job purges older records.

## Billing and token controls

- Free plan includes 10,000 tokens/month per account.
- Warning event is emitted at 8,000 tokens.
- Hard cap is enforced at 10,000 tokens for free accounts.
- Paid overage is priced at $1.99 per additional 50,000 tokens.
- Usage is tracked with reservation + finalize events for better accounting accuracy.

## Routing policy

Default autopilot settings:
- `enabled = true`
- `maxRiskScore = 0.25`
- `minConfidenceScore = 0.80`

Sensitive topics should be escalated by Safety Gate logic.
