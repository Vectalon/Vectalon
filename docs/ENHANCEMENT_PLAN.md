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
- Multi-project pattern sharing; git-backed or hosted artifact store
- Cross-project retrieval scoped by project + team

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

## Status tracker

- [x] v0.1.0 release (tests, lint, typecheck, CI-ready scripts)
- [x] **Phase A — Knowledge base** (taxonomy, ArtifactStore, Traceability, RoleEngine, import command, MCP knowledge tools)
- [x] **Phase B — Requirements & BA** (RequirementWriter, StoryWriter, AcceptanceCriteriaWriter, GapAnalyzer, SWOTAnalyzer, SupportTicketAnalyzer; write_prd, write_user_stories, define_acceptance_criteria, analyze_support_tickets, run_gap_analysis; generated artifacts persisted + linkable via parentId)
- [x] **Phase C — QA & engineering depth** (TestPlanWriter, TestCaseWriter, BugTriageAnalyzer, RootCauseAnalyzer, CodeReviewAnalyzer, RefactorSuggester; write_test_plan, triage_bugs, analyze_root_cause, review_code, suggest_refactors; write_test consumes acceptance criteria → Jest cases)
- [x] **Phase D — Architecture, security, UX** (ADRWriter, TradeoffAnalyzer, ThreatModeler, AccessibilityChecker, DesignSystemExtractor, WireframeGenerator; write_adr, analyze_tradeoffs, threat_model, check_accessibility, extract_design_system, generate_wireframe)
- [x] **Phase E — DevOps, ops, analytics** (ReleaseNoteWriter, IncidentAnalyzer, RunbookWriter, KpiReportAnalyzer; write_release_notes, analyze_incident, write_runbook, analyze_kpis)
- [ ] Phase F — Team brain
