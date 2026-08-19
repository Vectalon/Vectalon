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

- Offer/state design depends on Steps 05 and 08. Production ingestion, entitlement mutation, and reconciliation also depend on Steps 10–11.
- Provider sandbox and production event differences require captured contract fixtures.

## Implementation sequence

1. **Ratify the offer catalog.** Product leadership resolves Free/Individual/Team/Enterprise scope, currencies, tax display, billing cadence, seat model, trials, coupons, refunds, upgrades/downgrades, product coverage, and enterprise sales handoff. The manifest stores structured values, not formatted price strings alone.
2. **Define the provider-neutral state machine.** Core models commercial inputs and entitlement effects without Lemon Squeezy types. Unknown provider states fail to `pending-review`, never to paid access or destructive revocation.
3. **Secure checkout attribution.** Vectalon generates checkout from the manifest, sends signed server-created product/plan/quantity/customer correlation, validates return status server-side, and never treats a browser redirect as payment proof.
4. **Build immutable ingestion in Admin.** Verify signatures over raw bytes, timestamp/replay bounds, store the original event encrypted/redacted as appropriate, deduplicate by provider event ID, and enqueue normalization transactionally.
5. **Project subscriptions deterministically.** Reducers handle duplicate and out-of-order create, renew, payment-fail, pause, resume, upgrade, downgrade, cancel, expire, dispute, and refund events. License commands use the reconciled projection and idempotency keys.
6. **Add reconciliation.** Scheduled jobs compare provider objects, event ledger, subscription projection, invoices/refunds, and license state; discrepancies enter a retry/dead-letter/operator workflow with safe repair commands.
7. **Define revenue reporting.** Admin calculates MRR/ARR, active seats, churn, refunds, discounts, tax, and currency conversion from documented formulas and immutable inputs; reports expose freshness and reconciliation status.

## Monetisation decisions that block implementation

- Team cannot simultaneously be “$49/developer/month” and “up to 50 seats” without an explicit quantity/bundle rule.
- Decide whether one license covers future SDKs permanently, only during an active subscription, or by purchased product family.
- Define India/global tax invoices, merchant-of-record responsibilities, currency/rounding, refund policy, and enterprise contracting with qualified legal/accounting review.
- Change public “monetization is live” language to beta/configured status until a production purchase-to-entitlement replay test passes.

## Required evidence

- Captured signed sandbox fixtures for every event class plus malformed/replayed/out-of-order cases.
- Deterministic full-ledger replay producing identical subscription/license state and no duplicate issuance.
- Checkout-to-activation end-to-end test, refund/revocation SLA measurement, reconciliation dashboard, and accounting formula fixtures.
- Reviewer compares manifest, checkout product IDs, provider dashboard, commercial license, invoices, entitlement results, and Admin reports for one-to-one consistency.

## Exit and rollback

Exit requires a production-shaped sandbox certification and replayable commercial ledger. If projection code regresses, ingestion continues append-only while entitlement changes pause; raw events are never discarded or edited.

## Non-goals

- Building a payment processor or tax engine.
- Recognising revenue from unreconciled webhooks.
