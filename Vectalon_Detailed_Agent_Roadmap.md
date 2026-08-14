# Vectalon RN – Detailed Agent Roadmap

This roadmap is written so autonomous coding agents can pick up individual tasks with clear scope, deliverables, and acceptance criteria.

## Phase 1 – Project Intelligence Core

> **Status: items 001-010 shipped together in `vectalon intel` (v0.4.0)** —
> one deterministic pass covering all ten layers, exposed as `vectalon intel`
> with `--json`, `--graph deps|components|navigation|native|manifest`,
> `--search <q>`, and `--bench` (sub-second retrieval). Workspace-wide in
> monorepos; reports to `docs/vectalon/intel/` (gitignored).

### 001. Project Manifest Schema
**Goal:** Create a canonical representation of any React Native project.
**Deliverables:**
- Manifest schema (JSON/TS)
- RN version, Expo version, platforms, dependencies
- Validation utilities
**Acceptance Criteria:**
- Manifest generated from sample projects
- Schema versioned

### 002. Workspace Discovery Engine
**Goal:** Detect monorepo and package layouts.
**Deliverables:**
- npm/yarn/pnpm/bun detection
- Workspace traversal
- Dependency boundary map
**Acceptance Criteria:**
- Supports Nx, TurboRepo and Yarn workspaces

### 003. Dependency Graph Engine
**Goal:** Build graph of all project dependencies.
**Deliverables:**
- Internal package graph
- External dependency graph
- Circular dependency detection
**Acceptance Criteria:**
- Graph exportable as JSON

### 004. AST Analysis Layer
**Goal:** Unified AST abstraction for JS/TS.
**Deliverables:**
- Babel parser wrappers
- Symbol extraction
- Import/export extraction
**Acceptance Criteria:**
- Parse 95%+ RN codebases

### 005. Repository Indexing Pipeline
**Goal:** Index entire repository.
**Deliverables:**
- File scanner
- Metadata extraction
- Incremental indexing
**Acceptance Criteria:**
- Re-index only changed files

### 006. Semantic Embedding Pipeline
**Goal:** Create vectorized project knowledge.
**Deliverables:**
- Embedding generation
- Chunking strategy
- Vector storage integration
**Acceptance Criteria:**
- Retrieval accuracy benchmark

### 007. Component Relationship Graph
**Goal:** Understand component hierarchy.
**Deliverables:**
- Parent-child relationships
- Shared components map
- Screen usage graph
**Acceptance Criteria:**
- Visual graph export

### 008. Navigation Graph Indexer
**Goal:** Detect app navigation structure.
**Deliverables:**
- React Navigation support
- Deep-link mapping
- Route hierarchy
**Acceptance Criteria:**
- Graph generated automatically

### 009. Native Module Registry
**Goal:** Track native integrations.
**Deliverables:**
- Pod detection
- Gradle detection
- TurboModule registry
**Acceptance Criteria:**
- Native dependencies searchable

### 010. Knowledge Retrieval API
**Goal:** Project-aware retrieval.
**Deliverables:**
- Semantic search
- Context ranking
- Metadata filters
**Acceptance Criteria:**
- Sub-second retrieval

## Phase 2 – Diagnostics

> **Status: items 011-020 shipped together in v0.5.0** —
> `vectalon diagnostics` (011-015: Metro config validation, Hermes
> compatibility against a known-issue database, Gradle + Xcode build-log
> root-cause analysis, and dependency conflict detection, with suggested
> fixes for every finding) and `vectalon generate` (016-020: component,
> screen, test, native-module, and OpenAPI-driven API client generators,
> writing files into the project or previewing with --dry-run).
> Reports to `docs/vectalon/diagnostics/` (gitignored).

### 011. Metro Diagnostics
**Goal:** Detect Metro bundler issues.
**Deliverables:**
- Config validation
- Alias resolution
- Cache troubleshooting
**Acceptance Criteria:**
- Suggest fixes automatically

