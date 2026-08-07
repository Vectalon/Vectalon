# Changelog

All notable changes to rn-vectalon will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.10] - Unreleased

### Added — Sandboxed code execution (V-1)

- **`src/sandbox/`** — the trust foundation for running generated code, tests,
  and scripts in isolated processes with **no ambient authority**:
  - **Environment scrubbing** (`env.ts`): deny-by-default — only a small base
    allowlist survives (PATH, HOME, TMPDIR, locale, …) plus explicit
    `allowEnv` / `env` opt-ins; credential-shaped ambient variables
    (tokens, keys, passwords, SSH agents, CI secrets) are always dropped.
    Every run reports the dropped variable *names* so callers see exactly
    what was stripped.
  - **Isolation backends** (`backend.ts`): `sandbox-exec` (macOS seatbelt
    profile — file writes confined to the sandbox root, outbound network
    denied by default), `bwrap` (bubblewrap on Linux — read-only root bind +
    network namespace), and an honest `process` fallback (scrubbed env +
    rlimits + sandbox-root cwd) when no OS backend exists.
  - **POSIX rlimits** (`limits.ts`): CPU seconds, virtual memory, file size,
    open files, and process-count caps applied via a `ulimit` wrapper before
    the command execs.
  - **Bounded execution** (`run.ts`): wall-clock timeout with SIGTERM →
    SIGKILL to the process group (a runaway never hangs the caller), output
    capture caps per stream, and a structured result (`ok`, `exitCode`,
    `signal`, `timedOut`, `isolation`, `droppedEnv`, `durationMs`).
- **CLI** — `vectalon sandbox [dir] -- <command> [args...]` with
  `--timeout`, `--cpu`, `--memory`, `--network`, `--allow-env`, `--json`.
  Pro tier gated. Prints the backend used, dropped env vars, and the output.
