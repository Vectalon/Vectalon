# Step 07 — Productionize Identity and Trial Integrity

## Outcome

Make trial creation and identity binding resistant to spoofing and replay while preserving a low-friction customer experience. Client-supplied GitHub identifiers must never be treated as verified identity.

## Product view

The trial is the first commercial trust transaction. It must be understandable, privacy-minimal, recoverable across devices, and enforce the one-trial policy server-side.

## Planned repository changes

### Core

- Define identity and trial contracts, local secure-state behavior, expiry/grace semantics, and offline degradation.
- Treat server-issued signed trial credentials as input; do not create authoritative trials locally.
- Provide injectable clock and storage seams for deterministic tests.

### Vectalon

- Complete the GitHub device/OAuth flow with state, PKCE where applicable, timeout, cancellation, and browserless recovery.
- Store only required identity/trial material with restrictive permissions.
- Explain trial status, data use, expiry, and conversion paths consistently in CLI and website.

### Admin

- Verify provider identity server-side, enforce uniqueness transactionally, issue signed trial credentials, and record audit events.
- Add abuse controls, rate limits, replay protection, deletion/export handling, and operator review paths.
- Distinguish identity, customer, device, trial, and subscription records.

## Deliverables

- Identity flow specification, privacy inventory, abuse model, sequence diagrams, and recovery matrix.

## Reviewer gate

- A forged request body cannot start a trial for an arbitrary GitHub identity.
- Duplicate, replayed, expired, revoked, and offline cases are deterministic.
- Trial data retention and deletion behavior are documented and tested.

## Risks and dependencies

- Depends on Steps 03 and 06.
- OAuth provider outage and account renames require explicit customer-safe behavior.
