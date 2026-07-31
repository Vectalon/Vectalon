# rn-vectalon Enhancement Plan

> From "Project Harness" to "Company Brain" — an adaptive AI that acts as Product
> Manager, Business Analyst, Architect, Senior Engineer, QA, DevOps, Support, and
> Analyst across the full SDLC.

## Vision

Today rn-vectalon is a **project-aware** harness: 4 SDLC modules + 6 MCP tools +
per-project pattern memory. The target is an **organization-aware** harness that
plays every engineering-org role against a persistent **Company Brain** — a typed,
versioned, traceable knowledge base that AI consults (and writes to) at every SDLC
stage.

The highest-leverage gap is not "more tools" — it is **the knowledge layer**.
Most SDLC value comes from AI having context (docs, tickets, analytics, incidents)
and traceability (requirements → stories → code → tests → release). Infrastructure
therefore leads; stage capabilities layer on top.

## Current state vs target

| SDLC stage | Today | Gap |
|---|---|---|
| 1. Discovery & validation | — | BRD/charter/ticket analysis, SWOT, opportunity assessment |
| 2. Product management | — | PRD, roadmap, OKRs, personas, prioritization |
| 3. Business analysis | — | SRS/FRS, user stories, use cases, acceptance criteria, RTM |
| 4. UX/UI design | — | Design briefs, wireframes, a11y checks, design-system extraction |
| 5. Solution architecture | — | ADRs, HLD/LLD, tradeoff analysis, tech evaluation |
| 6. Engineering | component-gen, analyze-error, lint-fixer | Code review, refactor suggestions, API contracts |
| 7. Data engineering | — | Schema design, data dictionary |
| 8. Security | — | Threat model, OWASP-aware review |
| 9. QA | write-test, debug-analyzer | Test strategy/plan, UAT, bug triage, RCA |
| 10. DevOps & release | — | Release notes, changelog, rollback plan, CI/CD |
| 11. Ops & support | — | Incident/postmortem, runbook generation |
| 12. Analytics & growth | — | KPI/funnel analysis, experiment planning |
| Knowledge base | `memory.json` (naming/style/route patterns) | Document ingestion, retrieval, provenance, traceability |
| Team / multi-project | — | v0.4 roadmap item |

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

- [ ] Model store + download command
- [ ] node-llama-cpp dynamic integration
- [ ] Qwen chat template support
- [ ] Fallback to deterministic stub
- [ ] `vectalon models` / `vectalon chat` commands
- [ ] Tests with stub (no model download required)
- [ ] Documentation and license attribution

## Status tracker

- [x] v0.1.0 release (tests, lint, typecheck, CI-ready scripts)
- [x] **Phase A — Knowledge base** (taxonomy, ArtifactStore, Traceability, RoleEngine, import command, MCP knowledge tools)
- [x] **Phase B — Requirements & BA** (RequirementWriter, StoryWriter, AcceptanceCriteriaWriter, GapAnalyzer, SWOTAnalyzer, SupportTicketAnalyzer; write_prd, write_user_stories, define_acceptance_criteria, analyze_support_tickets, run_gap_analysis; generated artifacts persisted + linkable via parentId)
- [x] **Phase C — QA & engineering depth** (TestPlanWriter, TestCaseWriter, BugTriageAnalyzer, RootCauseAnalyzer, CodeReviewAnalyzer, RefactorSuggester; write_test_plan, triage_bugs, analyze_root_cause, review_code, suggest_refactors; write_test consumes acceptance criteria → Jest cases)
- [x] **Phase D — Architecture, security, UX** (ADRWriter, TradeoffAnalyzer, ThreatModeler, AccessibilityChecker, DesignSystemExtractor, WireframeGenerator; write_adr, analyze_tradeoffs, threat_model, check_accessibility, extract_design_system, generate_wireframe)
- [x] **Phase E — DevOps, ops, analytics** (ReleaseNoteWriter, IncidentAnalyzer, RunbookWriter, KpiReportAnalyzer; write_release_notes, analyze_incident, write_runbook, analyze_kpis)
- [x] **Phase F — Team brain** (TeamStore multi-project registry; get_team_context + search_knowledge scoped by team/project/type; .vectalon/team.json config)
- [x] **Phase G — Model-backed retrieval** (KnowledgeIndex with TF lexical + semantic cosine merge; embeddings provider seam + deterministic HashEmbeddingProvider; search_knowledge surfaces lexical/semantic scores)
- [ ] **Phase H — Local model** (Qwen2.5-Coder + node-llama-cpp, free for commercial use, deterministic fallback)