### 012. Hermes Diagnostics
**Goal:** Analyze Hermes compatibility.
**Deliverables:**
- Config validation
- Runtime issue detection
- Recommendations
**Acceptance Criteria:**
- Known issue database

### 013. Android Build Analyzer
**Goal:** Interpret Gradle failures.
**Deliverables:**
- Log parser
- Root cause classifier
- Suggested fixes
**Acceptance Criteria:**
- Handles top 100 RN build errors

### 014. iOS Build Analyzer
**Goal:** Interpret Xcode failures.
**Deliverables:**
- Pod analysis
- Build log analysis
- Fix recommendations
**Acceptance Criteria:**
- Detects common CocoaPods issues

### 015. Dependency Conflict Detector
**Goal:** Detect version incompatibilities.
**Deliverables:**
- Peer dependency checks
- RN ecosystem matrix
- Fix planner
**Acceptance Criteria:**
- Conflict report generation

## Phase 3 – Code Generation

### 016. Component Generator
**Goal:** Generate RN components.
**Deliverables:**
- Functional component templates
- TypeScript support
- Styling options
**Acceptance Criteria:**
- Production-ready output

### 017. Screen Generator
**Goal:** Generate feature screens.
**Deliverables:**
- Navigation integration
- State management hooks
- Tests
**Acceptance Criteria:**
- Builds successfully

### 018. Native Module Generator
**Goal:** Scaffold native integrations.
**Deliverables:**
- iOS bridge
- Android bridge
- TurboModule support
**Acceptance Criteria:**
- Example builds on both platforms

### 019. Test Generator
**Goal:** Generate automated tests.
**Deliverables:**
- Jest
- RTL
- Coverage reports
**Acceptance Criteria:**
- >80% generated coverage

### 020. API Layer Generator
**Goal:** Generate API clients.
**Deliverables:**
- Typed services
- Error handling
- Caching support
**Acceptance Criteria:**
- OpenAPI integration

## Phase 4 – Performance

> **Status: Phase 4 complete as of v0.6.0** — items 021-023, 027, 029
> shipped together in `vectalon perf` (a single deterministic static pass:
> render-phase setState + inline handler/literal + unmemoized context-value
> detection, heavyweight-import and entry-file side-effect startup analysis,
> legacy bridge-traffic detection, and a severity-ranked recommendation
> engine, with `--json` and reports to `docs/vectalon/perf/`, gitignored).
> The remaining items already shipped earlier: 024/026 (Hermes heap + JS-thread
> analysis in `vectalon profile`), 025 (Metro bundle analysis in
> `vectalon bundle`), 028 (benchmark suite in `vectalon bench`), and 030
> (regression baselines via `profile --baseline` + the bundle-budget gate in
> the release workflow).

### 021. Render Profiler
### 022. Re-render Detector
### 023. Startup Performance Analyzer
### 024. Memory Leak Detector
### 025. Bundle Size Analyzer
### 026. JS Thread Bottleneck Analyzer
### 027. Bridge Traffic Analyzer
### 028. Benchmarking Suite
### 029. Optimization Recommendation Engine
### 030. Performance Regression Tracker

For each:
- Define metrics
- Build collection pipeline
- Generate reports
- Provide fix recommendations

## Phase 5 – RN Upgrade Intelligence

### 031. RN Upgrade Planner
### 032. RN Compatibility Matrix
### 033. Deprecated API Scanner
### 034. Expo SDK Upgrade Assistant
### 035. Android SDK Upgrade Assistant
### 036. iOS Deployment Target Advisor
### 037. Codemod Generator
### 038. Post Upgrade Validation
### 039. Dependency Upgrade Risk Scoring
### 040. Migration Guide Generator

Acceptance:
- Upgrade reports generated automatically

## Phase 6 – Team Brain

