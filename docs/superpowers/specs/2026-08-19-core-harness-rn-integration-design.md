# Core Harness / React Native Integration Design

**Status:** Approved for execution by the user's standing instruction to proceed without intermediate approval

**Roadmap:** Step 04 — Core harness / React Native integration

**Repositories:** `core`, `Vectalon`, `vectalon-admin`

## Outcome

Ship one real React Native workflow that exercises Core-owned project discovery orchestration, profile composition, executable rule resolution, deterministic guardrail aggregation, provider selection, and bounded repair. Vectalon owns all React Native policy and filesystem/model adapters. Admin receives only a strict, consent-marked compatibility projection containing released version identifiers and capability IDs.

The integration is complete only when RN's overlapping orchestration is deleted from the migrated paths, the published RN package consumes the exact released Core revision, and a customer-shaped closed-loop fixture passes from discovery through repair without exposing source, prompts, secrets, or raw paths in its safe result.

## Architectural decision

Introduce a deep `createCoreHarness()` entry point in Core. Callers supply narrow adapters and immutable profile/rule descriptors; Core owns the workflow and returns a versioned deterministic result. Migrate Vectalon's `feature` workflow (including its implementation guardrails and code-review healing) plus the policy-check path to this workflow so two real CLI command families depend on the same Core behavior.

Rejected alternatives:

1. **Wire RN directly to existing Core classes.** This leaves callers responsible for sequencing composition, registries, provider routing, guardrails, and repair, preserving the duplication Step 04 must remove.
2. **Move RN engines and rules into Core.** This violates repository ownership: React Native/Expo policy, filesystem discovery, parsers, model credentials, and CLI presentation belong in Vectalon.
3. **Add a forwarding facade without deletion.** This fails the deletion test because removing the Core facade would not reintroduce material complexity across multiple RN callers.

## Ownership boundary

### Core

- Owns the public workflow, canonical ordering, stable reason codes, profile composition, executable-rule resolution, provider selection policy, guardrail aggregation, repair bounds, and safe result projection.
- Contains no `react-native`, Expo, CocoaPods, Gradle, Metro, Hermes, iOS, or Android policy literals.
- Accepts normalized project/profile/rule data from adapters; it does not read a customer filesystem or environment.
- Publishes test adapter conformance helpers from an explicit `./testing` export.

### Vectalon

- Owns React Native discovery, project-profile mapping, RN rules, policy-file merging, rule execution, model adapters, and CLI rendering.
- Supplies customer source only to in-process adapters. Raw source and prompts never enter the safe result.
- Migrates `policy --check` and code-review healing to the Core workflow, then deletes the duplicated RN runner and retry controller used by those paths.
- Keeps existing CLI flags and human-readable output compatible.

### Admin

- Owns a strict compatibility-report validator, deterministic support status calculation, and a read-only compatibility view.
- Accepts only pseudonymous installation ID, observation time, product/Core/profile/result/runtime versions, capability IDs, and explicit consent.
- Does not execute models, inspect profiles/rules, store source, accept prompts, or control repair/provider behavior.
- Uses fixture-backed data in Step 04; authenticated ingestion and persistence remain Steps 10–12.

## Core public surface

Core adds these root exports while preserving every existing product-agnostic root export for compatibility during this step. The existing React Native definition and rule exports are the sole exception: migrate them into Vectalon before removing them from Core. This is an explicit pre-1.0 ownership correction, must be called out in Core and RN release notes, and may not be replaced by a deprecated Core shim because that would retain RN policy in Core.

```ts
export function createCoreHarness(
  config: HarnessConfig,
  adapters: HarnessAdapters,
): CoreHarness

export interface CoreHarness {
  run(request: HarnessRequest): Promise<HarnessRun>
}
```

The minimum data model is:

```ts
type HarnessStatus = 'passed' | 'blocked' | 'repaired' | 'failed'

type HarnessReason =
  | 'PASSED'
  | 'DISCOVERY_FAILED'
  | 'RULE_UNAVAILABLE'
  | 'RULE_EXECUTION_FAILED'
  | 'GUARDRAIL_BLOCKED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_FAILED'
  | 'REPAIR_SUCCEEDED'
  | 'REPAIR_EXHAUSTED'

interface HarnessRequest {
  runId: string
  capabilityId: string
  projectLocator: string
  profileInputs: CompositionInput[]
  changes: ReadonlyArray<{ id: string; relativePath: string; content: string }>
  requiredProviderCapabilities?: Partial<ModelCapabilities>
  repair?: { enabled: boolean; maxAttempts: number }
}

interface HarnessAdapters {
  discovery: ProjectDiscoveryAdapter
  ruleExecution: RuleExecutionAdapter
  providers?: readonly ModelProvider[]
  clock: HarnessClock
}
```

`ProjectDiscoveryAdapter.discover()` returns a normalized `ProjectProfile` and stable diagnostics. `RuleExecutionAdapter.execute()` receives the resolved executable rule and one local change, and returns structured violations. It may parse/read local project state, but Core never serializes its source input.

`HarnessRun` has two projections:

- `local`: in-process CLI detail needed to apply/render a repair. It is explicitly non-serializable for telemetry and is never passed to Admin.
- `safe`: canonical JSON-safe evidence with status/reason, Core and contract revisions, profile schema/version, sorted rule IDs and provenance, provider ID/model/selection reason, repair count, bounded safe diagnostics, duration, and `redaction: 'metadata-only'`.

The safe projection excludes `content`, `source`, `prompt`, `messages`, absolute paths, environment values, credentials, provider metadata, and free-form adapter errors.

## Determinism and failure behavior

