# Step 14 — Build a Customer-Shaped Test Pyramid

## Outcome

Qualify the product through realistic customer journeys and failure modes, not only isolated modules. Tests must cover clean installs, existing projects, offline use, upgrades, commercial transitions, and operational recovery.

## Product view

The decisive question is whether a customer can install, understand, trust, and repeatedly use Vectalon in a real repository. Test counts are secondary to journey coverage and defect detection.

## Planned repository changes

### Core

- Maintain fast policy/contract property tests, cryptographic vectors, clock/storage fault injection, and adapter conformance suites.
- Add mutation or fault-seeding checks for the highest-risk entitlement and license logic.
- Publish reusable fixtures without exposing private operational secrets.

### Vectalon

- Add packed-artifact tests in isolated projects across supported Node, package-manager, RN, Expo, OS, and architecture combinations.
- Exercise top workflows end to end: init, diagnose, fix, validate, trial, activate, gated command, update, and uninstall/reinstall.
- Separate hermetic PR tests, network contract tests, native/sandbox tests, and scheduled qualification.

### Admin

- Add domain, database, authorization, API, webhook replay, reconciliation, browser journey, migration, and disaster-recovery tests.
- Use production-shaped provider fixtures and explicit negative authorization cases.
- Verify every operator mutation produces the intended audit record.

## Deliverables

- Test taxonomy, environment matrix, golden journeys, flake budget, quarantine policy, and traceable coverage map.

## Reviewer gate

- Each GA promise has at least one customer-shaped automated journey.
- Flaky tests cannot silently pass required gates.
- Failures produce actionable evidence and preserve safe cleanup/rollback.

## Risks and dependencies

- Depends on Steps 04–12.
- Avoid a single enormous E2E suite that is slow, opaque, and impossible to diagnose.
