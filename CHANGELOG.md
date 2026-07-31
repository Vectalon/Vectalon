# Changelog

All notable changes to rn-vectalon will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
