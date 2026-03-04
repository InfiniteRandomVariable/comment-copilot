# Convex Backend

This folder contains the primary app schema and data logic.

Key modules:
- `schema.ts`: core data model.
- `comments.ts`: webhook ingestion and inbox queries.
- `persona.ts`: owner persona controls.
- `skills.ts`: skill generation/versioning/approval lifecycle.
- `drafts.ts`: active candidate routing and creation.
- `reviews.ts`: active send/reject/cleanup review mutations.
- `agentRuns.ts`: workflow stage logging.
