# Vectalon product architecture and repository boundary

Status: Ratified for Step 02
Date: 2026-08-19
Owner: Bhishak Sanyal
Canonical cross-repository decision: Core `ARCHITECTURE_OWNERSHIP.md`

## Vectalon's role

Vectalon is the public product and delivery repository. It owns the RN SDK, CLI, native adapters, website, documentation, customer-facing API gateway and public release evidence. The root product manifest is the canonical public projection of product identity, package coordinates, capabilities, pricing and licensing claims.

Vectalon does not own entitlement policy, license cryptography or private customer operations. Those boundaries belong to Core and Admin respectively.

## Dependency direction

```text
RN / CLI / native adapters ---> vendored Core public surface
Website / public API gateway ---> authenticated Admin-backed HTTP service

No Vectalon source imports Admin. No database is shared with Admin.
```

Core is currently copied into the RN package by release automation. The release records the fetched Core commit and verifies that it came from the expected upstream main/tag. An independently published Core package is a future option, not a present dependency.

## Existing module map

| Vectalon module | Owner / boundary | Disposition |
|---|---|---|
| `packages/rn/src/harness/ContextEngine.ts` and scanner | RN product adapter | Keep RN-specific discovery; conform to Core contracts after Step 03 |
| `packages/rn/src/model/` | RN product adapter | Keep routing/provider implementations; consume Core provider interface |
| `packages/rn/src/guardrails/` | RN-specific rules and execution adapter | Keep product rules; remove duplicated generic policy when Core replacement is proven |
| `packages/rn/src/memory/`, `bench/`, `evals/` | RN product capabilities | Keep until a product-agnostic Core abstraction is accepted |
| `packages/core/` | Generated/vendored release input | Never hand-edit; refresh from Core main/tag through release workflow |
| root product manifest | Public product source of truth | Generate/validate package and website projections from it |
| website licensing/admin-store routes | Boundary debt | Move authoritative customer, purchase, trial, issuance and revocation writes to Admin; retain a thin public gateway |

## Data flow

1. Website/CLI/RN surfaces read public product facts from the manifest or its generated projection.
2. Checkout and activation enter through a customer-facing Vectalon route.
3. Signed payment events and operational writes are handled by Admin.
4. Admin issues a signed license projection.
5. Vectalon delivers the projection; embedded Core verifies it and evaluates entitlements offline.
6. Refresh and revocation checks use a versioned public endpoint backed by Admin, without importing Admin code.

## Failure ownership

| Failure | Owner |
|---|---|
| RN, CLI, native adapter, website or gateway behavior | Vectalon |
| Release manifest or package projection mismatch | Vectalon |
| Core refresh provenance or stale vendored Core | Vectalon release workflow |
| Verification, entitlement or generic guardrail policy | Core |
| Customer, purchase, trial, issuance, revocation or audit state | Admin |

## Deletion test

| Candidate | Required change | Completion evidence |
|---|---|---|
| Inline entitlement decisions in product adapters | Replace with Core policy | Conformance tests against the Core decision API |
| Generic guardrail/profile logic duplicated in RN | Delete only after Core parity | Migration test plus deleted duplicate |
| Operational writes in website licensing routes | Move to Admin | Vectalon retains no operational DB credentials or write model |
| Hand-edited `packages/core` output | Eliminate | Provenance check and clean generated-tree diff after fetch |

## Step boundary

This document records ownership and migration decisions only. EngineeringProfile schemas, generated Swift/Kotlin bindings and RN implementation changes belong to Step 03. They must not be introduced by this Step 02 PR.
