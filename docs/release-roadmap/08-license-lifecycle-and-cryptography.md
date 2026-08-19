# Step 08 — Harden License Lifecycle and Cryptography

## Outcome

Specify and qualify the full license lifecycle: issue, activate, validate offline, refresh online, renew, change seats/tier, revoke, refund, expire, rotate keys, and recover from compromise.

## Product view

Offline verification and online lifecycle controls must complement each other. A signed token proves integrity; it does not by itself provide current revocation or subscription state.

## Planned repository changes

### Core

- Version license claims and validate issuer, audience, product, tier, seats, issuance, not-before, expiry, key id, and signature algorithm.
- Support a bounded offline lease/grace model and key rotation without embedding private material.
- Make parsing, verification, policy evaluation, and storage separate deep modules with safe errors.

### Vectalon

- Implement activation/refresh UX, atomic secure storage, stale-license warnings, and connectivity-aware degradation.
- Ensure packaged public keys and core revision are traceable in release provenance.
- Add migrations for existing license files and safe rollback behavior.

### Admin

- Own private-key custody, issuance, rotation, revocation, seat/tier amendments, refund effects, and audit.
- Separate signing duties from general dashboard access and support emergency key compromise procedures.
- Provide idempotent lifecycle commands and reconciliation reporting.

## Deliverables

- Claims schema, lifecycle state machine, key-management runbook, rotation drill, migration plan, and golden vectors.

## Reviewer gate

- Private keys never enter Vectalon or Core repositories/build artifacts.
- Old/new key overlap and compromised-key rejection are exercised.
- Every lifecycle transition is idempotent, authorized, and auditable.

## Risks and dependencies

- Depends on Steps 03, 06, and 07.
- Core verification and lifecycle design can proceed first; production signing, custody, and lifecycle mutations depend on Steps 10–11.
- Legal/product decisions are required for offline grace duration and seat enforcement.

## Implementation sequence

1. **Specify the lifecycle state machine.** Model pending, active, grace, suspended, expired, canceled, refunded, revoked, and superseded states; list authorized triggers and effective-time rules for every transition.
2. **Choose cryptographic policy.** Core records supported asymmetric algorithms, canonical encoding, issuer/audience rules, maximum lifetimes, key IDs, clock skew, algorithm rejection, and key-set format. Private keys and provider secrets never enter Core or Vectalon.
3. **Separate deep modules.** Core implements strict parsing, signature/key selection, claim validation, entitlement evaluation, and atomic storage as separate APIs with safe typed failures and injected clock/key sources.
4. **Build Admin key custody.** Use a managed KMS/HSM-capable signer, environment-separated keys, least-privilege signing identity, dual-control rotation/revocation, immutable audit, and no private-key export in normal operation.
5. **Implement idempotent commands.** Admin issue, activate, refresh, amend seats/tier, renew, suspend, revoke, refund, and replace operations use idempotency keys, optimistic concurrency, and immutable history.
6. **Implement customer lifecycle UX.** Vectalon provides activation, status, refresh, device transfer/recovery, stale/revoked messaging, atomic secure storage, and a documented offline degradation path.
7. **Exercise rotation and compromise.** Golden vectors cover old/new overlap, unknown/retired/compromised keys, malformed claims, algorithm confusion, clock boundaries, corrupted storage, and rollback to the previous product release.

## Commercial and legal decisions

- Replace the ambiguous “refunds revoke instantly” claim with a measured revocation SLA backed by online-check cadence and offline lease duration.
- Define cancellation versus termination access, refund effects, seat reassignment, device limits, and customer export/recovery.
- Reconcile the commercial license’s 30-day termination language and “all current and future products” promise with subscription state and product-scoped claims.
- Define which BSL users need a credential and how offline small-team use is represented without private telemetry.

## Required evidence

- Core golden vectors shared with Admin/Vectalon, property/fuzz tests, and no-secret repository/build scans.
- Admin KMS policy, state-machine integration tests, concurrency/idempotency tests, audit proof, rotation drill, and compromise runbook.
- Vectalon clean-install, upgrade, rollback, offline-expiry, refresh, and recovery tests against the packed artifact.
- Reviewer independently validates public-key provenance, algorithm allowlists, lifecycle transitions, and private-key isolation.

## Exit and rollback

Exit requires a rehearsed rotation and a complete lifecycle from purchase-derived issuance through revocation/recovery. Rollback retains verification for previously issued compatible claims and never restores a compromised key.

## Non-goals

- Home-grown cryptographic primitives.
- Indefinite offline licenses without a separately approved enterprise policy.
