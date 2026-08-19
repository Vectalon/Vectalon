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
- Identity/trial contracts and client UX can proceed first; production trial creation depends on Steps 10–11 for authenticated operations, transactions, uniqueness constraints, and durable audit history.
- OAuth provider outage and account renames require explicit customer-safe behavior.

## Implementation sequence

1. **Define actors and identifiers.** Separate provider identity, Vectalon customer, organisation, membership, device installation, trial, subscription, and license. Use stable provider subject IDs; usernames are display attributes, not keys.
2. **Write the privacy/abuse model.** Document collected fields, purpose, consent/legal basis, retention, deletion, rate limits, account sharing, replay, bot creation, provider compromise, and support access.
3. **Implement the server-owned flow.** Vectalon starts OAuth/device authorization with state and PKCE where supported; Admin validates the callback/token server-side, transactionally creates or finds the identity, and decides trial eligibility.
4. **Issue a signed trial credential.** Admin signs a versioned, audience/product-bound, short-lived credential with trial ID, subject, issued/not-before/expiry, key ID, and policy version. Core verifies it; clients never author authoritative trial dates.
5. **Build recovery paths.** Handle browserless login, cancellation, timeout, account rename, deleted provider account, device replacement, clock skew, offline expiry, and provider outage without silently granting a second trial.
6. **Secure local state.** Vectalon stores the minimal credential atomically with restrictive permissions/keychain support where available, never logs tokens, and gives users inspect/export/delete instructions.
7. **Create Admin operations.** Add audited lookup, revoke, retry, merge-review, and privacy workflows with least privilege; support cannot edit provider subject IDs or trial history directly.

## Trial and conversion decisions

- Confirm trial length (currently advertised as 14 days), eligible paid tier, included capabilities, offline allowance, and whether Team evaluation needs an organisation trial.
- Define one-trial policy by verified person/organisation without relying on invasive fingerprinting.
- Trial expiry must transition to a useful Free plan, not make the CLI unusable.
- Conversion attribution and reminders require explicit consent; no card is collected for the advertised trial.

## Required evidence

- Sequence diagrams and executable happy/failure-path integration tests.
- Replay/concurrency test proving two callbacks cannot create two trials.
- Privacy inventory, deletion/export test, local-permission test, and log/token scan.
- Reviewer completes new-user, returning-user, browserless, offline-expiry, revoked, and account-rename journeys against production-shaped services.

## Exit and rollback

Exit requires server-authoritative uniqueness, signed credentials, and customer-safe recovery. If OAuth is degraded, existing valid credentials continue within policy; new trials fail transparently rather than falling back to client assertions.

## Non-goals

- SAML/enterprise directory provisioning.
- Device fingerprinting as the primary identity or trial control.