> **Status: Phase 6 complete as of v0.6.0** — `vectalon team` (041-049)
> shipped together as one deterministic pass: the project glossary (044,
> frequency-ranked identifiers filtered against code/RN vocabulary),
> coding standards (043, derived from tsconfig/styling/testing/lint/
> navigation/state/package-manager + the guardrail policy), a git-derived
> expertise map (046, author → commits → files → owned components), an
> ADR/decision index (042 + 048, scans docs/adr, docs/decisions, adr/,
> decisions/, *.adr.md, DECISIONS.md into searchable architecture
> artifacts), PR knowledge (045, merge + squash-merged `(#N)` commits), and
> an onboarding brief (049, composed from all the above), all seeded
> idempotently into the knowledge base with `--search <query>` for the
> phase acceptance (team knowledge searchable via semantic queries, across
> every project registered in `.vectalon/team.json`, real embedding APIs
> when configured with a timeout-bounded lexical fallback), `--projects`,
> `--json`, docs to `docs/vectalon/team/` (gitignored). The same pass rides
> `vectalon serve`'s hourly background refresh (Team tier), so the team brain
> regenerates automatically alongside the web-intel refresh. Agents can also
> drive it through MCP: `generate_team_brain` (seeds the pass on demand,
> excluded from safe mode since it writes project docs) and
> `search_team_knowledge` (semantic query across every registered project,
> scoped by project/team/type) are exposed by the serve MCP server.
> Item 050 (Enterprise Policy Engine) already shipped as `vectalon team-policy`
> (org policy + shared bundle budgets through the sync remote).

### 041. Team Memory Store
### 042. ADR Indexing
### 043. Coding Standards Engine
### 044. Project Glossary Generator
### 045. PR Knowledge Extraction
### 046. Team Expertise Mapping
### 047. Release Intelligence
### 048. Decision Tracking System
### 049. Onboarding Assistant
### 050. Enterprise Policy Engine

Acceptance:
- Team knowledge searchable via semantic queries

## Phase 7 – Agent Platform

### 051. MCP Server
### 052. VS Code Extension
### 053. CLI Workflow Engine
### 054. Agent Task Runner
### 055. Multi-Agent Coordination
### 056. Local Model Manager
### 057. Offline Inference
### 058. Prompt Registry
### 059. Benchmark Harness
### 060. Autonomous Task Planner

Acceptance:
- End-to-end agent workflow operational

## Phase 8 – Autonomous Engineering

