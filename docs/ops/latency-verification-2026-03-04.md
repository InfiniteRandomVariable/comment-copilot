# Route Latency Verification (2026-03-04)

## Metadata

- Date (UTC): 2026-03-04
- Scope item: Stage 1 Item 2 (observability baseline)
- Command: `APP_URL=http://localhost:3100 SAMPLES=25 pnpm verify:latency:routes`

## Results

| Route | Method | p50_ms | p95_ms | p99_ms | avg_ms | statuses |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `/api/health/orchestration` | `GET` | 7.59 | 8.70 | 9.25 | 7.55 | `200x25` |
| `/api/webhooks/stripe` | `POST` | 7.91 | 8.54 | 8.84 | 7.77 | `400x25` |
| `/api/webhooks/instagram/comments` | `POST` | 7.73 | 8.46 | 9.00 | 7.75 | `400x25` |
| `/api/webhooks/tiktok/comments` | `POST` | 7.46 | 8.23 | 8.88 | 7.59 | `400x25` |

## Artifact

- Raw report: `/tmp/stage1_item2_latency_20260304_rerun/route-latency.md`

## Notes

- Route status profile is expected for this verification path:
  - health endpoint returns `200`,
  - webhook endpoints return `400` when signature headers are intentionally omitted.
- Item 2 remains in progress until alert-routing evidence is also completed.
