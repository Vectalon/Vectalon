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
- Requires a documented migration for existing internal development workflows.
