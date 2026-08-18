# Step 20 — Soak the RC and Prove Production Readiness

## Outcome

Run a controlled internal/design-partner soak long enough to observe installation, repeated daily use, upgrades, commercial state changes, support load, and hosted reliability before GA promotion.

## Product view

The soak validates the whole system in time, not just at one test instant. Evidence should reveal whether the product remains trustworthy over days of use and real lifecycle events.

## Planned repository changes

### Core

- Change only for confirmed RC blockers; require focused regression, compatibility, and migration evidence.
- Track decision/reason-code distributions without collecting source.
- Confirm no policy/version ambiguity across the candidate fleet.

### Vectalon

- Distribute the RC to a bounded cohort with explicit consent, support channel, update path, and rollback.
- Monitor install success, time-to-value, workflow completion, crash/failure categories, resource budgets, and upgrade behavior.
- Validate public docs and support responses against observed customer questions.

### Admin

- Operate candidate trials, purchases, renewals, refunds, revocations, reconciliation, support, and alerts under real runbooks.
- Review access/audit logs daily and reconcile all commercial events.
- Record every manual intervention and convert repeated interventions into blockers or documented procedures.

## Deliverables

- Soak scorecard, cohort report, incident/support log, lifecycle reconciliation, defect trends, and final blocker assessment.

## Reviewer gate

- Defined success/error/support thresholds hold for the full soak window.
- No unexplained entitlement, revenue, data-loss, privacy, or security discrepancy remains.
- Promotion decision is evidence-based and signed by product, engineering, security, and operations owners.

## Risks and dependencies

- Depends on Step 19.
- A small cohort can hide diversity; participant environments must cover the supported matrix.
