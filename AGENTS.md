# AGENTS.md

## Purpose
Use this file as the always-on contributor contract for agent-driven development in this repository.

## Instruction Order
1. System/developer runtime instructions
2. This `AGENTS.md`
3. `docs/agent-coding-guidelines.md`
4. Phase/stage governance docs (`docs/dev-phase-policy.md` and active stage boundary/evidence docs)

## Always Required
- Read active stage from `docs/dev-phase-policy.md` before making changes.
- Stay within active stage scope; record out-of-scope requests in the active stage doc's `Deferred Work` section.
- Run required gates before finalizing work:
  - `pnpm verify:phase-boundary`
  - `pnpm ci:check`

## Single Source Of Truth
- Canonical coding style and implementation guidance lives in:
  - `docs/agent-coding-guidelines.md`
- Avoid duplicating style rules in other docs; link to that file instead.

## Skill Convention
- Repo-local skills live under `.skills/`.
- App-wide coding guideline skill path:
  - `.skills/app-dev-coding-guide/SKILL.md`
- Keep reusable references under:
  - `.skills/app-dev-coding-guide/references/`
