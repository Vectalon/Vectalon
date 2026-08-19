# Step 11 — Establish Durable Data, Migrations, and Recovery

## Outcome

Create a production data model and operational lifecycle for customers, identities, trials, subscriptions, licenses, entitlements, usage summaries, webhooks, and audit events—with migrations, backups, and restore drills.

## Product view

Commercial correctness depends on durable history. Mutable current-state tables alone cannot explain why a customer was granted or denied access, nor recover safely from provider or operator mistakes.

## Planned repository changes

### Core

- Define storage-neutral domain identifiers, invariants, and serialization contracts.
- Keep persistence adapters outside policy modules and make time/transactions explicit inputs where needed.
- Add compatibility fixtures for records that live longer than a package version.

### Vectalon

- Make public APIs tolerate planned migration windows and return stable degraded responses.
- Remove production dependence on process-local or file-backed commercial state.
- Add client retry/idempotency behavior for transient server failures.

### Admin

- Design normalized schema, constraints, indexes, transaction boundaries, tenant isolation, migration tooling, and seed policy.
- Configure encrypted backups, point-in-time recovery, retention, and restore verification.
- Add data-quality checks and reconciliation queries as release gates.

## Deliverables

- ERD, migration policy, backup/restore runbook, retention schedule, and disaster-recovery evidence.

## Reviewer gate

- Uniqueness and lifecycle invariants are enforced by the database where possible.
- Forward migration, rollback/roll-forward, backup, and restore are rehearsed on production-shaped data.
- No environment can silently select an ephemeral store in production.

## Risks and dependencies

- Depends on Steps 03 and 10.
- Data residency, retention, and deletion requirements must be settled before GA.

## Implementation sequence

1. **Select the production store and tenancy model.** Record region, availability, encryption, connection management, cost envelope, tenant isolation, and operational ownership in an ADR. Local SQLite remains an explicit development adapter only if production cannot select it.
2. **Model durable history.** Design customers, provider identities, organisations/memberships, trials, provider events, subscriptions, invoices/refunds references, licenses, key metadata, revocations, idempotency records, audit events, and reconciliation runs. Separate immutable events from current projections.
3. **Encode invariants in the database.** Unique provider subjects/event IDs, one eligible trial policy, foreign keys, state checks, nonnegative seat quantities, currency consistency, version columns, and append-only audit/event protections belong in constraints where possible.
4. **Create migration discipline.** Numbered reviewed migrations, expand/migrate/contract sequencing, transactional boundaries, lock/time budgets, production-data sampling, compatibility windows, and roll-forward-first recovery are mandatory.
5. **Build repository adapters.** Admin domain modules depend on transaction-aware ports; Core remains persistence-neutral; Vectalon public APIs use stable idempotent contracts and never connect to the database.
6. **Create backup and restore operations.** Encrypted automated backups, point-in-time recovery, access controls, retention/deletion exceptions, restore environments, integrity checks, RPO/RTO targets, and alerting are documented and automated.
7. **Rehearse failure.** Run migrations and restore drills against production-shaped scale, simulate partial deploys, corrupt projections, reconcile from immutable events, and measure downtime/data loss.

## Data-governance decisions

- Define retention for customer, identity, webhook, audit, telemetry, support, and financial records; legal holds override deletion only through audited policy.
- Store money as currency plus integer minor units. Provider IDs are external references, not primary business identities.
- Decide single-tenant versus organisation tenancy before adding Team subscriptions; row filters alone are insufficient without authorization tests.

## Required evidence

- Reviewed ERD/data dictionary, constraints, query/index plans, migration policy, and seed-data policy.
- Fresh-create, upgrade-from-each-supported-version, mixed-version deploy, rollback/roll-forward, backup, restore, and reconciliation test reports.
- Measured RPO/RTO and restore checksum evidence from production-shaped data.
- Reviewer introduces constraint violations and interrupted migrations, confirms safe failure, and traces a customer/license decision back to immutable source events.

## Exit and rollback

Exit requires a successful independent restore drill and zero production code paths to ephemeral commercial storage. Schema rollback is used only when demonstrably safe; otherwise roll forward while compatible binaries remain deployable.

## Non-goals

- Storing source code, prompts, or unnecessary provider payload fields.
- Using dashboards as a substitute for backup/restore evidence.
