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
