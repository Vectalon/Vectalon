# Step 02 — Ratify Architecture and Repository Ownership

## Outcome

Create one enforceable architecture direction for the product, with every durable concern owned by exactly one repository and consumed through a small, versioned interface. This step prevents Core, Vectalon, and Admin from becoming three competing implementations of identity, entitlement, licensing, or product metadata.

## Product view

Vectalon is one product system: Core supplies reusable engineering and commercial policy; Vectalon supplies customer-facing SDKs, CLI, website, and public release evidence; Admin supplies private operational control. Repository separation is a deployment and IP choice, not permission to duplicate domain logic.

## Planned repository changes

### Core

- Ratify Core as owner of product-agnostic profiles, model-provider interfaces, executable guardrails, contract types, offline license verification, and entitlement decisions.
- Define the supported public interface and mark internal modules as non-importable.
- Record compatibility and deprecation rules for every exported contract.

### Vectalon

- Ratify RN as the first product adapter and the root manifest as the public product/release projection.
- Map existing RN modules to Core interfaces; identify duplicates to replace, not wrap.
- Document website ownership of public acquisition surfaces and API delivery—not entitlement policy.

### Admin

- Ratify Admin as the private control plane for customers, purchases, license issuance/revocation, trials, audit, support, and operational reporting.
- Prohibit Admin from becoming a second public license-validation implementation.
- Define how Admin invokes shared policy without importing UI or RN code.

## Deliverables

- Repository ownership matrix, dependency rules, system/data-flow diagram, ADR index, and named maintainers.
- Explicit decision log for source of truth, generated projections, failure ownership, and release sequencing.

## Reviewer gate

- Every business capability has one owner and every cross-repository dependency points in one direction.
- No circular build, runtime, or data ownership exists.
- Architecture tests can be derived from the document without interpretation.

## Risks and dependencies

- Depends on the Step 01 product manifest.
- Main risk: preserving historical duplication under new terminology. The deletion test must show which implementation disappears.
