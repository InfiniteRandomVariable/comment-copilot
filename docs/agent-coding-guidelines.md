# Agent Coding Guidelines

## Purpose
Define coding style and implementation standards for this app so agent-driven changes remain consistent and maintainable.

## Scope
This document governs coding and implementation style.
It does not replace stage gates or release policy.
For phase/stage governance, use `docs/dev-phase-policy.md` and the active stage docs.

## Core Principles
- Prefer clarity over cleverness.
- Keep changes small, scoped, and reversible.
- Preserve existing architecture and naming patterns unless there is a concrete reason to change them.
- Make behavior explicit with tests when logic changes.

## Code Structure
- Keep business logic out of page components when complexity grows.
- Extract pure helpers for deterministic logic and test those helpers directly.
- Prefer single-responsibility modules over large mixed files.
- Co-locate feature-specific logic with the feature when practical.

## TypeScript Standards
- Use explicit types on exported functions and public data shapes.
- Avoid `any`; narrow unknown inputs with guards.
- Prefer union types and literals for domain states.
- Keep utility functions pure when possible.

## React / Next.js Standards
- Keep pages focused on data loading + rendering composition.
- Move domain calculations to shared helpers (`convex/lib` or feature helper modules).
- Use clear loading/error states with actionable text.
- Do not introduce hidden side effects in render paths.

## Convex Standards
- Use strict argument validators for mutations/queries.
- Keep query handlers read-only and deterministic.
- Keep mutation handlers focused on one transactional intent.
- Reuse shared domain helpers for repeated calculations.

## UX And Copy Standards
- Prefer concise, specific labels and status text.
- Show state with clear severity semantics (good/warning/critical/neutral).
- For operator actions, pair status with next-step guidance.
- Preserve consistency with existing color and typography tokens.

## Testing Standards
- Add or update tests whenever behavior changes.
- Prefer integration tests for user-visible workflow behavior.
- Prefer pure unit-style tests for deterministic aggregation/formatting logic.
- Validate edge cases for status transitions and threshold boundaries.

## Logging And Observability
- Log events with stable event names and structured fields.
- Avoid noisy logs for normal paths; reserve warning/error levels for actionable failures.
- Keep telemetry names consistent with existing naming patterns.

## Documentation Standards
- Update evidence/tracker docs when stage-related behavior changes.
- Document new operator-facing workflows where users need explicit run steps.
- Link to canonical docs instead of duplicating policy text.

## Change Hygiene
- Avoid unrelated edits in the same change set.
- Keep generated artifacts out of commits unless required for correctness.
- Prefer minimal file footprint for each task.

## Skill Integration
- If you create a skill for these guidelines, keep `SKILL.md` concise and reference this file from `.skills/app-dev-coding-guide/references/`.
- Do not duplicate this document into the skill folder.
