# Safe optional usage telemetry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Core optional usage telemetry consent-current, purpose-bounded and nonidentifying.

**Architecture:** Project known counts through Core's existing UsageReporter boundary at collection and before upload. Preserve public methods/types and disabled queues; no new services or dependencies.

**Tech Stack:** TypeScript, Jest, Node filesystem and fetch.

**Spec:** docs/superpowers/specs/2026-09-17-step12-usage-privacy-design.md

## Global Constraints

- Existing licenses, subscriptions, signing and production records remain unchanged.
- Explicit opt-out stops future collection/upload immediately; no implicit queue deletion.
- Telemetry configuration/filesystem/network errors never interrupt product execution.
- Do not change cross-language contract schemas, add dependencies or claim whole Step12 complete.

### Task 1: Core UsageReporter privacy boundary

Files in Core checkout packages/core/src: modify telemetry/UsageReporter.ts, add __tests__/telemetry.test.ts; change package.json/CHANGELOG.md and only the two root package-lock.json version metadata entries for a reviewed Core0.11.1 patch preparation. No dependency-resolution changes or root/RN consumer changes by this implementer.

Consumes existing track(event:string,product:string,feature?:string,metadata?:Record<string,unknown>):void and flush():Promise<void>; preserves these interfaces. Produces consent-current bounded legacy TelemetryEvent records: event telemetry_ingest, product rn, no feature, tier unknown, timestamp, random reporter-session sessionId, literal deviceId redacted, numeric allowlisted metadata only. No new public API or contract-schema changes.

- [ ] RED through existing UsageReporter using real isolated temporary config files (mock os homedir before isolated module import) and mocked fetch: construct enabled reporter, disable, track and flush; queue unchanged and fetch absent. Add malicious metadata/unknown event, poisoned old queue, fingerprint, malformed config and write-failure cases; assert exact network payloads rather than private helpers.
- [ ] Implement strict projection for the one event/product currently used, rejecting nonempty features. For metadata copy only filesScanned/eventsIngested/crashes/traces/analytics whose values are finite nonnegative integers <=1000000000. Catch exceptional inputs and drop unsafe records. Replace cached consent with current explicit-config read at every operation; remove hostname/userInfo/hash identity dependency. Preserve legacy required event fields with nonidentifying values.
- [ ] Re-project old queue entries before upload; bound queue to50 and persist incoming event before automatic flush. Disabled queues remain untouched. All config writes, queue reads/writes, auto-flush and fetch failures are quiet/nonblocking. A successful upload clears the existing queue; do not broaden concurrency semantics beyond the existing sequential reporter, and report that ceiling.
- [ ] GREEN targeted Jest; then full Core suite/build/typecheck/contracts check. Record exact RED/GREEN and test output, concerns and commit SHA in the local task report. Prepare Core0.11.1 package/changelog without modifying contracts/baselines or customer credentials. Commit task-owned files only; no push/publish.

Controller gate: independent task review, Core PR/CI/merge/release; then a separate reviewed Vectalon consumer task updates the actual latest Core pin, product projections/evidence, proves RN ingestion compatibility and releases RN0.22.2. Admin unchanged explicitly; full privacy and recovery gates remain open.

### Task 2: Ship reviewed Core in RN0.22.2

Core PR17 merged e4a92ed2f969ce68b33c5707cf66e09e1be196fb; implementation starts only after its stable v0.11.1 release. Root checkout branch codex/step12-usage-privacy, release base05545732738dd2e6beecf24608fac6a80ec255bb. Update packages/core source/revision/keyset pins, product-manifest.json Core0.11.1 and RN0.22.2, packages/rn/package.json, existing public catalog assertion, current marked README/website product facts and RN changelog. No Admin0.9.0 change, dependencies, commands or lifecycle promotions.

- [ ] Add a regression through the actual built/packed Core UsageReporter API in packages/rn/__tests__/contracts/productDefinition.test.ts: isolated child patches only os.homedir before loading bundled Core, enables optional usage, tracks telemetry_ingest/rn with counts and source/secret markers, flushes with mocked fetch and asserts exactly five safe numeric fields, redacted device ID and UUID session, no marker anywhere. Prove RED using the already built old released Core artifact before rebuilding; GREEN using final reviewed Core. Existing real CLI telemetry ingestion suite must still pass and preserve customer-directed local crash analysis.
- [ ] Fetch actual Core main, check exact reviewed e4a92ed SHA and0.11.1; use existing keyset/pin/product/contracts generators before building RN. Fetch actual root origin/main explicitly. Compare closures to released base; bump only affected capability patch versions and append evidence with existing executable qualifiers, preserving every released passed reference byte-identically. Regenerate source/website/extension projections after final source/tests/comments; no freeze-gate changes or historical evidence rewrites.
- [ ] Run product/contracts/capability checks against actual fetched origin/main; product and capability tests; four qualifier workflows; build then packed regressions; existing full RN coverage via npm run test:coverage -- --runInBand (not pnpm extra-- forwarding), RN/extension types and lint, full website tests/types using Admin pinned source, package safety/provenance dry run. Record exact outcomes including warnings and limits in ignored local task report; never force-add scratch reports. Commit release prep only, no push/publish/production writes.

Controller gate: task review then final whole-branch review, PR CI green, merge with [publish-rn], verify canonical registry0.22.2/latest and fresh customer command, stable GitHub tag, actual bundled Core SHA and production website. Distinguish safe optional usage from still-open raw RN error/heartbeat payloads, support retention and product-wide deletion. Existing customer credentials/rights stay unchanged.
