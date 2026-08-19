# Step 06 — Secure the Entitlement Boundary

## Outcome

Create one fail-closed entitlement decision seam and eliminate customer-accessible bypasses. Development overrides remain possible only in builds and contexts that cannot be distributed as production artifacts.

## Product view

Entitlement is commercial security. The CLI may operate offline, but offline operation cannot mean trusting mutable environment variables, unsigned local files, or public flags to unlock paid features.

## Planned repository changes

### Core

- Make one entitlement evaluator responsible for license, trial, product, capability, tier, expiry, grace, and clock behavior.
- Replace runtime bypass environment variables with a non-distributable test adapter or build-time internal capability.
- Return typed allow/deny/degraded decisions with stable reason codes and safe customer messages.

### Vectalon

- Route every paid command and MCP invocation through the single evaluator.
- Remove public `--dev`/tier-bypass behavior from production packages and documentation.
- Add command-surface and packaged-artifact tests proving bypasses are absent and denial happens before side effects.

### Admin

- Expose operator-visible reason codes, policy versions, and safe remediation actions.
- Require authenticated, audited workflows for overrides; never mint universal bypass credentials.
- Add anomaly views for repeated invalid, expired, or tampered entitlement attempts.

## Deliverables

- Threat model, decision table, bypass-removal inventory, signed fixture corpus, and negative-path test suite.

## Reviewer gate

- Paid execution cannot occur before a valid entitlement decision.
- Tests cover tampering, expiry, rollback clocks, wrong product, wrong tier, revocation, and corrupted state.
- Development convenience is physically absent from the npm artifact.

## Risks and dependencies

- Depends on Steps 03 and 05.
- Core and packaged-client enforcement can precede Step 10; production Admin grants and override operations depend on the authenticated, audited control-plane foundation in Step 10.
- Requires a documented migration for existing internal development workflows.

## Implementation sequence

1. **Threat-model the decision seam.** Cover forged/edited local state, environment-variable bypasses, clock rollback, replay, wrong audience/product, downgrade races, stale revocation, package tampering, and execution before authorization.
2. **Specify the decision table.** Core takes verified identity/trial/license claims, capability ID, product/version, requested seats, trusted clock input, and revocation freshness. It returns `allow`, `deny`, or narrowly defined `degraded` with stable reason codes and no secret-bearing errors.
3. **Separate verification from policy.** Cryptographic verification yields trusted claims; entitlement evaluation consumes only trusted claims. Neither module reads process environment, CLI flags, or mutable product code directly.
4. **Remove production bypasses.** Inventory `VECTALON_DEV_MODE`, tier overrides, test keys, public flags, and unsigned files. Replace them with dependency-injected test evaluators excluded by package/export/build checks.
5. **Enforce before side effects.** Vectalon wraps every paid CLI command, MCP tool, extension action, remote call, file mutation, and model invocation at a single dispatch boundary. Batch operations re-check scope without charging or mutating on denial.
6. **Make Admin operationally safe.** Admin displays reason codes and policy versions, supports audited time-bounded grants via normal signed claims, and cannot mint a universal override.
7. **Attack the packaged artifact.** Install the tarball in hostile fixtures, edit caches, alter time, set legacy variables, replay claims, and attempt direct imports/internal calls.

## Commercial policy decisions

- Define grace windows for payment failure, offline use, cancellation, and provider outage separately.
- Define whether the BSL small-team grant bypasses product entitlements or receives a signed Free/small-team entitlement. Prefer one auditable evaluator path.
- Decide when seat overage denies execution versus enters a remediation/grace state.
- Customer messages must state what happened, what remains usable, and how to recover without exposing fraud controls.

## Required evidence

- Core decision-table tests and mutation/fuzz tests.
- Vectalon dispatch coverage report proving every paid surface is gated before side effects; tarball scan proves bypass code and private keys are absent.
- Admin authorization/audit tests for every grant or override action.
- Reviewer performs an adversarial package review and independently attempts the documented bypass inventory.

## Exit and rollback

Exit requires a single production evaluator and zero known distributed bypasses. Rollback may pin the prior evaluator only if it is still fail-closed; it may not re-enable environment bypasses.

## Non-goals

- License issuance or payment reconciliation, which remain Steps 08–09.
- Obscurity-based DRM or invasive device surveillance.
