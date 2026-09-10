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

## Task 04 integration evidence (2026-09-09)

**Status: integration-qualified with deployment blockers.** Core `98aee26`, Admin `79bcfca`, and Vectalon `b33dfa0` were exercised together. The golden corpus is byte-identical in Core, Admin, and the packed RN Core runtime (`SHA-256 310bd00dd261965fea049918385a3b714411fcf450542b1bb735a19e1caf754f`). Core replayed the full corpus; Admin lifecycle/key-state tests and RN lifecycle/storage/upgrade/rollback tests passed. An Admin-issued in-memory RS256 credential was accepted by the bundled Core and RN consumers. The packed RN artifact preserves Core source SHA `98aee264a9d9139c058fd11d3e312b384deb2e40`, its public-key manifest, and the vector corpus; extracted-artifact and tracked-source scans found no private key or assigned signing-secret value.

Fresh gates: Core 23 suites / 599 tests; Admin 67 passed with one opt-in live-PostgreSQL test skipped; RN lifecycle/gate/provenance 33 tests; website 20 suites / 101 tests. Core/Admin/RN/website typechecks and production builds passed, as did contract, product, Admin-snapshot provenance, and RN package checks. The integration correction is `643bd87` (generated Core V2 projections and the actual pinned contract revision).

## Final-review remediation evidence (2026-09-10)

The final-review packaging, online-denial, and blocked-status findings were remediated in the Vectalon checkout. The bundled Core package exports the trusted-claims constructor from its root, and RN imports that same runtime boundary as the entitlement evaluator. An isolated tarball extraction test signs an ephemeral RS256 V2 team credential, loads only the packed RN/Core modules (without Jest module mapping or a workspace-Core fallback), and proves the paid gate grants access.

The website now carries a non-retryable terminal lifecycle state in the public refresh response, while retaining finite error codes. RN writes a token-free, atomically renamed denial marker before deleting both current and recoverable records; gates read that marker before any fallback, so an authoritative suspended, expired, canceled, refunded, revoked, or superseded response immediately denies paid access. Retryable offline/timeout/service errors retain the bounded lease. Signed terminal, expired, and stale verification failures retain their fail-closed reason in `auth --status`, `status`, and doctor output rather than falling through to Free tier.

Fresh local evidence: RN build/typecheck plus focused lifecycle, gateway, paid-gate, provenance, and isolated package tests passed (4 suites / 45 tests); website typecheck plus lifecycle contract, refresh route, and in-process signed-token tests passed (3 suites / 13 tests). RN lint completed with zero errors and four pre-existing warnings. The Admin snapshot drift checker still requires the separate Admin source checkout, which was not present in this isolated workspace; no production migration, KMS activation, or live PostgreSQL drill was performed.

Deployment blockers only: do not promote until the approved additive Admin migrations are applied and verified by an authorized database owner; run the live PostgreSQL role/isolation/concurrency drill against an empty disposable staging or CI database; provision the server-only signer/KMS identity and align the durable active key, overlap/retired/compromised public registry, and shipped RN keyset; configure the website database/TLS inputs; and rerun host-restricted sandbox/process-timing cases in CI. No production migration or KMS activation was performed here.

## Exit and rollback

Exit requires a rehearsed rotation and a complete lifecycle from purchase-derived issuance through revocation/recovery. Rollback retains verification for previously issued compatible claims and never restores a compromised key.

## Non-goals

- Home-grown cryptographic primitives.
- Indefinite offline licenses without a separately approved enterprise policy.
