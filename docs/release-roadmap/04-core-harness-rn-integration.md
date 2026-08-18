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
