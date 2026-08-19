# rn-vectalon Enhancement Plan

Current RN release: <!-- product-fact:rn-version -->0.15.0<!-- /product-fact --> ·
benchmark scenarios: <!-- product-fact:benchmark-scenarios -->43<!-- /product-fact -->

> From "Project Harness" to "Company Brain" to **Autonomous RN Engineering Org** —
> an adaptive AI that acts as Product Manager, Business Analyst, Architect, Senior
> Engineer, QA, DevOps, Support, and Analyst across the full SDLC.

## Vision

Today rn-vectalon is a **project-aware** harness: 4 SDLC modules + 6 MCP tools +
per-project pattern memory. It has grown into an **organization-aware** harness
that plays every engineering-org role against a persistent **Company Brain** — a
typed, versioned, traceable knowledge base that AI consults (and writes to) at
every SDLC stage.

The highest-leverage gap is not "more tools" — it is **the knowledge layer**.
Most SDLC value comes from AI having context (docs, tickets, analytics, incidents)
and traceability (requirements → stories → code → tests → release). Infrastructure
therefore leads; stage capabilities layer on top.

### The moat: why this SDK can be one of a kind

Every AI coding tool in 2026 is **general-purpose** — it treats a React Native
repo like any other TypeScript repo and has no idea about the bridge, the Metro
bundler, Hermes vs JSC, TurboModules, autolinking, or podspec breakage. That is
rn-vectalon's moat: it is the only harness that **understands React Native
itself**. The phases below turn that understanding into an autonomous mobile
engineering team any agent can hire — one that compiles, renders, and
self-corrects before it ever shows you a diff.

## Current state vs target

