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

### Task 2: Protect telemetry and support read surfaces

The existing apps/telemetry backend exposes raw error, heartbeat, and support lists and its HTML dashboard without authentication, bypassing its protected admin endpoint. Require the existing TELEMETRY_ADMIN_TOKEN bearer header on every GET of /, /v1/errors, /v1/heartbeat, /v1/support and /v1/admin/errors. Missing configured token returns 503; absent/wrong supplied header returns 401. Do not accept query-string tokens: avoid secrets in access logs. Use constant-time token comparison from Node crypto. Pass request headers through each relevant Vercel API wrapper including index/dashboard and lists. OPTIONS and existing bounded anonymous POST ingestion remain unchanged in this slice; public health may only expose status, not counts/client activity. Do not change storage or production environment variables. Regression tests through app.handle must prove raw customer data and HTML never reach unauthenticated callers, and authenticated requests still work. Update backend README route/security descriptions. Run existing node:test backend suite and typecheck. No dependencies. Commit only task-owned files. This task is access-control hardening, not full data minimisation/deletion/retention completion.

### Task 3: Prepare a verified RN patch release

After Tasks 1 and 2 are reviewed, prepare RN 0.22.1. Update packages/rn/package.json and product-manifest.json; use existing product/capability generators and executable qualification workflows, keeping every released passed-evidence reference immutable. Bump affected capability versions where required; do not weaken freeze gates, drop historical references, add commands or pretend beta features are GA. Update the existing public catalog version assertion, RN changelog and source projections only as needed. Build before packed CLI tests. Run product/contracts/capability checks against actual fetched origin/main, focused qualifier workflows, RN full coverage suite, website full tests/types, RN lint/types, packed package provenance/safety checks. No changes to Core/Admin versions without implementation. Core latest main is d5a380fc1efa68672cbff8cc98e38c89442d6519; release workflow fetches and freezes it independently. Write exact test commands/results in report and commit the patch-release preparation without publishing; controller reviews, creates PR, merges only after CI passes, and verifies published npm version. Label this as a Step 12 launch slice, not completion of all privacy governance.

Launch-path adjustment: public npm lookup verified unscoped `vectalon` package is 404; the actual released package is `@vectalon-dev/rn`. New-customer fulfillment email and website bootstrap instructions must not assume it is already installed. Use explicit `npx --yes --package=@vectalon-dev/rn@latest vectalon` for those bootstrap/activation examples, preserving `npx vectalon` examples only where an explicit prior project install makes the local binary available. Add a public sendLicenseEmail boundary regression with mocked email transport verifying the scoped invocation. No real email or customer license activation for this test. Fix before qualification so evidence hashes include final source.