> **Status: items 061-069 shipped — `vectalon review`, `vectalon arch`,
> `vectalon sec`, `vectalon build-fix`, `vectalon test-repair`,
> `vectalon refactor`, `vectalon deps`, `vectalon a11y`, and
> `vectalon release-ready` — the PR Review Agent reviews the git diff (uncommitted by
> default, or `--base <ref>` for a branch vs its base) in one pass: the
> deterministic CodeReviewAnalyzer runs on each changed file's added lines
> (pinned to real new-file line numbers), the team-brain coding standards
> (043) are cross-checked as line-level probes, and an optional LLM pass
> reviews against the standards context (degrading to the deterministic pass
> when no model is configured). Verdict approved / needs-attention /
> changes-requested; `--json`; reports to `docs/vectalon/review/`
> (gitignored). The Architecture Review Agent reviews the whole module graph
> in one deterministic pass — circular dependencies, layering violations
> (shared code importing feature code), god modules, module over-coupling,
> wide fan-in, unreachable orphans, and over-deep nesting — with per-module
> coupling metrics and a verdict; `--json`, `--src <dir>` and threshold
> overrides; reports to `docs/vectalon/arch/` (gitignored). The Security
> Review Agent reviews the project's security posture in one deterministic
> pass — hardcoded secrets (provider tokens as errors, generic
> key/secret/password assignments as warnings, every value redacted in
> reports), unsafe code patterns (dynamic code execution, shell command
> interpolation, disabled TLS verification, cleartext HTTP, Math.random for
> security material, SQL concatenation, XSS sinks, weak hashes), and
> best-effort dependency advisories via `npm audit` (degrading to a skip when
> the audit can't run, plus an unpinned-dependencies check) — with a verdict;
> `--json`, `--no-audit`; reports to `docs/vectalon/sec/` (gitignored).
> The Build Fix Agent diagnoses a failing Metro, Gradle, or Xcode build from
> its log — the kind is auto-detected from content (or forced with
> `--metro`/`--gradle`/`--xcode`), a pattern classifier finds the root cause
> with the standard fix (a new Metro bundler-failure database: module
> resolution, transform/syntax errors, haste collisions, port conflicts,
> cache corruption, assets, OOM, file watching, monorepo entry points —
> alongside the Gradle (013) and Xcode (014) log analyzers), and
> corroborating failures are listed as a fix plan; `--json`, `--log <path>`;
> reports to `docs/vectalon/build-fix/` (gitignored).
> The Test Repair Agent diagnoses a failing Jest, Detox, or Maestro test run
> from its output log — the kind is auto-detected from content (or forced
> with `--jest`/`--detox`/`--maestro`), a pattern classifier finds the root
> cause with the standard fix (Jest: assertion/snapshot mismatches, open
> handles, suite-collection errors, test module resolution, transform
> errors, missing globals, worker crashes, async timeouts; Detox: app launch
> failures, element-not-found/waitFor timeouts, TOCTOU flakiness, build
> failures, permissions, test-runner config; Maestro: assertions, element
> visibility, app state, device connection, CLI version), and corroborating
> failures are listed as a fix plan; `--json`, `--log <path>`; reports to
> `docs/vectalon/test-repair/` (gitignored).
> The Refactoring Agent scans the project source files in one deterministic
> pass and proposes concrete, safe refactors — dead code (AST-backed unused
> imports, unused variables, unreachable statements), duplication (repeated
> 4-line blocks, repeated long strings), modernization (optional chaining,
> `.includes` over `indexOf`, strict equality, const/let), type smells
> (`any`, `@ts-ignore`/`@ts-expect-error`), inline-style debt, console
> noise, and complexity (long functions, oversized files via the shared
> RefactorSuggester) — every finding line-pinned with a specific suggestion;
> `--json`; reports to `docs/vectalon/refactor/` (gitignored).
> The Dependency Upgrade Agent finds what to upgrade and the safe path — RN
> ecosystem pairing violations against the curated matrix (013/015),
> duplicate versions across workspace members, and vulnerable dependencies
> via best-effort `npm audit` (critical → error, high → warning) with
> `npm audit fix` guidance — `vectalon deps`; `--json`, `--no-audit`;
> reports to `docs/vectalon/deps/` (gitignored). The Accessibility Agent
> scans component files in one pass — unlabeled images (error), touchables
> without roles, unlabeled TextInputs, and undersized touch targets (the
> 44×44pt guideline), line-pinned with fixes — `vectalon a11y`; `--json`;
> reports to `docs/vectalon/a11y/` (gitignored). The Release Readiness Agent
> answers “can we ship?” with a deterministic checklist — version bumped
> past the last tag (read-only git), CHANGELOG section present, clean
> working tree, CI workflows, lockfile, tests configured, secrets hygiene
> (committed .env), and TODO/FIXME triage — `vectalon release-ready`;
> `--json`; reports to `docs/vectalon/release-ready/` (gitignored).

### 061. PR Review Agent
### 062. Architecture Review Agent
### 063. Security Review Agent
### 064. Build Fix Agent
### 065. Test Repair Agent
### 066. Refactoring Agent
### 067. Dependency Upgrade Agent
### 068. Accessibility Agent
### 069. Release Readiness Agent
### 070. Autonomous Bug Fix Agent

Acceptance:
- Agent can propose and execute changes safely

## Remaining Backlog (071-100)

Focus Areas:
- Figma-to-code
- Design token sync
- Fine tuning pipelines
- LoRA training
- CI/CD intelligence
- GitHub integration
- Crashlytics intelligence
- Sentry intelligence
- Mobile observability
- Enterprise governance
- SOC2 readiness
- Audit trails
- Agent permissions
- Multi-repository memory
- Mobile architecture scoring
- Team productivity analytics
- Release prediction models
- App Store readiness checks
- Play Store readiness checks
- Executive engineering dashboards