> **Delivered so far:** Phases A–H (knowledge base, BA/QA/arch/UX/devops/ops
> analytics modules, team brain, semantic retrieval, guardrails + policy
> engine, self-healing review, web-aware refresh, hosted sync, real embeddings,
> local model), plus the 2026 hardening track: LLM intent detection & smart
> routing, the ecosystem catalog (MCP servers/skills/tools/hooks) with Expo &
> RN-CLI separation, ecosystem MCP exposure in `serve`, init tooling & model
> setup, resolved-model surfacing, the ecosystem & native-toolchain doctor with
> `--fix` auto-remediation, and the RN coding-tests benchmark (V-5, M1–M4/M6
> delivered, including the CI regression gate). The Phase I+ roadmap items below
> that are now **delivered** (see the [Status tracker](#status-tracker) for
> details): **I-1 RN knowledge graph (AST-grade)** — `AstScanner` + `CodeGraph`
> replace the regex scanner; **I-2 New Architecture & React Compiler
> awareness** — detection from `gradle.properties`/`Podfile`/config with
> Fabric-hostile guardrails; **I-5 simulator control + Maestro E2E** — device
> tools + acceptance-criteria Maestro flows in test/verification phases;
> **I-6 Metro bundle analysis & performance budgets** — `bundleAnalyzer`
> budgets + bundle-size history with growth warnings; **II-2 self-healing CI**
> — real PR automation + EAS/GitHub Actions workflow generation; **III-1
> runtime telemetry ingestion** — Sentry/Crashlytics/trace/analytics parsing
> with data-driven crash analysis; **IV-1 IDE extension**; **V-4 monorepo
> workspace support**; **VI-1 React 19 guardrails**. See the README
> [`Roadmap`](README.md) for the authoritative delivered/next-up lists and
> [`CLI_REFERENCE.md`](CLI_REFERENCE.md) for every command. The rows below show
> where the roadmap goes next; see the
> [Phase I+ roadmap](#phase-i--the-futuristic-roadmap-one-of-a-kind-rn-engineering)
> for the futuristic track.

| SDLC stage | Today | Gap (Phase I+ target) |
|---|---|---|
| 1. Discovery & validation | SWOT, ticket analysis | BRD/charter + opportunity assessment |
| 2. Product management | PRD, stories, acceptance criteria | Roadmap, OKRs, personas, prioritization |
| 3. Business analysis | SRS, use cases, gap analysis, RTM | Data dictionary, live traceability |
| 4. UX/UI design | Wireframes, a11y, design tokens, **simulator screenshots (I-5)** | Design-system *enforcement* |
| 5. Solution architecture | ADRs, tradeoffs | HLD/LLD, tech evaluation, upgrade planner (I-6) |
| 6. Engineering | component-gen, analyze-error, lint-fixer, review, refactors, **RN knowledge graph (I-1, AST), New Arch awareness (I-2), Metro bundle budgets (I-6)** | API contracts, Metro sandbox, Hermes profiling (I-7) |
| 7. Data engineering | — | Schema design, data dictionary |
| 8. Security | Threat model, policy guardrails | OWASP-aware review, secrets/supply-chain checks (V-2) |
| 9. QA | write-test, test plans, triage, RCA | Test strategy/plan, UAT, device-farm execution |
| 10. DevOps & release | Release notes, CI scripts, **self-healing CI (II-2)** | Release automation |
| 11. Ops & support | Incidents, runbooks, **runtime telemetry ingestion (III-1)** | Auto-remediation |
| 12. Analytics & growth | KPI reports | Funnel analysis, experiment planning |
| Knowledge base | Artifacts, team brain, embeddings, sync, refresh | Provenance scoring (III-3), git-history derivation (III-2) |
| Team / multi-project | TeamStore + sync, **monorepo workspace support (V-4)** | Cross-project convention learning (III-4), federated team-brain instances |

## Architecture additions (foundation)

```
.vectalon/
  snapshot.json          project structure (existing)
  context.md             prompt assembly (existing)
  memory.json            learned patterns (existing)
  knowledge/             THE COMPANY BRAIN (new)
    artifacts.json       typed, versioned, linked documents
```

**Design rules**

1. **Artifacts are typed and versioned.** Every document is an `Artifact` with a
   `type` from the 12-stage taxonomy, `source`, `status`, `version`, `links[]`,
   and a content `checksum` for dedup.
2. **Knowledge flows one way into retrieval.** `get_project_context` remains the
   code view; `get_knowledge_context(role)` queries the brain by role.
3. **Ingestion is import-driven.** `rn-vectalon import` ingests markdown/JSON
   (Jira exports, ticket dumps, existing PRDs) without requiring an LLM call.
4. **Deterministic-first.** Every module has a no-model fallback so tests stay
   hermetic (same TDD discipline as v0.1.0).
5. **Provenance on everything.** No generated document without `source` + `links`.

**New foundation modules (`src/knowledge/`)**

| Module | File | Purpose |
|---|---|---|
| Taxonomy | `artifactTypes.ts` | ArtifactType / source / status, role→type map |
| ArtifactStore | `ArtifactStore.ts` | Versioned document store in `.vectalon/knowledge/artifacts.json` |
| Traceability | `Traceability.ts` | RTM graph traversal over artifact links |
| RoleEngine | `RoleEngine.ts` | Per-role knowledge context assembly |
| (later) KnowledgeIndex | `KnowledgeIndex.ts` | Embeddings + retrieval |

## Phased delivery

Each phase runs the full SDLC loop: requirement → TDD → verify → release.

### Phase A — Knowledge base (foundation)
- Artifact type taxonomy (12-stage)
- `ArtifactStore` + `Traceability` + `RoleEngine`
- `rn-vectalon import` command (markdown/JSON, checksum dedup, frontmatter + `--type`)
- MCP tools: `list_artifacts`, `get_artifact`, `get_knowledge_context`, `link_artifacts`
- **Unblocks every later phase**; ships standalone value.

### Phase B — Requirements & BA
- Modules: `RequirementWriter`, `StoryWriter`, `AcceptanceCriteriaWriter`, `GapAnalyzer`, `SWOTAnalyzer`, `SupportTicketAnalyzer`
- Tools: `write_prd`, `write_user_stories`, `define_acceptance_criteria`, `analyze_support_tickets`, `run_gap_analysis`
- Generated documents persist as `generated` artifacts; stories/acceptance criteria link to a parent via `parentId`

### Phase C — QA & engineering depth
- Modules: `TestPlanWriter`, `TestCaseWriter`, `BugTriageAnalyzer`, `RootCauseAnalyzer`, `CodeReviewAnalyzer`, `RefactorSuggester`
- Tools: `write_test_plan`, `triage_bugs`, `analyze_root_cause`, `review_code`, `suggest_refactors`
- `write_test` consumes acceptance criteria → deterministic Jest test cases

### Phase D — Architecture, security, UX
- Modules: `ADRWriter`, `TradeoffAnalyzer`, `ThreatModeler`, `AccessibilityChecker`, `DesignSystemExtractor`, `WireframeGenerator`
- Tools: `write_adr`, `analyze_tradeoffs`, `threat_model`, `check_accessibility`, `extract_design_system`, `generate_wireframe`
- Artifacts: `architecture` (ADRs, tradeoffs), `security` (threat models), `design` (a11y, tokens, wireframes)

### Phase E — DevOps, ops, analytics
- Modules: `ReleaseNoteWriter`, `IncidentAnalyzer`, `RunbookWriter`, `KpiReportAnalyzer`
- Tools: `write_release_notes`, `analyze_incident`, `write_runbook`, `analyze_kpis`
- Artifacts: `devops` (release notes), `operations` (incidents, runbooks), `analytics` (KPI reports)
- CI/CD integration (v0.5 roadmap): auto-fix PRs, draft release notes in CI

### Phase F — Team brain (v0.4 roadmap)
- Modules: `TeamStore` (multi-project registry, keyword-ranked cross-project search, aggregated role-scoped context)
- Tools: `get_team_context`, `search_knowledge` (scoped by team, project, and type)
- Config: `.vectalon/team.json` registers sibling projects (git-backed, shared across the team)

### Phase G — Model-backed retrieval (embedding index + semantic search)
- Modules: `KnowledgeIndex` (TF lexical scoring + optional semantic cosine merge), `embeddings` (provider interface, `cosineSimilarity`, deterministic `HashEmbeddingProvider`)
- `TeamStore` delegates search to `KnowledgeIndex`; `search_knowledge` surfaces `lexicalScore` + `semanticScore`
- `serve` attaches the deterministic provider by default; real providers plug in via the `EmbeddingProvider` seam
- Future (v0.5): hosted artifact store, real embedding API providers

## Sequencing rationale

| Phase | Why first | Roadmap |
|---|---|---|
| A. Knowledge base | Everything downstream consumes it; ships standalone | pre-v0.2 |
| B. Requirements/BA | Highest leverage for a Tech Lead; feeds C–E | v0.2 |
| C. QA/Engineering depth | Existing modules seed it; highest immediate payoff | v0.2 |
| D. Architecture/Security/UX | Needs PRD context from B | v0.3 |
| E. DevOps/Ops/Analytics | Needs shipped releases + usage | v0.5 |
| F. Team brain | Needs all artifact types mature | v0.4 |

## Non-functional requirements

- Deterministic-first: no-model fallback for every generator (testable offline).
- Artifact schema validation on import.
- Provenance on every artifact.
- Security review of remote embedding calls; API-key hygiene via config store.

## Phase H — Local free-for-commercial-use model (v0.4)

> Note: the original README roadmap labeled this "v0.2". Because the previous
> releases (feature-development workflow, CLI polish, interactive menu, and
> cleanup) shipped as v0.2.0–v0.3.0, this phase is now targeted at v0.4.0.

Replace the deterministic `LocalProvider` stub with a real, locally runnable
code model that works offline and is **free for commercial use**.

### Model choice

| Model | License | Commercial use | Size | Why |
|---|---|---|---|---|
| **Qwen2.5-Coder-1.5B-Instruct-GGUF** | Apache 2.0 | ✅ Free | ~1.1 GB (Q4_K_M) | Apache 2.0, small enough for laptops, strong coding performance, GGUF ecosystem, chat template support |
| Qwen2.5-Coder-3B-Instruct-GGUF | Apache 2.0 | ✅ Free | ~2.0 GB (Q4_K_M) | Better quality if the user has more RAM |
| Llama 3.1/3.2 Instruct GGUF | Llama 3 license | ✅ Free | 1–4 GB | Alternative, also GGUF compatible |
| DeepSeek-Coder-V2 / V2.5 | DeepSeek license | ✅ Free | 3–16 GB | Strong code model, but larger |

**Primary default**: `Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M` because the
Apache 2.0 license is unambiguous for commercial use, and the 1.5B Q4_K_M
quantization runs on CPU in ~1 GB of RAM.

### Runtime choice

| Option | License | Pros | Cons |
|---|---|---|---|
| **node-llama-cpp** | MIT | Pre-built binaries for macOS/Linux/Windows, Metal/CUDA/Vulkan, GGUF, chat templates, JSON schema | ESM-only, requires Node ≥20, native binaries, larger install |
| **ollama** (subprocess) | MIT | Easy UX, handles model pulls, OpenAI-compatible API | Requires separate Ollama install, subprocess dependency |
| **llama.cpp CLI** | MIT | Fastest, no Node binding | Requires manual download/compile |
| **onnxruntime-node** | MIT | Pure JS/ONNX | Smaller model ecosystem, harder to find good RN code models |

**Primary choice**: `node-llama-cpp` as the default runtime. It is MIT licensed,
ships pre-built binaries, supports the chosen GGUF model, and has a TypeScript API.
Because it is ESM-only and we compile to CommonJS, we load it via dynamic `import()`.

### Commands

```bash
# Download the default model into ~/.config/rn-vectalon/models/
vectalon pull

# Download a specific model/quantization
vectalon pull qwen2.5-coder-1.5b:q4_k_m

# List downloaded models
vectalon models

# Interactive chat with the local model (optional)
vectalon chat
```

### Integration plan

1. **Model storage layer**
   - `src/model/local/ModelStore.ts`: paths, download cache, manifest, cleanup
   - Default directory: `~/.config/rn-vectalon/models/` (respect `RN_VECTALON_CONFIG_DIR`)
   - Manifest records: model id, source URL, quantization, checksum, downloadedAt

2. **Download / pull command**
   - `src/cli/commands/pull.ts`: `vectalon pull [model][:quantization]`
   - Use Hugging Face `huggingface-cli` or `node-llama-cpp` download helpers, or a plain HTTPS fetch to the GGUF file
   - Show progress with `@clack/prompts`
   - Verify checksum

3. **Local model provider rewrite**
   - `src/model/providers/LocalProvider.ts`:
     - Load `node-llama-cpp` via dynamic import
     - If a downloaded model exists, create `LlamaChatSession` and prompt
     - Apply Qwen chat template
     - If no model exists, fall back to the deterministic echo stub with a warning
     - Keep `isReady()` semantics

4. **Model router updates**
   - `ModelRouter` stays the same; `provider: 'local'` now does real inference when a model is present.
   - Add a `modelStatus` check to tools so the agent can tell whether it is running against the stub or the real model.

5. **Non-functional requirements**
   - **Deterministic fallback preserved**: tests run without downloading any model.
   - **Optional dependency**: `node-llama-cpp` is an optional/peer dependency so installs without native binaries still work.
   - **Engine bump**: Node `>=20.12.0` because `node-llama-cpp` requires Node ≥20 and `@clack/prompts` already requires Node ≥20.12.0.
   - **License hygiene**: default model is Apache 2.0; document the license and attribution in the model manifest.

### Status

- [x] Model store + download command
- [x] node-llama-cpp dynamic integration
- [x] **Optional dependency** — `node-llama-cpp` moved to `optionalDependencies` (dev-only for the repo's own typecheck); `LocalProvider` probes the module at init and degrades to the deterministic stub with a clear warning when it's missing or fails to load, so installs on constrained systems never break
- [ ] Qwen chat template support (using default node-llama-cpp chat wrapper)
- [x] Fallback to deterministic stub
- [x] `vectalon models` / `vectalon pull` commands
- [x] Tests with stub (no model download required)
- [x] Documentation and license attribution

## Phase I+ — The Futuristic Roadmap: one-of-a-kind RN engineering

> North star: **"The agent that ships — and understands React Native the way a
> 10x mobile lead does."** The next phases take rn-vectalon from a project-aware
> harness to the only harness in the world that *is* a mobile engineering
> organization: it compiles, renders, reviews, ships, and learns — with zero
> lock-in to any agent.

Each idea below is grounded in the seams that already exist in this codebase
(workflow engine, adapters, knowledge graph, guardrails, model router, sync),
so none requires a rewrite — each is a bounded, shippable phase.

### I. RN-native understanding (the moat)

**I-1. RN Architecture Knowledge Graph (AST-grade).** Replace regex scanning
with a TypeScript/Babel AST graph that tracks components, hooks, navigation
trees (React Navigation + Expo Router v4 file-based routes), native module
boundaries (JSI vs TurboModule vs legacy bridge), state management boundaries
(Zustand/Jotai/Context), and StyleSheet usage. When an agent touches a shared
component, the graph tells it *which native bridges serialize on the JS thread*,
*which screens re-render*, and *which podspecs break*.

**I-2. React Native New Architecture & React Compiler Native Awareness.** Upgrade
the scanner to detect `bridgelessEnabled`, `fabricEnabled`, `newArchEnabled`,
`turboModules`, and Interop Layer flags from `gradle.properties`, `Podfile`, and
`react-native.config.js`. Extend the context engine so agents receive a "New
Architecture impact summary" (e.g., "this project uses Fabric — do not suggest
`setNativeProps`"). Add guardrails that flag synchronous legacy `NativeModules`
calls and missing TurboModule TypeScript specs. Detect React Compiler
(`babel-plugin-react-compiler`) setup and explain memoization implications to
agents, ensuring generated code is aligned with RN 0.76+ defaults.

**I-3. TurboModule & Fabric Component Scaffolding.** Deterministic code
generation for the full New Architecture native module stack: TypeScript spec →
C++ JSI bindings → iOS Objective-C++ / Android Java-Kotlin implementation →
`podspec` / `build.gradle` entries → codegen config. Support both bare RN-CLI
and Expo Modules API variants. This is a high-leverage "one-of-a-kind"
feature no generalist AI tool has.

**I-4. Metro-aware execution sandbox + live preview.** Instead of generating code
blind, the harness compiles the generated file through Metro, hot-reloads it into
an isolated simulator / headless RN-web container, and *reads the result* —
console logs, render output, and runtime errors — before presenting the diff.
Agents become self-correcting on JSX/TS errors, not just lint-syntax aware.

**I-5. Simulator control tool + Maestro E2E generation.** Drive the iOS Simulator /
Android Emulator from MCP: boot, screenshot, tap, swipe, deep-link. Agents
visually verify UI (screenshots attached to PRs), test deep links, and record
screen flows — closing the loop between "code compiles" and "app actually
looks/behaves right." Additionally, generate **Maestro YAML flows from
acceptance criteria** during the test-writing phase, and integrate them into
the verification phase so E2E tests run and attach screenshots to the PR artifact.

**I-6. Metro Bundler Intelligence & Performance Budgets.** Integrate
`metro-bundle-analyzer` to snapshot bundle composition per build. Enforce
**performance budgets** in the code-review phase: flag new heavy libraries
(>100KB), missing `sideEffects: false`, unoptimized images, and large static
assets. Store bundle-size history in the Knowledge Base so `vectalon feature`
can warn "this PR increases the bundle by 12% — consider `react-native-svg`
instead of `lottie-react-native`."

**I-7. Hermes Performance Profiling & Runtime Regression Detection.** Parse
Hermes `.cpuprofile` and heap snapshots to detect JS thread blocking events,
large retained objects, and memory leaks. Integrate re-render profiler data from
ecosystem MCPs (`react-native-mcp`, `metro-mcp`). Surface concrete metrics in
code review: "This `useEffect` runs a 500ms JSON parse on the JS thread — move to
a worklet or native module." Store performance baselines in the Knowledge Base
and flag regressions.

**I-8. RN upgrade planner.** A workflow that reads the project's RN version and
diffs a curated migration catalog (0.7x → 0.8x → new architecture), producing a
step-by-step upgrade plan, breaking-change impact analysis on the code graph,
and auto-applying safe migrations.

### II. Autonomous mobile engineering team

**II-1. Multi-agent "mobile squad" orchestration.** Instead of one generalist,
spawn a typed, coordinated squad of specialized sub-agents (patterned after
real RN teams):

- **UI/UX Agent** — Flexbox correctness, responsive breakpoints, dark/light
  tokens, accessibility labels.
- **Native Bridge & Performance Agent** — JSI/TurboModule bindings, bridge
  serialization, 60/120fps UI-thread work, native module lifecycle.
- **State & Data Sync Agent** — MMKV/WatermelonDB/Realm patterns, offline
  queues, optimistic updates, cache invalidation.

Each role owns a phase or review pass and reports into the workflow, giving
agents *depth* instead of breadth.

**II-2. Self-healing CI (auto-fix PRs) + EAS Workflows Integration.** A CI mode
that runs the code-review + verification pipeline on every PR, *writes fixes back
to the branch*, re-runs verification, and leaves a review comment describing
what it changed and why — the workflow engine's existing heal loop, pointed at
GitHub Actions. For Expo projects, add deep **EAS Workflows** integration
(build, submit, update, Maestro test flows). For bare RN CLI: generate GitHub
Actions / Bitrise templates with proper caching, emulator setup, and Maestro E2E
steps.

**II-3. Durable, resumable agent sessions.** SQLite-backed session persistence
with context compaction (inspired by the latest durable-agent patterns): long
refactors and multi-hour tasks survive restarts, resume from the last
checkpoint, and never blow the context window.

**II-4. Ticket-to-PR autonomy.** An end-to-end pipeline that reads a ticket
(Jira/Linear/GitHub), writes PRD + stories + acceptance criteria, generates
TDD-first tests, implements, self-reviews, verifies on a preview environment,
and opens a PR — all from `vectalon feature` with the existing adapters, just
orchestrated headlessly.

### III. The living knowledge brain

**III-1. Runtime telemetry ingestion.** Wire the brain to consume crash reports
(Sentry/Firebase), perf traces, and analytics events as artifacts — so the QA and
root-cause tools reason about *your actual production data*, not generic
examples. Incident analysis and runbooks become data-driven.

**III-2. Automatic artifact derivation from git history.** New tool that walks
git history + PRs and derives changelog entries, ADRs, and release notes
automatically — knowledge that writes itself.

**III-3. Knowledge provenance & confidence scoring.** Every learned pattern and
artifact carries a confidence score, source, and staleness date; retrieval ranks
by confidence so agents trust recent, high-confidence context over stale guesses.

**III-4. Cross-project convention learning (team brain v2).** The team brain
stops being just retrieval — patterns learned in one project (naming, structure,
error handling) propagate as *suggested* conventions into sibling projects,
making the whole org's codebase progressively homogeneous.

### IV. Developer experience that feels like magic

**IV-1. VS Code / JetBrains extension.** A thin IDE layer: inline
explanation of generated code, hover over the brain for artifact context,
command palette for workflows, and a visual code-review panel. (Not a new
product — the same MCP server, native UI.)

**IV-2. MCP Apps / interactive tool results.** Return interactive widgets —
diff viewers, checklists, charts — from tools instead of raw text, so agents and
IDE panels render rich, actionable results (the ecosystem is moving exactly here
in 2026).

**IV-3. Guardrail policy marketplace + PR guardrails + Accessibility Automation.**
Ship curated policy packs (accessibility, security, performance, architecture) in
`vectalon policy` and enforce guardrails as *PR checks* via the hosted artifact
store / CI hook — policies that travel with the repo. Extend
`AccessibilityChecker` with automated screen-reader flow validation (using
simulator control to drive VoiceOver/TalkBack and verify announcements). Add
contrast-ratio guardrails for color tokens. Generate accessibility test cases
from PRDs. Enforce `accessibilityRole`, `accessibilityState`, and
`accessibilityActions` completeness. This turns a11y from a "check for labels"
into a full compliance gate.

**IV-4. Offline-first everything.** Real local embeddings + local model already
in place; make the whole harness fully functional in air-gapped environments
including the knowledge refresh (cached feeds) and embedding cache.

**IV-5. Preview environments on demand.** `vectalon preview` spins up an
ephemeral Expo/RN-web preview build per PR so anyone — PM, QA, stakeholder —
sees the feature running before merge, with the workflow's PR phase linking to
it.

### V. Trust, safety, and scale

**V-1. Sandboxed code execution.** Run generated code, tests, and scripts in a
sandbox (isolated process / container) with no ambient authority, so the
harness's own automation is safe to run on untrusted input.

**V-2. Secrets & supply-chain guardrails.** Extend guardrails to scan for
committed secrets and known-vulnerable dependency versions (OSV-style feed),
blocking merges that introduce them.

**V-3. Explorable reasoning & audit trail.** Every workflow phase logs its
decisions, sources, and model reasoning to the artifact store — a complete,
replayable audit trail from prompt to PR (already partly true via workflow
state persistence; make it a first-class, queryable log).

**V-4. Horizontal scale: monorepo & federated teams.** Let one harness serve a
monorepo (workspace-aware scanning) and federate multiple harness instances
behind one team brain so the org grows without per-project silos. Extend
`Scanner` to detect workspace roots (`pnpm-workspace.yaml`, `turbo.json`),
internal package dependencies, and shared UI libraries. Map Metro resolution
paths and flag hoisting conflicts. Generate monorepo-aware context prompts
("This app is in a pnpm workspace — `react-native` is hoisted to root; do not
add it to sub-package `devDependencies`").

**V-5. Benchmark suite for RN generation.** Build a public eval harness — "RN
coding tests" — measuring generated code correctness, RN best-practice
adherence, and guardrail pass rate, so the project can *prove* it beats generic
tools and drive regression-aware model/harness tuning. **Scoped in
[`docs/BENCHMARK_PLAN.md`](BENCHMARK_PLAN.md):** three scored axes
(correctness 0.4 / RN best-practice rubric 0.3 / guardrail pass rate 0.3), a
`vectalon bench` harness that reuses the temp-project fixtures, guardrail rules,
and verification gate, plus the first 10 eval scenarios (login screen,
FlatList fetch, dark-mode, typed navigation, form validation, offline queue,
image feed, feature flags, accessible form, refactor-to-hooks). **Status:**
M1–M6 are delivered (see the [Status tracker](#status-tracker)). M4 adds the
CI regression gate: a committed `bench/baseline.json` plus
`vectalon bench --baseline` run by `.github/workflows/ci.yml` on every PR,
failing on any axis regression. M5 adds the public leaderboard: a nightly
scheduled workflow (`.github/workflows/leaderboard.yml`) runs `vectalon bench
--live --install --model` on a `[local, openai, anthropic]` matrix, merges the
per-model results with `vectalon leaderboard`, and commits a timestamped
`BENCHMARK_RESULTS.md` back to the repo.

### VI. React 19 / React Compiler Guardrails & Pattern Enforcement

**VI-1. React 19 Modernization Guardrails.** React 19 introduces `use()`, `ref` as
a prop, new `useEffect` cleanup semantics, and React Compiler auto-memoization.
Agents trained on older patterns generate incompatible code. Add guardrail rules
that flag `ref` mutation during render (breaks React Compiler), missing cleanup
in `useEffect`, incorrect `use` hook usage outside Suspense boundaries, and
unstable dependency arrays that defeat memoization. Detect `react-compiler`
health (are there `"use no memo"` escapes that should be fixed?). This keeps
generated code aligned with the latest React 19 + RN best practices.

### Sequencing (why this order)

| Phase | Why now | Effort |
|---|---|---|
| I-2 New Architecture awareness | Foundation for everything else; agents must stop hallucinating bridge patterns | M |
| I-1 RN knowledge graph | Foundation for I-3, I-4, I-7, and upgrade planner | L |
| I-3 TurboModule scaffolding | High-leverage moat feature no generalist tool has | L |
| I-6 Metro bundle budgets | Small, high-visibility, pure deterministic win on existing review seam | S |
| I-5 Simulator + Maestro | Unlocks visual verification and E2E generation | M |
| VI-1 React 19 guardrails | Small effort, immediate impact on generated code quality | S |
| V-4 Monorepo context | Daily pain point for teams at scale; brings forward existing V-4 plan | M |
| II-2 Self-healing CI + EAS | Sells the SDK to CI-heavy teams and Expo users | M |
| I-7 Hermes profiling | Deepens existing performance review (I-6) with runtime data | M |
| IV-3 A11y automation + policy marketplace | Completes guardrails as a full compliance gate | M |
| I-8 Upgrade planner | Requires I-1 + I-2 to be mature first | M |
| II-4 Ticket-to-PR | The flagship demo of full autonomy; needs II-2 + I-5 | M |
| II-1 Multi-agent squad | Needs I-1 and I-7 for performance-agent depth | L |
| III-1 Runtime ingestion | Turns the brain from static to live | M |
| IV-1 IDE extension | Distribution & adoption multiplier | M |
| V-1 Sandboxing | Prerequisite for any trust-heavy automation | M |

## Status tracker

- [x] v0.1.0 release (tests, lint, typecheck, CI-ready scripts)
- [x] **Phase A — Knowledge base** (taxonomy, ArtifactStore, Traceability, RoleEngine, import command, MCP knowledge tools)
- [x] **Phase B — Requirements & BA** (RequirementWriter, StoryWriter, AcceptanceCriteriaWriter, GapAnalyzer, SWOTAnalyzer, SupportTicketAnalyzer; write_prd, write_user_stories, define_acceptance_criteria, analyze_support_tickets, run_gap_analysis; generated artifacts persisted + linkable via parentId)
- [x] **Phase C — QA & engineering depth** (TestPlanWriter, TestCaseWriter, BugTriageAnalyzer, RootCauseAnalyzer, CodeReviewAnalyzer, RefactorSuggester; write_test_plan, triage_bugs, analyze_root_cause, review_code, suggest_refactors; write_test consumes acceptance criteria → Jest cases)
- [x] **Phase D — Architecture, security, UX** (ADRWriter, TradeoffAnalyzer, ThreatModeler, AccessibilityChecker, DesignSystemExtractor, WireframeGenerator; write_adr, analyze_tradeoffs, threat_model, check_accessibility, extract_design_system, generate_wireframe)
- [x] **Phase E — DevOps, ops, analytics** (ReleaseNoteWriter, IncidentAnalyzer, RunbookWriter, KpiReportAnalyzer; write_release_notes, analyze_incident, write_runbook, analyze_kpis)
- [x] **Phase F — Team brain** (TeamStore multi-project registry; get_team_context + search_knowledge scoped by team/project/type; .vectalon/team.json config)
- [x] **Phase G — Model-backed retrieval** (KnowledgeIndex with TF lexical + semantic cosine merge; embeddings provider seam + deterministic HashEmbeddingProvider; search_knowledge surfaces lexical/semantic scores)
- [x] **Phase G.2 — Real embedding APIs** (RemoteEmbeddingProvider seam + OpenAI/OpenAI-compatible providers from config/env; async searchRemote in KnowledgeIndex + TeamStore; MCP search_knowledge uses real vectors when configured)
- [x] **Phase G.3 — Hosted artifact store** (ArtifactSync push/pull via git remote, `.vectalon/sync.json` config, `vectalon sync` CLI command; serve logs sync status)
- [x] **Phase H — Local model** (Qwen2.5-Coder + node-llama-cpp, free for commercial use, deterministic fallback)
- [x] **Phase H.2 — Ecosystem catalog** (`vectalon ecosystem` indexing external MCP servers, skills, tools, hooks; .vectalon/ecosystem.json enable/disable; `--export` emits an MCP config fragment for Cursor/Claude Code)
- [x] **Phase H.3 — Expo / RN-CLI separation** (Scanner records `tooling: 'expo' | 'rn-cli'` + Expo SDK version; context prompt + intent prompt include tooling; simulator adapter runs `expo run:*` vs `react-native run:*`; dependency-removal plans are Expo-aware with `expo prebuild --clean` + `expo-doctor`)
- [x] **Phase H.4 — LLM intent detection & smart routing** (five intents — `add-feature` / `fix` / `refactor` / `remove-dependency` / `unknown` — classified by the LLM with a surfaced confidence line in the CLI; fixes skip the add-feature scaffold path; unparseable responses log the truncated raw output and retry with correction)
- [x] **Phase H.5 — Init tooling & model setup** (`vectalon init` detects Expo vs RN-CLI, auto-enables matching ecosystem items from `package.json` dependencies — zustand, gesture-handler, reanimated, … — and offers local Qwen download or remote OpenAI/Anthropic configuration written to `.vectalon/rn-vectalon.json`)
- [x] **Phase H.6 — Ecosystem MCP exposure** (`vectalon serve` reads `.vectalon/ecosystem.json` and exposes each enabled MCP server as a first-class tool in the MCP tool list, so agents auto-discover Metro/Expo MCPs without manual config)
- [x] **Phase H.7 — Resolved-model surfacing** (feature workflow summary and `serve` startup logs print the actual provider + model used, warning when a remote key is missing)
- [x] **Phase H.8 — Ecosystem & toolchain doctor** (`vectalon doctor` verifies every enabled ecosystem item is installed/reachable, plus the native toolchain — Node, JDK, Android SDK/emulator, Xcode/CocoaPods, Metro port — with actionable fix hints and `--json`; `--fix` auto-installs missing items via npm/gem/brew/`npx skills add` and re-runs the checks, reporting `before → after` counts)
- [~] **Phase I — RN-native understanding** (✅ RN knowledge graph — AST scanner + knowledge graph replacing regex sniffing; ✅ New Architecture detection & guardrails — gradle.properties/Podfile/config + version defaults, Fabric-hostile rule flags, TurboModule spec scan; ✅ Metro perf/bundle budgets — I-6: `bundleAnalyzer.ts` Metro `--json` parsing + static budget checks in code review, bundle-size history in the knowledge base with growth warnings, `vectalon bundle` CLI; ✅ Simulator/device control + Maestro E2E — I-5: `deviceControl.ts` boot/screenshot/tap/swipe/deep-link/logs, 6 device MCP tools + `generate_maestro_flow`, `MaestroFlowWriter.ts` YAML from acceptance criteria, verification-phase `maestro test` run (advisory); **impact regression flows** — `harness/impact.ts` maps changed files → affected screens + E2E flow hits (AST-driven, no model calls), `testPhase` writes `.maestro/<slug>-impact.yaml` per affected screen (deep-link/initial-route reachability, screenshots collected for the PR visual diff) with **accessibility variants** for screens covered by a11y criteria, the verification report names screens with no deterministic route, the close phase opens deduped `coverage`-labeled follow-up tasks (PM `findTasks`) and appends the `docs/vectalon/coverage/coverage-gaps.md` dashboard, rendered per-screen by `vectalon coverage [--json] [--limit]`; ⬜ Metro sandbox, react-native-doctor)
- [ ] **Phase J — Autonomous mobile engineering team** (multi-agent squad, self-healing CI, durable sessions, ticket-to-PR)
- [~] **Phase K — Living knowledge brain** (✅ **III-2 automatic artifact derivation from git history** — `GitHistoryDeriver` deterministically derives changelog entries, release notes, and ADR drafts from `git log --oneline` / `--format=%h|%an|%ai|%s` output, plus the `derive_from_git_history` MCP tool persisting `devops` (changelog + release notes) and `architecture` (ADR draft) artifacts — knowledge that writes itself; ⬜ III-3 provenance scoring; ⬜ III-4 team-brain v2)
- [ ] **Phase L — DX magic** (IDE extension, MCP Apps, policy marketplace + PR guardrails, offline-first, preview environments)
- [x] **Phase V-4 — Monorepo workspace support** (workspace-aware scanning — `src/harness/workspace.ts` detects pnpm/Yarn/npm/Turborepo/Lerna roots by walking up from the scanned dir (`pnpm-workspace.yaml`, `turbo.json`, `lerna.json`, or a `workspaces` manifest field), expands workspace globs into member packages, maps internal package names → directories; the Scanner falls back to the workspace root for hoisted `react-native` version / `metro.config` / `tsconfig`; context prompts gain a **Workspace** section with hoisting guidance; `bundleAnalyzer` resolves the hoisted `node_modules` root for side-effects checks and the `react-native` CLI binary; remaining from the original V-4 plan: federated team-brain instances)
- [x] **Phase VI-1 — React 19 / React Compiler guardrails** (`src/utils/reactCompiler.ts` detects the React version and `babel-plugin-react-compiler` from the manifest, babel config, or eslint config; the Scanner records `reactVersion` + `reactCompiler`; guardrails gain 6 rules — render-phase `ref.current` mutation, `useEffect` subscriptions without cleanup, React 19 `use()` outside `<Suspense>`, unstable dependency arrays, `forwardRef` on React 19 (ref-as-prop), redundant manual `useMemo`/`useCallback` under the Compiler; context + implementation prompts explain React 19 semantics and auto-memoization implications)
- [x] **Phase IV-1 — VS Code extension** (a thin IDE layer over the same MCP server — `extension/` connects to `vectalon serve --protocol http` (auto-starting it when needed) and adds command-palette workflows (run a feature workflow, guardrail/review the current file, generate a component, show project context, search the knowledge base), **inline guardrail status** as Problems-panel diagnostics on save/active-file change with a status-bar summary, and a **Knowledge Base sidebar** grouping the artifact store by type with a markdown preview panel; the MCP server gains a `check_guardrails` tool exposing the existing `runGuardrails` surface over HTTP; no new backend — the extension reuses `GET /tools` + `POST /call`)
- [x] **Phase III-1 — Runtime telemetry ingestion** (`src/knowledge/telemetry/` parses Sentry event exports, Firebase Crashlytics reports (JSONL incl. ANR/NDK), performance traces, and analytics event streams into typed `telemetry` artifacts; `vectalon telemetry [dir]` and the `ingest_telemetry` / `analyze_crash` MCP tools ingest with checksum + event-id dedupe; the analyzers go data-driven — `RootCauseAnalyzer.analyzeCrash` classifies native-crash/memory/ANR/null-reference buckets from exception types, messages, and stack-frame locations and enriches the investigation with the crash facts (release, environment, top in-app frames), `IncidentAnalyzer` derives severity/impact/timeline from the crash window and flags slow traces, and `KpiReportAnalyzer.analyzeFromEvents` computes crash counts, crash-free session rate, affected users, and average trace durations from the ingested window)
- [x] **Phase II-2 — Self-healing CI / PR automation** (the git adapter's `LocalGitAdapter.createPullRequest` now opens real PRs — GitHub REST API when `GITHUB_TOKEN` is set, `gh` CLI fallback, owner/repo parsed from `git remote get-url origin`, never a fabricated PR — plus `commentPullRequest` posts the code-review report (findings + self-healing log) onto the PR; the PR phase generates the project's CI workflow before committing (`src/adapters/ciTemplates.ts`: **EAS Workflows** `.eas/workflows/vectalon.yml` for Expo projects, **GitHub Actions** `.github/workflows/vectalon-ci.yml` for bare RN CLI, steps built from the detected scripts + native checks, idempotent — never overwrites) and writes a **What changed & why** PR body from the review summary, heal log, and verification results; `vectalon ci [dir]` generates the same templates on demand)
- [ ] **Phase M — Trust & scale** (sandboxed execution, secrets/supply-chain guardrails, audit trail, monorepo federation)
- [x] **Phase V-5 (M1–M6) — RN coding-tests benchmark** (versioned scenario spec + 43 eval scenarios in `bench/scenarios/`, deterministic baseline runner + 16-check best-practice rubric + scoring/report in `src/bench/`, `vectalon bench` CLI with `--model`/`--suite`/`--live`/`--install`/`--baseline`, human reference solutions with relative-to-human scoring, committed `bench/baseline.json` + CI regression gate on every PR, a nightly scheduled leaderboard workflow that runs the model matrix and commits a timestamped `BENCHMARK_RESULTS.md`, and **PR leaderboard comments**: a `pull_request` workflow renders the committed nightly results into a compact per-model comparison (`vectalon leaderboard --pr-comment`, marker-upserted so it updates in place) on every PR — see [`docs/BENCHMARK_PLAN.md`](BENCHMARK_PLAN.md))
- [ ] **Parked — VS Code Marketplace publish (M12)** — distributing the already-built extension (`vectalon-dev.vectalon`) to the VS Code Marketplace. **Blocked on:** (1) the `VSCE_PAT` repo secret does not exist (only `CORE_REPO_PAT` + `NPM_TOKEN` are set — the vsce step therefore renders an empty token and the publish script's `if (!pat)` guard silently skips the upload), and (2) the `vectalon-dev` publisher is not registered on the Marketplace (publisher + item pages return 404; gallery API query finds 0 extensions). The invocation-path bug is already fixed (`c0436cf` — both `publish.yml` and `vsce-publish.yml` now call `packages/rn/scripts/publish-vsce.js` from its real path). **To unpark:** create the Azure DevOps org + a PAT with scope **Marketplace → Manage**, register the publisher at https://marketplace.visualstudio.com/manage/publishers/ (ID `vectalon-dev` — immutable, must match `extension/package.json`), `gh secret set VSCE_PAT`, and verify with `npx vsce login vectalon-dev`. **⚠️ Global Azure DevOps PATs retire Dec 1, 2026** — plan Entra ID workload-identity publishing (`vsce publish --azure-credential`, vsce ≥ 2.26.1) before then. Parked by owner decision (Aug 2026): releases continue without the extension upload; the vsce step stays `continue-on-error` so a marketplace credential gap never fails an npm release.
