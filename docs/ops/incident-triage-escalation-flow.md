# Incident Triage and Escalation Flow

## Goal

Standardize how Stage 1 operational incidents are classified, assigned, and escalated.

## Scope

Applies to:

- Webhook ingestion/replay incidents
- Provider outage incidents
- Token/billing incidents

## Severity Matrix

| Severity | Definition | Initial Response Target | Escalation Trigger |
| --- | --- | --- | --- |
| Sev-1 | Broad service outage or high customer impact | 5 minutes | Immediate leadership escalation |
| Sev-2 | Partial degradation with customer impact | 10 minutes | No mitigation within 30 minutes |
| Sev-3 | Limited impact or internal-only issue | 30 minutes | Scope grows or repeats |

## Triage Workflow

1. Acknowledge alert/report and open an incident log entry.
2. Classify severity using matrix above.
3. Assign incident commander (IC) and technical owner.
4. Select matching runbook:
   - `docs/ops/webhook-replay-runbook.md`
   - `docs/ops/provider-outage-runbook.md`
   - `docs/ops/token-billing-incident-runbook.md`
5. Execute containment and recovery steps.
6. Update status every 15 minutes for Sev-1/Sev-2.
7. Close incident with verification and follow-up actions.

## Escalation Roster (Role-Based)

- IC: App On-Call Engineer
- Tier 2: Platform Integrations Owner / Billing Owner (incident dependent)
- Tier 3: Engineering Lead
- Stakeholders: Product + Support lead for customer-facing incidents

## Communication Cadence

- Sev-1: status update every 15 minutes
- Sev-2: status update every 30 minutes
- Sev-3: updates at milestone changes

## Closure Requirements

- Incident timeline in UTC
- Root-cause summary (or interim hypothesis)
- Verification evidence
- Action items with owners and target dates
