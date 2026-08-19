# Step 03 — Establish Versioned Cross-Language Contracts

## Outcome

Define language-neutral, versioned schemas for the facts that cross repository, process, and future SDK boundaries. Generated types become projections; handwritten TypeScript types stop being accidental protocols.

## Product view

The first contract set should be intentionally narrow: ProductDefinition, Capability, EntitlementDecision, LicenseClaims, Identity, Trial, TelemetryEvent, DiagnosticResult, and ErrorEnvelope. RN proves the contracts before iOS, Android, Flutter, or Python expansion.

## Planned repository changes

### Core

- Own canonical JSON Schemas, fixtures, semantic validation rules, compatibility policy, and type-generation tooling.
- Publish schema identifiers and versions independently from implementation versions.
- Add conformance suites for valid, invalid, older, and forward-compatible payloads.

### Vectalon

- Generate RN and website types from Core schemas during controlled synchronization.
- Validate the root product manifest and API payloads against canonical schemas.
- Add package-level fixture tests proving the shipped RN artifact reads supported contract versions.

### Admin

- Generate server/domain types from the same schemas.
- Validate ingress and egress at webhooks, license issuance, trial, customer, and audit seams.
- Persist schema version with externally meaningful records and events.

## Deliverables

- Schema registry, compatibility table, fixture corpus, generators, generated-artifact drift checks, and migration policy.

## Reviewer gate

- No cross-repository payload relies only on a handwritten type.
- Breaking schema changes fail consumer conformance tests before merge.
- Unknown fields, unknown versions, malformed input, and redacted sensitive fields have explicit behavior.

## Risks and dependencies

- Depends on Step 02 ownership decisions.
- Avoid a broad platform rewrite: only contracts already crossing a real seam enter v1.

## Implementation sequence

1. **Inventory real seams.** Core records every payload currently exchanged by file, package, HTTP, webhook, or generated projection. For each seam, record producer, consumer, sensitivity, current type, persistence lifetime, and compatibility requirement. Do not create schemas for hypothetical platforms.
2. **Choose contract mechanics.** Adopt JSON Schema 2020-12, stable `$id` URIs, semantic contract versions, UTC RFC 3339 timestamps, opaque string identifiers, explicit currency minor units, and a common discriminated `ErrorEnvelope`. Record the decision in a Core ADR.
3. **Define the v1 registry.** Start with `ProductDefinition`, `Capability`, `EntitlementDecision`, `LicenseClaims`, `IdentityReference`, `TrialCredential`, `TelemetryEvent`, `DiagnosticResult`, and `ErrorEnvelope`. Split public fields from private Admin records; never place payment-provider payloads or private customer data in Core contracts.
4. **Build fixtures before generators.** For every schema, Core adds canonical valid, boundary, redacted, malformed, previous-version, unknown-field, and unknown-version fixtures. Semantic validators cover invariants JSON Schema cannot express.
5. **Generate TypeScript projections.** Core produces deterministic TypeScript artifacts and a machine-readable registry manifest containing schema digest, generator version, and compatibility status. A second generation must produce a clean tree.
6. **Adopt one real vertical seam.** Vectalon validates `product-manifest.json` with the Core `ProductDefinition`; Admin validates one ingress/egress pair using generated types. This proves the registry without prematurely migrating every payload.
7. **Add cross-repository compatibility CI.** Each consumer pins a Core contract revision, runs the shared fixture corpus, rejects breaking changes, and reports additive-version support. Core cannot merge a contract change until consumer compatibility evidence exists.

## Contract and monetisation decisions required

- The product manifest must add the advertised `free` plan or public Free claims must be removed. “Free” is a product state, not an implicit absence of a paid entitlement.
- Prices use ISO currency plus integer minor units; formatted strings such as `$19` are generated presentation fields.
- Seat quantity, billing cadence, tax treatment, trial eligibility, grace policy, and product scope are explicit contract fields.
- `releaseStatus: available` means purchasable and supportable, not merely published. Until checkout, issuance, support, and revocation meet their gates, use `beta` or a similarly honest lifecycle state.

## Required evidence

- Core: schema registry tests, semantic-validator tests, compatibility matrix, deterministic generation check, and an ADR.
- Vectalon: manifest validation, generated-type drift check, package fixture test, and proof that no handwritten duplicate remains at the adopted seam.
- Admin: boundary validation tests proving malformed, future, and redacted payload behavior.
- Reviewer: inspect every v1 schema for data minimisation, stable identifiers, money/time correctness, and a named owner; independently introduce a breaking fixture and confirm CI fails.

## Exit and rollback

The step exits only when the registry and one end-to-end seam are live in all three repositories. Rollback pins consumers to the previous compatible contract revision; persisted data is never rewritten destructively to hide an incompatible schema.

## Non-goals

- Swift, Kotlin, Flutter, and Python production SDKs.
- A network service hosted by Core.
- Migrating every internal TypeScript interface.
