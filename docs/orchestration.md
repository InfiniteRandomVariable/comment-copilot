# Orchestration Modes

This project supports two webhook orchestration modes for comment workflows:

- `temporal` (default): starts Temporal workflow executions from webhooks.
- `inline`: executes workflow stages directly inside the web API process.

Set mode with:

```bash
COMMENT_ORCHESTRATION_MODE=temporal
# or
COMMENT_ORCHESTRATION_MODE=inline
```

Any other value falls back to `temporal` and logs a warning.
You can verify live runtime resolution via `GET /api/health/orchestration`.
This route also returns:
- `workerRequired` for current mode;
- resolved Temporal config (`address`, `namespace`, `taskQueue`) and whether each uses defaults;
- `warnings` for invalid env values.

## When To Use Each Mode

Use `inline` when:
- you are in early-stage traffic and want lower ops overhead;
- you want to avoid running a Temporal server/worker in local or small deployments.

Use `temporal` when:
- you need stronger durability/retry guarantees;
- you need safer long-running orchestration at higher scale;
- you run multiple web instances and want centralized workflow execution.

## Runtime Behavior

`temporal` mode:
- webhook calls `startCommentWorkflow`;
- workflow ID is deterministic per comment: `comment-<commentId>`;
- already-started Temporal executions are treated as idempotent success.

`inline` mode:
- webhook calls the same entrypoint, but it executes `runCommentWorkflow` in-process;
- in-flight dedupe is process-local by `comment-<commentId>`;
- concurrent duplicate starts on the same process return `alreadyStarted: true`.

Important limits in `inline` mode:
- dedupe is not cross-process (multiple web instances can start in parallel);
- dedupe state resets on process restart.

Existing safety net:
- draft creation/routing in Convex is idempotent per comment, which reduces duplicate side effects even if duplicate inline runs happen.

## Required Processes By Mode

`inline` mode:
- required: `pnpm dev:convex`, `pnpm dev:web`, `pnpm dev:notifications`
- not required: `pnpm dev:worker`

`temporal` mode:
- required: `pnpm dev:convex`, `pnpm dev:web`, `pnpm dev:worker`, `pnpm dev:notifications`

## Cutover: Inline -> Temporal

1. Set `COMMENT_ORCHESTRATION_MODE=temporal` in deployed web env.
2. Ensure Temporal service is reachable (`TEMPORAL_ADDRESS`, optional `TEMPORAL_NAMESPACE`, `TEMPORAL_TASK_QUEUE`).
3. Start and verify `apps/worker` is healthy.
4. Roll web instances with the new env.
5. Monitor for:
   - webhook 5xx rates;
   - workflow start errors;
   - duplicate send anomalies.

## Troubleshooting

If workflows are not starting in `temporal` mode:
- verify `COMMENT_ORCHESTRATION_MODE` is actually `temporal`;
- verify Temporal connection env vars and worker are running.
- check web logs for startup line:
  - `[orchestration] comment workflow mode=... source=... raw=...`
- `pnpm dev:web` runs `pnpm sync:web:env` automatically; if values still look wrong, rerun `pnpm sync:web:env` manually and restart `pnpm dev:web`.

If you see duplicate processing in `inline` mode:
- confirm whether multiple web instances are running (inline dedupe is local only);
- keep relying on Convex idempotency and move to `temporal` mode if this becomes frequent.

If webhook retries happen:
- ingestion only starts workflows when a comment is newly created;
- repeated deliveries should skip re-start when ingest marks `created=false`.