- The clock is injected. The same normalized inputs, fake providers, adapter outputs, and clock values produce byte-equal safe results.
- Rules and diagnostics sort by stable ID, then relative path token, then location.
- Provider selection filters required capabilities, then explicit configured priority, then provider ID. Fallback order is recorded with stable reason codes.
- Every selected rule must have an executable adapter. Missing execution fails closed with `RULE_UNAVAILABLE`; Core never installs a no-op check.
- Adapter/provider exceptions are converted into allowlisted reason codes. Error messages are logged only through the local product boundary and never copied into safe evidence.
- Repair makes zero provider calls for an allowed result. It performs at most `maxAttempts`, stops on unchanged/cyclic output, and validates every candidate before success.
- A warning-only result follows the configured guardrail decision consistently and does not appear as both allowed and failed.

## Vectalon adapter and migration design

Create `packages/rn/src/coreHarness/` with focused modules:

- `discoveryAdapter.ts`: wraps the existing RN `Scanner`, converts bare RN, Expo, monorepo, New Architecture, and partially broken projects into normalized discovery.
- `profile.ts`: owns TypeScript/React/RN/platform/project/system descriptors and maps effective policy rules to executable descriptors.
- `ruleExecutionAdapter.ts`: adapts existing RN guardrail rules and custom policy regex rules; exceptions become typed adapter failures.
- `modelProviderAdapter.ts`: adapts the existing `ModelRouter` provider behavior to Core's provider contract without exposing API keys/config metadata.
- `createRnHarness.ts`: the only product assembly point.
- `render.ts`: converts the safe/local result into current CLI output.

Migrate two real paths:

1. `policy --check` uses `createRnHarness().run()` for discovery, composition, rule execution, and guardrail decision.
2. The `feature` command uses the same harness during generated-file implementation and code-review healing for initial validation, provider selection, bounded repair, and revalidation. RN retains its 14-phase workflow, persistence, safe file writes, typecheck/revert behavior, and presentation.

After both pass, remove the migrated path's direct `runGuardrails` orchestration and duplicate retry loop. `PolicyEngine` remains responsible for reading/merging RN policy files, but it supplies descriptors rather than executing the workflow. Existing non-migrated on-save APIs may use a temporary compatibility adapter only when an owner, removal condition, and test are recorded in the replacement ledger.

## Customer-shaped evidence

Vectalon owns five minimal golden projects under `packages/rn/test-fixtures/core-harness/`:

- `bare-rn`
- `expo-managed`
- `monorepo-app`
- `new-architecture`
- `partially-broken`

The closed-loop example starts with a fixture containing one deterministic RN guardrail violation. A fake provider returns a repaired candidate. The CLI-level test proves discovery, composition, selected rule execution, provider choice, repair, revalidation, and metadata-only evidence. Failure variants cover malformed discovery, missing rule execution, unavailable provider, provider error, unchanged repair, and exact repair exhaustion.

## Admin compatibility boundary

Admin introduces `CompatibilityReportV1`:

```ts
interface CompatibilityReportV1 {
  reportVersion: '1.0.0'
  installationId: string
  observedAt: string
  productVersion: string
  coreRevision: string
  profileSchemaVersion: string
  resultSchemaVersion: string
  runtimeVersion: string
  capabilityIds: string[]
  consent: 'granted'
}
```

The JSON schema is closed recursively, size-bounded, format-constrained, and rejects duplicate/unknown capability IDs. Compatibility status is calculated server-side as `compatible`, `upgrade-required`, `unsupported-schema`, or `unknown-capability`; clients cannot submit status or prose.

The read-only `/compatibility` page uses typed fixtures and shows only counts, truncated opaque installation IDs, observation time, released versions, capability count, and finite reason labels. There is no endpoint, database, customer mapping, action button, raw telemetry explorer, source/prompt detail, provider/model field, or free-form diagnostic.

## Deliverables

The Vectalon roadmap repository contains:

- `docs/architecture/step04-rn-integration-map.md`
- `docs/architecture/step04-replacement-ledger.md`
- `docs/examples/step04-closed-loop.md`
- `docs/reports/step04-compatibility-report.md`

The replacement ledger names each old RN abstraction, new owner/seam, migrated callers, removal commit, and any time-bounded bridge. The compatibility report records exact Core/RN/Admin revisions, contract/profile/result/runtime versions, fixture matrix, CLI evidence, privacy scan, package provenance, and release URLs.

## Test and release gates

1. Core tests prove deterministic orchestration, executable-rule failure-closed behavior, provider routing, repair bounds, privacy projection, and no RN policy literals.
2. Adapter conformance tests prove discovery/rule/provider adapters obey Core contracts.
3. RN tests cover all five goldens, two migrated callers, closed-loop repair, failure injection, compatible CLI output, and deletion of duplicate orchestration.
4. Admin tests prove strict validation, privacy adversaries, deterministic compatibility status, and view field allowlisting.
5. All three repositories pass tests, typecheck, lint, build, contract/provenance checks, and clean package installation.
6. Independent review must confirm callers use only Core's documented public interface and deleting the Core harness would force multiple RN callers to reimplement material orchestration.
7. Merge/release order is Core first; repin exact Core merge SHA in RN and Admin; then merge Admin and RN; publish the RN package only from the tested frozen Core SHA.

## Explicit deferrals

- No public Admin ingestion endpoint, authentication system, database, retention system, or customer association.
- No generic telemetry pipeline or source-bearing support bundles.
- No migration of unrelated Vectalon commands, including the RN-specific deterministic `vc fix` diagnostics engine.
- No removal of legacy Core exports that would be a separate breaking release; Step 04 prevents new callers and records later deprecation.
- No real paid model call in CI or fixtures.
