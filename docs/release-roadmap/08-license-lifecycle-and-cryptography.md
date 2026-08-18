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
- Legal/product decisions are required for offline grace duration and seat enforcement.