- **MCP tools** — `sandbox_run` (requires an explicit `root` + `command` —
  never defaults to cwd, so agents can't execute against the wrong directory)
  and `sandbox_backend` (reports the isolation available on the machine).
- **Self-test** — six new `sandbox` category checks (env scrub, backend
  detection, command execution, wall-clock timeout, CPU rlimit, write
  confinement — the last warns honestly on process-level backends).
- **Tests** — 20+ new tests covering the scrubber, limit wrapper, backends,
  executor, MCP tools, and the CLI command.

## [0.1.9] - Unreleased

### Added — Hermes performance profiling & runtime regression detection (I-7 / M17)

- **`src/perf/`** — parse Hermes `.cpuprofile` and heap snapshots and turn
  measured runtime data into actionable findings:
  - **JS-thread blocking detection** (`cpuprofile.ts`): contiguous sample runs
    where the JS thread stayed in one frame become blocking events
    ("useEffect blocks the JS thread for 500ms — move to a worklet"); hot
    functions are ranked by self time. Supports the flat nodes/samples/
    timeDeltas layout and the older head-tree layout (hitCount fallback).
  - **Heap analysis** (`heapsnapshot.ts`): first-reach retained-size
    approximation per top-level object held by the GC roots (imageCache
    retains 20 MB), plus largest self-size allocations as leak candidates.
  - **Baselines in the knowledge base** (`baseline.ts`): each run can be
    persisted as an `analytics` artifact (same pattern as bundle snapshots)
    and later runs are compared against it — blocking time up >25% or
    retained heap up >30% flags a **regression** finding.
- **Code review integration** — `CodeReviewAnalyzer.review(code, lang, runtime)`
  accepts Hermes metrics and cites them with concrete numbers, e.g. "useEffect
  blocks the JS thread for 500ms — move to a worklet or defer off the JS
  thread." Backward compatible — the static-only path is unchanged.
- **CLI** — `vectalon profile [dir]` with `--profile <file>`, `--heap <file>`,
  `--baseline <label>`, `--save-baseline`, `--threshold-ms`, `--json`. Pro tier
  gated; baselines are stored in and read from the knowledge base.
- **MCP tool** — `analyze_hermes_profile` (paste `.cpuprofile` / heap JSON,
  get deterministic findings).
- **Self-test** — four new `perf` category checks (CPU blocking, heap
  retained, baseline regression, code-review runtime evidence).
- **Tests** — 40+ new tests covering both parsers, the analyzer, baseline
  storage/regressions, the review integration, the CLI, and the MCP tool.

## [0.1.8] - 2026-08-07

### Added — Upgrade Copilot (`vectalon upgrade`)

Automated React Native / Expo version upgrades with codemods, AST-grade
breaking-change impact analysis, and New Architecture migration awareness
(Pro tier):

- **`src/upgrade/`** — the six-stage pipeline (Detect → Catalog → Impact →
  Plan → Codemods → Verify):
  - **Detect** (`detect.ts`): reads `package.json`, `android/build.gradle`,
    `android/gradle.properties`, `ios/Podfile` for react-native / expo
    versions, Hermes, New Architecture, Kotlin and SDK levels —
    deterministic, no network, no subprocesses.
  - **Catalog** (`catalog.ts`): curated migration catalog of the top
    breaking changes per release — Hermes flag relocation (0.70), New
    Architecture opt-in (0.71), `requireNativeComponent` →
    `codegenNativeComponent` (0.70), ReactTestRenderer import fix (0.73),
    Android SDK levels (0.74+), Kotlin / AGP requirements (0.77+), React
    pairing, Expo SDK targets.
  - **Impact** (`impact.ts`): walks the project's own source for native
    modules, bridge usage (`NativeModules` / `requireNativeComponent`) and
    Fabric-hostile patterns, flagging per-file blast radius.
  - **Plan** (`planner.ts`): step-by-step migration plan with per-step risk
    and a total risk label; steps are `auto` (safe codemods), `review`
    (need `--force`) or `manual` (documented instructions).
  - **Codemods** (`codemods.ts`): applies only with `--apply`; backs up
    every edited file under `.vectalon/upgrades/backups/` and writes a
    provenance manifest (`.vectalon/upgrades/<timestamp>-upgrade.json`)
    recording every edit as an artifact.
  - **Verify** (`verify.ts`): doctor, typecheck and the bundle-budget
    regression gate against a pre-upgrade Metro snapshot.
- **CLI** — `vectalon upgrade [dir]` with `--to <version>`, `--dry-run`
  (default), `--apply`, `--force` and `--json`. Refuses to run outside an
  RN/Expo project; `--apply` never targets cwd by accident.
- **MCP tools** — `plan_upgrade`, `apply_upgrade`, `detect_upgrade_state`
  (`UpgradeTools` registry). `apply_upgrade` requires an explicit
  `directory` argument — it never writes to the current working directory.
- **Self-test** — three new `upgrade` category checks (detect, plan,
  codemods + provenance) in the `vectalon selftest` suite.
- **Tests** — 40+ new tests covering detection, catalog, impact, planner,
  codemods, CLI and MCP tools.

## [0.1.7] - 2026-08-07

### Added — Phase K: Feature self-test suite (`vectalon selftest`)

- **`src/selftest/`** — a sandboxed, deterministic, offline suite that tests
every feature of the package and makes the package's behavior visible to
clients:
  - **`FEATURE_CATALOG`** (`catalog.ts`): 41 checks across 12 categories —
    CLI (version, command actions, logger, `init` scaffolding), SDLC
    (release planner, release-note writer, git-history derivation, ADR,
    stories, test cases, code review, SWOT, tradeoffs, threat model),
    guardrails (rule catalog, engine, policy), knowledge (artifact store,
    knowledge index, embeddings), harness (scanner, workspace detection),
    model (router, tool-calling protocol, WASM presets), MCP (server tool
    surface, subprocess parsing), workflows (catalog, state persistence),
    ecosystem (catalog, config, recommendations), bench (scoring, rubric,
    scenario pack), adapters (runCommand, git round-trip, CI templates,
    registry), and memory (project memory, pattern learner).
  - **`ActivityTracer`** (`trace.ts`): records every step, shell command, and
    file write per check — the “what is this package doing” log; the
    `Sandbox` gives each check an isolated temp dir whose writes are traced
    automatically (never touches the user's project).
  - **Live progress streaming** (`progress.ts`): results stream to stderr as
    each check finishes — a clack-style spinner + progress bar in a TTY,
    plain `✔`/`✖`/`⚠` lines (no ANSI) when piped/CI — via optional
    `onStart`/`onDone` hooks on `runSelfTest`; `--json` keeps stderr quiet.
  - **Real model inference** (`model-inference`): the model check runs an
    actual inference through the configured provider (local GGUF via
    `vectalon pull`, cached WASM weights, or a remote API key) and verifies
    the model-generated output — it never passes on the deterministic
    fallback stub. No model/API key → warns with the exact command to enable
    real inference, or fails under `--require-model`; `--model <provider>`
    forces the provider.
  - **`runSelfTest`** (`runner.ts`): runs checks with `--category`/`--only`
    filters, aggregates per-check durations, statuses, and activity counts.
  - **Reporters** (`reporters.ts`): terminal table summary, a human-readable
    `report.log` activity trace, raw `report.json`, and a **self-contained
    HTML dashboard** (no network) with per-check cards, status/category
    filters, and expandable activity traces.
- **CLI command**: `vectalon selftest [dir]` (`--list`, `--category <cat>`,
  `--only <id>`, `--json`, `--open`, `--out <dir>`, `--no-html`, `--verbose`)
  — writes `report.json`/`report.log`/`report.html` to `.vectalon/selftest/`
  and exits non-zero when any check fails. Also exposed in the interactive
  menu. `createProgram()` is now exported from the CLI module so command
  registration is testable.
- 23 new tests (1,359 total, 151 suites).

## [Unreleased]

### Added — Phase K: Living knowledge brain (III-2) — git-history derivation

- **`GitHistoryDeriver`** (`src/sdlc/GitHistoryDeriver.ts`): deterministic
derivation of SDLC artifacts from `git log` output — “knowledge that writes
itself.” Parses both `--oneline` and extended `%h|%an|%ai|%s` formats,
classifies commits into the release-note taxonomy (shared with
`ReleaseNoteWriter` via the new exported `categorizeChange`), flags breaking
changes, and produces a **changelog** grouped by category (commit refs +
BREAKING badges), **release notes** via `ReleaseNoteWriter` (with the detected
semver bump when a current version is given, reusing the ReleasePlanner bump
detection), and **ADR drafts** from decision-worthy commits (architecture /
migration / redesign keywords) rendered through `ADRWriter` as proposed ADRs.
- **MCP tool**: `derive_from_git_history` — accepts `gitLog` output or a repo
  `path` (auto-runs `git log --format=%h|%an|%ai|%s -50`); persists the
  changelog + release notes as a `devops` artifact and each ADR draft as an
  `architecture` artifact (`includeAdrs: false` skips the ADRs).
- Exported the module, parser, renderer, and types from the package entry point.
- 22 new tests (1,336 total, 146 suites).

### Added — Phase G: Model-backed retrieval

- **`KnowledgeIndex`** (`src/knowledge/KnowledgeIndex.ts`): artifact index with
  TF-based lexical scoring (title terms weigh 3× content), team/project/type
  scoping, limits, and an optional semantic cosine merge via an `EmbeddingProvider`.
- **`embeddings`** (`src/knowledge/embeddings.ts`): `EmbeddingProvider` interface,
  `cosineSimilarity`, and a deterministic offline `HashEmbeddingProvider`
  (character-bigram hashing) so retrieval stays hermetic; real providers plug into
  the same seam.
- **`TeamStore` now delegates search to `KnowledgeIndex`** and `search_knowledge`
  surfaces `lexicalScore` and `semanticScore` alongside the combined `score` —
  enabling model-backed retrieval over the team brain.
- **`serve` attaches the deterministic embedding provider by default** so semantic
  retrieval works offline out of the box.
- Exported the index, embedding helpers, and their types from the package entry point.
- 16 new tests (264 total, 49 suites).

### Added — Phase F: Team brain

- **`TeamStore`** (`src/knowledge/TeamStore.ts`): multi-project artifact registry with
  keyword-ranked cross-project search (title matches weigh higher than content),
  team/project/type scoping, a limit, and aggregated role-scoped context that groups
  artifacts by project and reuses the role→type map.
- **MCP team tools**: `get_team_context` (aggregated context across team projects,
  scoped by team, project, and role) and `search_knowledge` (ranked cross-project
  results scoped by team, project, and type). Advertised only when a `TeamStore` is
  attached to the server.
- **`serve` reads `.vectalon/team.json`**: register sibling projects (path, name,
  optional team) so the harness serves a git-backed team brain; the local project is
  registered automatically. Invalid/missing project stores are skipped with a warning.
- Exported `TeamStore` and its types from the package entry point.
- 20 new tests (248 total, 47 suites).

### Added — Phase E: DevOps, ops, analytics

- **Deterministic devops/ops/analytics modules** (`src/sdlc/`): `ReleaseNoteWriter`
  (auto-categorized Added/Fixed/Changed/Removed/Security/Performance sections with
  an explicit release date), `IncidentAnalyzer` (sev1/sev2/sev3 detection with
  override, root-cause reuse, timeline, and severity-appropriate actions),
  `RunbookWriter` (symptoms, numbered steps, escalation, verification, default
  owner), `KpiReportAnalyzer` (change/change-percent vs baseline, on-track /
  below-target / no-target / no-baseline statuses).
- **MCP devops/ops/analytics tools**: `write_release_notes`, `analyze_incident`,
  `write_runbook`, `analyze_kpis`. Deterministic-first, persisted as `devops`,
  `operations`, and `analytics` artifacts.
- Exported the new modules and types from the package entry point.
- 22 new tests (228 total, 45 suites).

### Added — Phase D: Architecture, security, UX

- **Deterministic architecture/security/UX modules** (`src/sdlc/`): `ADRWriter`
  (ADR scaffold with options/decision/status), `TradeoffAnalyzer` (scored-attribute
  ranking with best-option), `ThreatModeler` (STRIDE six-category model with
  mitigations), `AccessibilityChecker` (unlabelled images, touchable roles,
  text-input labels), `DesignSystemExtractor` (colors/spacing/fonts/radius tokens
  with occurrence counts), `WireframeGenerator` (ASCII wireframes from typed
  sections, `type:label` syntax).
- **MCP architecture/security/UX tools**: `write_adr`, `analyze_tradeoffs`,
  `threat_model`, `check_accessibility`, `extract_design_system`,
  `generate_wireframe`. Deterministic-first, persisted as `architecture`,
  `security`, and `design` artifacts.
- Exported the new modules and types from the package entry point.
- 32 new tests (206 total, 40 suites).

### Added — Phase C: QA & engineering depth

- **Deterministic QA/engineering modules** (`src/sdlc/`): `TestPlanWriter` (plan
  scaffold with scope, environments, entry/exit criteria), `TestCaseWriter`
  (Given/When/Then acceptance criteria → Jest test file), `BugTriageAnalyzer`
  (severity + p0–p3 priority triage), `RootCauseAnalyzer` (8 root-cause buckets
  with investigation steps), `CodeReviewAnalyzer` (console.log, `any`, empty
  catches, TODOs, inline styles, `@ts-ignore` with line numbers), `RefactorSuggester`
  (oversized files/functions, magic numbers, `any`, console output).
- **MCP QA tools**: `write_test_plan`, `triage_bugs`, `analyze_root_cause`,
  `review_code`, `suggest_refactors`. Deterministic-first, persisted to the
  knowledge base as `qa` / `engineering` artifacts.
- **`write_test` now accepts `acceptanceCriteria`**: when provided, it emits
  deterministic Jest test cases derived from the criteria (persisted as a `qa`
  artifact); without it, it continues to proxy to the model layer.
- Exported the new modules and types from the package entry point.
- 34 new tests (174 total, 33 suites).

### Added — Phase B: Requirements & BA

- **Deterministic BA modules** (`src/sdlc/`): `RequirementWriter` (PRD scaffold),
  `StoryWriter` (user story cards, one per persona), `AcceptanceCriteriaWriter`
  (Given/When/Then from a story), `GapAnalyzer` (missing/partial/met with
  recommendations), `SWOTAnalyzer` (four quadrants + SO/WO/ST/WT strategies),
  `SupportTicketAnalyzer` (keyword-themed grouping with top-issue + recommendations).
- **MCP BA tools**: `write_prd`, `write_user_stories`, `define_acceptance_criteria`,
  `analyze_support_tickets`, `run_gap_analysis`. All deterministic-first; generated
  documents are persisted to the knowledge base as `generated` artifacts, and
  `write_user_stories` / `define_acceptance_criteria` accept `parentId` to link
  into the traceability chain. `write_prd` / `write_user_stories` support an
  `enhance: true` flag to expand the scaffold through the configured model.
- Exported the new modules and types from the package entry point.
- 33 new tests (140 total, 26 suites).

### Added — Phase A: Knowledge base (Company Brain)

- **Artifact taxonomy** (`src/knowledge/artifactTypes.ts`): 13 SDLC artifact types,
  sources, statuses, and an 8-role → artifact-type map.
- **`ArtifactStore`**: typed, versioned document store persisted to
  `.vectalon/knowledge/artifacts.json`; content checksums, history, links, and dedup.
- **`Traceability`**: forward/backward graph traversal over artifact links.
- **`RoleEngine`**: role-scoped knowledge context assembly (pm, ba, architect,
  engineer, qa, devops, support, analyst).
- **`rn-vectalon import <file|dir>`** command: imports markdown/JSON artifacts with
  frontmatter + keyword type detection, `--type`/`--title` overrides, and
  checksum-based dedup.
- **MCP knowledge tools**: `list_artifacts`, `get_artifact`, `get_knowledge_context`,
  `link_artifacts` (available when a knowledge store is present).
- `docs/ENHANCEMENT_PLAN.md`: roadmap from project harness to multi-role SDLC harness.
- 30 new tests (107 total, 19 suites).

## [0.1.0] - 2026-07-31

First real release of rn-vectalon. This release hardens the v0.1 API surface
with a full test suite, fixes several defects found during requirement-driven
testing, and removes a dependency that was incompatible with the CommonJS build.

### Added

- Test infrastructure: Jest + ts-jest, 77 tests across 14 suites covering the
  scanner, context engine, model layer, MCP protocol, SDLC modules, memory, and CLI.
- ESLint + TypeScript strict validation wired into `npm run lint` / `npm run typecheck`.
- `MCPServer.handleToolCall()` — public, testable tool dispatch used by the stdio protocol.
- `ContextEngine.getPatternStore()` — exposes the attached pattern store.
- `suggest_dependency_update` tool handler: reports update status against a curated
  catalog (`react-native`, `react`, `typescript`, `jest`, `@react-navigation/native`).
- Pattern persistence: learned patterns are now written to the memory store via
  `PatternStore.addPattern`, so `get_learned_patterns` returns real learned data.
- `CHANGELOG.md` and a project `.eslintrc.json`.

### Changed

- Replaced the `conf` dependency (ESM-only, broke the CommonJS build) with a small
  internal JSON config store. Runtime config lives in `~/.config/rn-vectalon/config.json`
  (override with `RN_VECTALON_CONFIG_DIR`); `.vectalon/rn-vectalon.json` is now a
  project *manifest* written by `init`.
- `ModelRouter` now remembers the provider chosen at `initialize()`, so
  `serve --model` actually takes effect for tool calls.
- `get_learned_patterns` returns learned patterns instead of a component dump.
- The `generate_component` tool schema only advertises `functional` components;
  class components remain unsupported (documented limitation).
- `ProjectMemory` persists its store file on construction.

### Fixed

- `suggest_dependency_update` was advertised in `getToolList()` but had no handler.
- `serve --model` was inert: `generate()` re-read global config instead of the router's provider.
- `init` wrote a config file that was never read; the written file is now an accurate manifest.
- Remote provider responses were untyped (`unknown`); added `OpenAIResponse` /
  `AnthropicResponse` shapes and extended `ModelResponse.usage` with input/output tokens.
- `PatternLearner` learned patterns but never persisted them.
- `LocalProvider` is marked ready when the router initializes it.

### Removed

- `conf` runtime dependency.
