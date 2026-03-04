# Incident Triage and Escalation Flow

## Purpose

Provide a single, repeatable incident triage and escalation process for Stage 1 operational incidents.

Applies to:

- webhook ingestion failures,
- provider outages (Instagram/TikTok/Stripe surfaces),
- token/billing incident conditions,
- deployment regressions after release.

## Severity Levels

- `SEV-1`: broad creator-facing impact, no safe workaround, high urgency.
- `SEV-2`: partial impact, degraded behavior, workaround exists.
- `SEV-3`: limited or single-account impact with low systemic risk.

Severity can be raised at any time as new evidence appears.

## Roles

- Incident Commander (IC): owns decisions, prioritization, and status calls.
- Operations Driver: executes triage/remediation commands.
- Communications Owner: posts updates to stakeholders.
- Scribe: maintains timeline and evidence log.

For small incidents one person may hold multiple roles, but IC ownership must remain explicit.

## Trigger Conditions

Open an incident and begin triage when one or more are observed:

- sustained webhook/API failures,
- deployment-related regressions,
- billing/token enforcement mismatches,
- queue backlogs that continue growing,
- user-reported creator-impacting failures with reproducible symptoms.

## Triage Flow

1. Create incident record with:
   - start timestamp (UTC),
   - suspected scope,
   - initial severity,
   - assigned IC.
2. Stabilize and contain:
   - pause risky automation where needed (for example, disable autopilot for impacted accounts),
   - avoid speculative production mutations before baseline state capture.
3. Collect first evidence set:
   - health/status endpoint output,
   - failing request sample (status code + route),
   - impacted account count estimate.
4. Classify incident domain:
   - webhook replay path,
   - provider outage path,
   - token/billing path,
   - deploy rollback path.
5. Route to matching Stage 1 runbook:
   - `docs/ops/webhook-replay-runbook.md`
   - `docs/ops/provider-outage-runbook.md`
   - `docs/ops/token-billing-incident-runbook.md`
   - `docs/ops/production-deploy-checklist.md`

## Escalation Matrix

- Escalate immediately to `SEV-1` if:
  - cross-account/system-wide creator impact is confirmed,
  - data-integrity risk is suspected,
  - rollback decision is required.
- Escalate engineering leadership if:
  - `SEV-2` remains unresolved beyond 30 minutes,
  - incident scope expands during mitigation.
- Escalate product/ops leadership if:
  - customer-facing communication is needed,
  - incident affects billing or account access behavior.

## Communication Cadence

- `SEV-1`: update every 10 minutes.
- `SEV-2`: update every 15 minutes.
- `SEV-3`: update every 30 minutes or at major state changes.

Each update includes:

- current severity,
- impact scope,
- actions completed,
- next action and owner,
- ETA for next update.

## Decision Gates

IC must explicitly call:

1. `Containment Confirmed`
2. `Mitigation In Progress`
3. `Recovery Validation In Progress`
4. `Resolved` or `Rollback Executed`

Do not close incident without all evidence and timeline entries.

## Resolution and Exit

Incident can close when all are true:

- impacted flow is verified healthy,
- backlog/error trend is stable or declining,
- owner confirms no active blocker remains,
- timeline has final root cause summary and follow-up actions.

## Post-Incident Requirements

Within 1 business day:

- document final timeline and root cause,
- list preventive follow-up actions with owners,
- attach artifact links (commands, logs, validation outputs),
- update relevant runbook sections if triage steps were missing or unclear.
