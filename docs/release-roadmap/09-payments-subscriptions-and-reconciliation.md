# Step 09 — Complete Payments, Subscriptions, and Reconciliation

## Outcome

Turn checkout and webhooks into an auditable commercial ledger that stays correct through retries, out-of-order events, upgrades, downgrades, cancellations, failed payments, renewals, and refunds.

## Product view

The payment provider is an event source, not the product database. Entitlements must derive from reconciled commercial state, with a clear path from checkout selection to license claims.

## Planned repository changes

### Core

- Define provider-neutral subscription and entitlement inputs without depending on Lemon Squeezy payloads.
- Version tier/product mapping and reject unknown commercial states safely.
- Supply deterministic policy tests for grace, cancellation, renewal, and downgrade timing.

### Vectalon

- Generate checkout choices from the canonical product manifest and preserve product/plan attribution securely.
- Verify webhook signatures over raw bodies, normalize events, and expose customer-safe post-checkout status.
- Add API contract and failure tests without leaking provider secrets to the client bundle.

### Admin

- Persist immutable provider events, idempotency keys, normalized subscription state, reconciliation status, and operator actions.
- Add scheduled provider reconciliation and queues for poison/out-of-order events.
- Surface MRR/ARR only from reconciled state with definitions for discounts, tax, currency, and refunds.

## Deliverables

- Commercial state machine, event mapping, reconciliation job design, accounting definitions, and failure playbook.

## Reviewer gate

- Replaying all provider events produces the same final state.
- Duplicate and out-of-order deliveries cannot double-issue or incorrectly revoke licenses.
- Every displayed revenue number has a documented formula and source.

## Risks and dependencies

- Depends on Steps 05 and 08.
- Provider sandbox and production event differences require captured contract fixtures.
