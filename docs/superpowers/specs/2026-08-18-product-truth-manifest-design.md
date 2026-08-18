# Product Truth Manifest Design

**Status:** Approved design, pending written-spec review  
**Date:** 2026-08-18  
**Scope:** Step 1 of the release-completion plan

## Problem

Vectalon repeats release-critical facts across package manifests, README files,
website pages, CLI output, benchmark documentation, and publishing workflows.
Those copies have drifted. Current documents variously describe 35 or 43
benchmark scenarios, 44 or 48 deterministic agents, outdated package versions,
and architecture work that core already implements.

This makes otherwise green releases untrustworthy: a customer can see a price,
version, capability count, or support claim that differs from the shipped
artifact. The repository needs one authoritative product record and an
automated gate that prevents contradictory public claims.

## Decision

Adopt a hybrid source-of-truth model:

1. A root `product-manifest.json` is authoritative for structured product
   facts.
2. Code-owned structured surfaces import the manifest directly where doing so
   keeps runtime boundaries simple.
3. Narrative documentation remains hand-written.
4. A deterministic validator checks factual claims in narrative documents and
   fails CI when they disagree with the manifest or authoritative artifacts.

The manifest will not generate whole README files or marketing pages. That
would make prose harder to maintain and review. It will replace duplicated data
objects and validate prose assertions that are likely to drift.

## Sources of Authority

The product manifest is authoritative for commercial and public-product facts,
but it does not replace lower-level technical artifacts:

| Fact | Authority |
|---|---|
| Product name and public status | `product-manifest.json` |
| Plan names, prices, cadence, and included capabilities | `product-manifest.json` |
| Supported-platform status | `product-manifest.json` |
| Public capability counts | `product-manifest.json` |
| License policy summary and conversion date | `product-manifest.json`, validated against `LICENSE` |
| RN version | `packages/rn/package.json`; manifest must match |
| Core version | `packages/core/package.json`; manifest must match |
| Bundled core revision | `packages/core/core-source-revision.txt` |
| Benchmark scenario count | files under `packages/rn/bench/scenarios`; manifest must match |
| npm publication state | npm/GitHub release evidence, outside the static manifest |

The validator must calculate artifact-derived values rather than trusting a
second manually entered copy.

## Manifest Schema

The initial schema is intentionally narrow and versioned:

```json
{
  "schemaVersion": 1,
  "product": {
    "name": "Vectalon",
    "releaseStatus": "available",
    "flagship": "react-native"
  },
  "packages": {
    "reactNative": {
      "name": "@vectalon-dev/rn",
      "version": "0.14.1",
      "status": "available"
    },
    "core": {
      "name": "@vectalon-dev/core",
      "version": "0.1.0",
      "distribution": "bundled-private-runtime"
    }
  },
  "platforms": {
    "reactNative": "available",
    "ios": "coming-soon",
    "android": "coming-soon",
    "python": "coming-soon"
  },
  "capabilities": {
    "benchmarkScenarios": 43,
    "deterministicCommands": 48,
    "mcpTools": 60
  },
  "plans": [],
  "license": {}
}
```

Before implementation, command and MCP-tool counts must be computed from their
registries. The example values above describe the expected public claims, not
permission to hard-code an unverified count.

Each plan entry contains:

- stable `id`;
- public `name`;
- engine tier;
- display price and billing cadence;
- checkout mode (`checkout` or `sales`);
- ordered feature descriptions;
- trial eligibility.

The license section contains the public license identifier, free-commercial
team-size limit, change date, change license, and the separate MIT status of
the VS Code extension.

## Runtime Consumption

### Generated structured surfaces

The following surfaces will consume a typed projection of the manifest:

- website pricing cards and pricing FAQ facts;
- CLI `vectalon plan` plan definitions;
- public platform-status tables;
- benchmark headline metadata where it is not already calculated directly
  from benchmark artifacts.

Next.js loads the root JSON file directly. The RN build generates a package-
local plan projection from that manifest so the published CLI remains
independent of the monorepo root. TypeScript types and a runtime parser will
live in small, dependency-free modules. Invalid manifests must fail during
tests/builds with path-specific errors.

