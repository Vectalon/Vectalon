# Step 12 launch slice — telemetry consent

## Spec

docs/release-roadmap/12-privacy-telemetry-and-data-governance.md, with owner direction to prioritize launch-ready promised functionality and defer Step 11 recovery operations.

## Global Constraints

- Generic telemetry must not collect or send anything without explicit consent.
- Telemetry failures must never block product execution.
- Local crash-export ingestion is a separate customer-directed feature and must remain functional.
- Do not mutate production customer records, credentials, or backups.
- Existing customer licenses and subscriptions remain unchanged.

### Task 1: Require explicit RN telemetry consent

Use the existing RN diagnostics configuration and public capture/flush/heartbeat seams. Default configuration and absent consent must disable automatic error collection, queue flushing, and heartbeats. Explicit telemetry.errors=true may enable errors unless telemetry.enabled=false; heartbeats must require their own telemetry.heartbeat=true plus no global opt-out, so errors-only consent never enables heartbeat collection. Preserve explicit enabled test injection but never allow it to override an explicit user opt-out in real production calls; tests/selftests use isolated configs. Do not erase customer diagnostic files implicitly. Include regression tests proving unconfigured clean install performs no capture or outgoing fetch, explicit opt-out blocks stored queues, and errors-only consent does not enable heartbeats. Inspect config defaults and call sites to ensure a default true does not simulate consent. Update stale opt-out comments and current user-facing instructions for these touched features. Use existing Jest suites, no dependencies. Run focused tests and RN typecheck; full suite/build coordinated by controller. Commit only task-owned files, not preexisting Step 11 edits or controller roadmap notes. Write report with RED/GREEN evidence and concerns.
