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
