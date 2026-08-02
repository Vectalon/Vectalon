# rn-vectalon Enhancement Plan

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
> analytics modules, team brain, semantic retrieval, guardrails, self-healing
> review, web-aware refresh, hosted sync, real embeddings, local model). The
> rows below show where the roadmap goes next; see the
> [Phase I+ roadmap](#phase-i--the-futuristic-roadmap-one-of-a-kind-rn-engineering)
> for the futuristic track.

| SDLC stage | Today | Gap (Phase I+ target) |
|---|---|---|
| 1. Discovery & validation | SWOT, ticket analysis | BRD/charter + opportunity assessment |
| 2. Product management | PRD, stories, acceptance criteria | Roadmap, OKRs, personas, prioritization |
| 3. Business analysis | SRS, use cases, gap analysis, RTM | Data dictionary, live traceability |
| 4. UX/UI design | Wireframes, a11y, design tokens | Design-system *enforcement*, simulator screenshots |
| 5. Solution architecture | ADRs, tradeoffs | HLD/LLD, tech evaluation, upgrade planner (I-6) |
| 6. Engineering | component-gen, analyze-error, lint-fixer, review, refactors | API contracts, RN knowledge graph (I-1), Metro sandbox (I-2) |
| 7. Data engineering | — | Schema design, data dictionary |
| 8. Security | Threat model, policy guardrails | OWASP-aware review, secrets/supply-chain checks (V-2) |
| 9. QA | write-test, test plans, triage, RCA | Test strategy/plan, UAT, device-farm execution |
| 10. DevOps & release | Release notes, CI scripts | Self-healing CI (II-2), release automation |
| 11. Ops & support | Incidents, runbooks | Runtime telemetry ingestion (III-1), auto-remediation |
| 12. Analytics & growth | KPI reports | Funnel analysis, experiment planning |
| Knowledge base | Artifacts, team brain, embeddings, sync, refresh | Provenance scoring (III-3), git-history derivation (III-2) |
| Team / multi-project | TeamStore + sync | Cross-project convention learning (III-4), monorepo federation (V-4) |

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

**I-1. RN Architecture Knowledge Graph (AST-grade).** Extend the code-dependency
graph into a true RN-aware graph that tracks components, hooks, navigation trees
(React Navigation / Expo Router), native modules (TurboModules/JSI), bridge
boundaries, StyleSheet usage, and state stores. When an agent touches a shared
component, the graph tells it *which native bridges serialize on the JS thread*,
*which screens re-render*, and *which podspecs break*. This kills the #1
RN-hallucination source in general-purpose models.

**I-2. Metro-aware execution sandbox + live preview.** Instead of generating code
blind, the harness compiles the generated file through Metro, hot-reloads it into
an isolated simulator / headless RN-web container, and *reads the result* —
console logs, render output, and runtime errors — before presenting the diff.
Agents become self-correcting on JSX/TS errors, not just lint-syntax aware.

**I-3. `react-native-doctor` MCP tool.** A built-in doctor that scans CocoaPods vs
Gradle mismatches, autolinking breakage, RN version vs library version
conflicts, Hermes/JSC flags, and native build failures — the same checks a senior
RN engineer runs by hand — exposed as a tool agents call before finalizing a PR.

**I-4. Simulator control tool (`simulator-control`).** Drive the iOS Simulator /
Android Emulator from MCP: boot, screenshot, tap, swipe, deep-link. Agents
visually verify UI (screenshots attached to PRs), test deep links, and record
screen flows — closing the loop between "code compiles" and "app actually
looks/behaves right."

**I-5. Bundle-size & performance budgets in code review.** Wire the review
phase to flag bundle bloat (new heavy deps), re-render storms, missing
list virtualization, inline styles on hot paths, and synchronous bridge calls on
the JS thread — a performance review that ships with every code review.

**I-6. RN upgrade planner.** A workflow that reads the project's RN version and
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

**II-2. Self-healing CI (auto-fix PRs).** A CI mode that runs the code-review +
verification pipeline on every PR, *writes fixes back to the branch*, re-runs
verification, and leaves a review comment describing what it changed and why —
the workflow engine's existing heal loop, pointed at GitHub Actions.

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

**IV-3. Guardrail policy marketplace + PR guardrails.** Ship curated policy
packs (accessibility, security, performance, architecture) in `vectalon policy`
and enforce guardrails as *PR checks* via the hosted artifact store / CI hook —
policies that travel with the repo.

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
behind one team brain so the org grows without per-project silos.

**V-5. Benchmark suite for RN generation.** Build a public eval harness — "RN
coding tests" — measuring generated code correctness, RN best-practice
adherence, and guardrail pass rate, so the project can *prove* it beats generic
tools and drive regression-aware model/harness tuning.

### Sequencing (why this order)

| Phase | Why now | Effort |
|---|---|---|
| I-3 doctor + I-5 perf review | Small, high-visibility, pure deterministic wins on existing seams | S |
| I-1 RN knowledge graph | Foundation for I-2, II-1, and upgrade planner | L |
| I-2 Metro sandbox | The single most "one-of-a-kind" differentiator | L |
| I-4 simulator control | Unlocks visual verification and previews (IV-5) | M |
| II-2 self-healing CI | Sells the SDK to CI-heavy teams | M |
| II-4 ticket-to-PR | The flagship demo of full autonomy | M |
| III-1 runtime ingestion | Turns the brain from static to live | M |
| IV-1 IDE extension | Distribution & adoption multiplier | M |
| V-1 sandboxing | Prerequisite for any trust-heavy automation | M |
| V-5 benchmark suite | Proof, community, and regression safety | S |

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
- [ ] **Phase I — RN-native understanding** (RN knowledge graph, Metro sandbox, react-native-doctor, simulator control, perf/bundle budgets)
- [ ] **Phase J — Autonomous mobile engineering team** (multi-agent squad, self-healing CI, durable sessions, ticket-to-PR)
- [ ] **Phase K — Living knowledge brain** (runtime telemetry ingestion, auto-derivation from git, provenance scoring, team-brain v2)
- [ ] **Phase L — DX magic** (IDE extension, MCP Apps, policy marketplace + PR guardrails, offline-first, preview environments)
- [ ] **Phase M — Trust & scale** (sandboxed execution, secrets/supply-chain guardrails, audit trail, monorepo federation, RN benchmark suite)