### Validated narrative surfaces

The first validator scope is:

- root `README.md`;
- `apps/website/PRODUCT.md`;
- `packages/rn/README.md`;
- `packages/rn/PUBLISHING.md`;
- website home, pricing, SDK, and benchmark copy;
- the enhancement-plan public status summary.

The architecture map is intentionally excluded from this first validator
scope. Step 2 will replace its stale inventory with an ADR before architecture
status becomes an enforced product fact.

Validation uses explicit markers for facts that must appear in prose. It must
not scrape arbitrary numbers from entire documents. Marker examples:

```md
<!-- product-fact:rn-version -->0.14.1<!-- /product-fact -->
```

Where a surface can import the manifest directly, imports are preferred over
markers.

## Validator Behavior

The validator is a read-only Node script with these phases:

1. Parse and schema-check the manifest.
2. Compare package versions with package manifests.
3. Count committed benchmark scenario files.
4. Calculate command and MCP-tool counts from their canonical registries.
5. Validate license invariants against `LICENSE`.
6. Inspect the declared narrative files for required fact markers.
7. Report every mismatch in one run and exit non-zero.

Diagnostics must include the fact name, expected value, actual value, and file
path. A malformed marker, duplicate marker, missing marker, or stale value is a
failure. The script must not rewrite files in CI.

## Testing Strategy

Implementation follows red-green-refactor.

Unit tests will use temporary fixture repositories to prove that the validator:

- accepts a consistent manifest and artifact set;
- rejects a stale RN version;
- rejects changed plan pricing;
- rejects a benchmark-count mismatch;
- rejects missing, duplicate, malformed, and stale prose markers;
- rejects license-policy drift;
- reports multiple mismatches together;
- never modifies input files.

Integration tests will execute the validator against the real repository.
Website and CLI tests will assert they expose the same plan data. Existing
pricing and benchmark tests remain as independent rendering checks.

## CI and Release Integration

Add `product:check` to the root scripts and run it in:

- ordinary CI before build/test fan-out;
- pull-request validation;
- RN release workflow before benchmark and publication.

Publication must stop before npm mutation when product truth is inconsistent.
The check is deterministic, offline, and must complete in seconds.

## Migration

Migration is incremental but lands atomically:

1. Add failing tests for the desired validator API.
2. Add the schema/parser and validator.
3. Populate the manifest from verified repository facts.
4. Migrate shared pricing and plan definitions.
5. Replace or mark factual prose in the initial validator scope.
6. Add CI/release gates.
7. Run repository-wide build, lint, typecheck, tests, benchmark, and package
   inspection.

No unrelated architecture refactor is part of this change. The existing
untracked `docs/ENGINEERING_HARNESS_ARCHITECTURE.md` remains untouched until
Step 2 converts it into the approved architecture ADR.

## Failure and Compatibility Policy

- Unknown schema versions fail closed.
- Missing required facts fail closed.
- Consumers must not silently substitute old plan or price defaults.
- Manifest changes that alter pricing, licensing, or platform availability
  require an explicit changelog entry.
- Adding a new manifest field is backward-compatible only when it is optional;
  removing or changing field meaning requires a schema-version increment.
- The public RN package must include only the projections it needs; it must not
  acquire a runtime dependency on the monorepo root file.

## Acceptance Criteria

Step 1 is complete only when:

1. The manifest contains values verified from current repository artifacts.
2. Website and CLI plan surfaces use one shared source.
3. RN/core versions, platform status, benchmark count, capability counts,
   prices, and license policy have automated drift checks.
4. CI, PR validation, and release publishing all run `product:check` before
   consequential work.
5. Focused tests demonstrate each failure mode.
6. The full repository verification suite passes.
7. The packed RN artifact still works without access to the monorepo manifest.
8. No public claim contradicts the manifest in the declared validation scope.

## Explicit Non-Goals

- Generating complete prose documents.
- Redesigning pricing or changing current prices.
- Adding product capabilities.
- Refactoring the full core/RN architecture.
- Publishing a new RN version as part of Step 1.
- Treating a green drift check as proof that the underlying product claim is
  commercially or technically mature; later release-plan steps provide that
  evidence.
