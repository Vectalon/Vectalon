# Step 04 — Integrate the Core Engineering Harness into RN

## Outcome

Make the reusable Core abstractions exercise real RN behavior: profile composition, project discovery, rule execution, guardrail validation, repair loops, and model-provider selection must run through deep Core interfaces rather than parallel RN-only engines.

## Product view

This is the architectural proof. Success is not more interfaces; it is less caller knowledge, fewer duplicate implementations, and a closed loop that a customer can observe from request through validated result.

## Planned repository changes

### Core

- Stabilize the smallest interfaces required by the RN adapter.
- Deepen composition, guardrail, repair, and model-provider modules behind deterministic result objects.
- Add RN-shaped contract fixtures without moving RN-specific policy into Core.

### Vectalon

- Implement the RN profile and adapters for scanner, parser, project context, tools, and validation.
- Replace overlapping RN abstractions incrementally and preserve CLI compatibility with explicit migrations.
- Add end-to-end evidence that actual commands use the composed profile and executable guardrails.

### Admin

- Consume only operational metadata such as profile/schema/runtime versions needed for support and fleet visibility.
- Avoid participating in model execution or source-code flow.
- Add compatibility visibility for customer installations without collecting customer source.

## Deliverables

- RN integration map, replacement ledger, adapter conformance tests, closed-loop example, and compatibility report.

## Reviewer gate

- The interface is the test surface; tests do not reach through Core internals.
- Deleting a Core module would reintroduce material complexity across multiple RN callers.
- No customer source, prompts, or secrets enter Admin or generic telemetry.

## Risks and dependencies

- Depends on Steps 02–03.
- Main risk: layering Core beneath existing RN logic without deleting duplication.

## Implementation sequence

1. **Create a replacement ledger.** Compare Core and RN implementations for profile composition, scanning, guardrails, repair, provider routing, violations, and rule registries. For each overlap choose Core, RN adapter, temporary bridge, or deletion, with an owner and removal test.
2. **Freeze the integration surface.** Core exposes only the contracts needed by actual RN call sites. Inputs include clock, filesystem, model provider, and storage capabilities so tests do not depend on globals.
3. **Prove profile composition.** RN maps its detected language, React Native/Expo version, platforms, project constraints, and organisation policy into the versioned profile contract. Golden projects cover bare RN, Expo managed, monorepo, New Architecture, and partially broken projects.
4. **Route one customer workflow end to end.** Select a high-value command such as `review` or `doctor`; run discovery, composition, rule selection, model/tool orchestration, validation, bounded repair, and result rendering through Core seams.
5. **Migrate command families incrementally.** Move callers by capability group, preserve CLI output compatibility where intentional, and delete replaced generic RN code in the same slice. Bridges have expiry issues and cannot become permanent aliases.
6. **Make execution observable locally.** Results record profile/schema/Core revision, selected rules, provider choice, repair count, duration, and safe reason codes. Source, prompts, secrets, and raw paths remain local.
7. **Package-proof the integration.** Build the npm tarball from a clean checkout, verify the exact Core revision and public keys, install it in fixture projects, and run offline/customer-shaped smoke tests.

## Repository acceptance

- **Core:** deep modules have contract tests and no React Native imports or policies.
- **Vectalon:** real CLI/MCP entry points use the adapters; the replacement ledger shows fewer implementations; tarball tests exercise the bundled Core rather than workspace source.
- **Admin:** stores only support-safe compatibility facts (product version, Core revision, schema versions, capability IDs) after explicit consent; it receives no source or prompt content.

## Required evidence

- Architecture graph before/after, deleted-code list, golden fixture corpus, end-to-end traces, npm-pack contents, install/smoke logs, and performance comparison.
- Reviewer independently traces a paid and a free command from entry point to result, injects provider/guardrail/repair failures, and confirms bounded deterministic behavior.

## Exit and rollback

Exit requires at least one complete workflow plus a documented migration path for every remaining overlap. Each migrated family can be disabled with an internal release flag for one release; rollback restores the last compatible adapter, never a duplicated entitlement or verification engine.

## Non-goals

- New customer-facing commands or model providers.
- Moving RN-specific rules, filesystem behavior, or UI into Core.
- Sending project content to Admin.
