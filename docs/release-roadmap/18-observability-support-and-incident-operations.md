# Step 18 — Operationalize Observability, Support, and Incidents

## Outcome

Make failures detectable, diagnosable, owned, and recoverable across local CLI behavior and hosted commercial services, without compromising privacy.

## Product view

GA readiness includes the ability to support customers after release. Health dashboards alone are insufficient without SLOs, alerts, runbooks, escalation, and recovery authority.

## Planned repository changes

### Core

- Standardize safe error taxonomy, correlation metadata, health results, and support diagnostics contracts.
- Ensure sensitive internals are redacted while preserving actionable root-cause categories.
- Add fault-injection hooks through existing seams rather than production-only branches.

### Vectalon

- Produce bounded, user-reviewable support bundles; add CLI health/status evidence and release/version provenance.
- Define local crash, daemon, MCP, model, native toolchain, and entitlement troubleshooting paths.
- Add public status/support entry points and severity-based customer communication templates.

### Admin

- Build SLO dashboards and alerts for auth, trial, validation, webhook, issuance, reconciliation, and database health.
- Add incident roles, severity model, runbooks, audit-preserving emergency actions, and postmortem workflow.
- Link support cases to customer/commercial state using least privilege.

## Deliverables

- SLO catalog, alert matrix, on-call guide, runbooks, support-bundle specification, incident templates, and game-day results.

## Reviewer gate

- Every critical alert identifies an owner and executable runbook.
- Game days demonstrate detection, mitigation, recovery, and customer communication.
- Diagnostic collection is consensual, bounded, redacted, and deletable.

## Risks and dependencies

- Depends on Steps 11–15.
- Alert volume must be tuned to customer impact, not implementation noise.
