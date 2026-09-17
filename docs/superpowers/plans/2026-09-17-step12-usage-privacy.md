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
