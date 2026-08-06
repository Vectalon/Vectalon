# Contributing to rn-vectalon

## Development

```bash
npm install
npm run build
npm test
npm run lint
npm run typecheck
npm run test:coverage   # coverage threshold gate (statements/branches/functions/lines)
```

The full suite runs 1,000+ tests across ~117 suites. Commit-ready changes must
keep typecheck, lint, and the coverage gate green.

## Architecture overview

rn-vectalon is a project-aware AI harness for React Native: it scans an app,
builds a knowledge graph, and exposes SDLC tools over MCP to any agent. The
source layout under `src/`:

| Directory | Responsibility |
|---|---|
| `harness/` | Project scanning — `AstScanner` (Babel AST) + `CodeGraph` replace the old regex scanner; `ContextEngine` builds agent context prompts; `workspace.ts` handles monorepo/workspace roots |
| `protocol/` | MCP/stdio/SSE/HTTP server (`MCPServer.ts` is orchestration only) + per-domain **tool registries** in `protocol/tools/` (Core, SDLC, Knowledge, Ecosystem) declared with the `@mcpTool` decorator |
| `workflows/` | The 13-phase feature-development workflow engine (`WorkflowEngine`, phase modules under `workflows/phases/`) |
| `sdlc/` | Deterministic SDLC modules — PRD, stories, acceptance criteria, test plans/cases, code review, ADRs, threat models, a11y, release notes, incidents, runbooks, KPIs |
| `knowledge/` | The "Company Brain" — `ArtifactStore`, `TeamStore`, `KnowledgeIndex`, embeddings, telemetry ingestion, refresh |
| `guardrails/` | Rule engine + `PolicyEngine` (project-specific policy from `.vectalon/policy.json`) run over generated code |
| `model/` | `ModelRouter` + providers (local Qwen via node-llama-cpp, OpenAI, Anthropic) |
| `adapters/` | PM (Jira/console), git (`LocalGitAdapter` with real PR automation), test runner, simulator/device control, CI templates |
| `cli/` | Command-line entry points and interactive menu |
| `bench/` | The RN coding-tests benchmark — versioned scenarios, 16-check rubric, scoring, CI regression gate |

The README's [Project Structure](README.md#project-structure) section contains
a fuller annotated tree.

### How tools are registered

Tools live in per-domain registries under `src/protocol/tools/`. Each tool is a
class method decorated with `@mcpTool(name, description, inputSchema?)`; the
server derives both the handler map and the discovery list from the decorator
metadata, so **adding a tool never touches `MCPServer.ts`**:

```typescript
// src/protocol/tools/SdlcTools.ts
import { ToolRegistry } from './base'
import { mcpTool } from './decorators'

export class SdlcTools extends ToolRegistry {
  @mcpTool('write_prd', 'Write a Product Requirements Document scaffold', {
    type: 'object',
    properties: { feature: { type: 'string' } },
    required: ['feature'],
  })
  async writePrd(args: Record<string, unknown>): Promise<string> {
    const artifact = this.persistArtifact('product', `PRD: ${args.feature}`, '...')
    return artifact ? `PRD saved as artifact ${artifact.id}` : 'PRD scaffold:'
  }
}
```

Tools that need a service only sometimes present can be gated with a fourth
argument: `@mcpTool(..., 'artifactStore')` or `@mcpTool(..., 'teamStore')` — the
server registers and advertises them only when the matching service is on the
context. The registries share helpers from `protocol/tools/base.ts`
(`persistArtifact`, `maybeEnhance`) and `protocol/tools/context.ts`
(`ToolContext`: engine, model router, stores, server bridges).

### Where decisions are recorded

- **`docs/ENHANCEMENT_PLAN.md`** — the master roadmap (phases, sequencing
  rationale, and a status tracker marking each phase delivered/planned). When
  you ship a roadmap item, update the status tracker and the "Delivered so far"
  summary in that file.
- **`docs/BENCHMARK_PLAN.md`** — the benchmark scenario spec, rubric axes, and
  scoring methodology.
- **`docs/CLI_REFERENCE.md`** — every CLI command, option, and exit code.
- **Architecture Decision Records** — created in-project by the `write_adr`
  MCP tool / SDLC module (persisted as `architecture` artifacts in the
  knowledge base). For repo-level architecture choices, prefer a short
  decision note in `docs/ENHANCEMENT_PLAN.md` or the relevant phase section
  over a one-off doc that can drift from code.

## Pull Request Process

1. Fork the repo and create your branch from `main`
2. Run `npm run typecheck` to ensure types are correct
3. Run `npm run lint` to ensure style rules pass
4. Run `npm test` to ensure tests pass (and `npm run test:coverage` if you
   touched `src/` — the threshold gate is part of CI)
5. Update README and CHANGELOG if needed — keep counts (MCP tools, tests,
   scenarios) in sync with code; the README states the real, measured numbers
6. Open a PR with a clear title and description

## Code Style

- TypeScript strict mode
- No semicolons
- Single quotes
- Functional patterns preferred
- Async/await over raw promises

## Testing

Tests live in `__tests__/` and mirror the `src/` structure. Jest is configured
in `jest.config.js` with `ts-jest`. Filesystem-touching code should be tested
against temp directories (see `__tests__/helpers/tmp.ts`), and config tests must
point `RN_VECTALON_CONFIG_DIR` at a temp directory so they never touch real
user config.

## Error handling

Never swallow errors. All catch blocks log contextually through the helpers in
`src/utils/safe.ts` (`safe` / `safeAsync` for fallible calls, `reportError(err,
'<context>')` in catch blocks, `bestEffort` for probes). Probe-style misses log
at debug (visible with `VECTALON_DEBUG=1`); genuinely exceptional failures
(model calls, builds, disk writes) log at `warn`.

## Adding a Model Provider

Create a new file in `src/model/providers/` that implements the
`generate(request)` method and register it in `ModelRouter.ts`.

## Adding an SDLC Module

Create in `src/sdlc/` and export from `src/sdlc/index.ts`. Register your tool
in the matching registry under `src/protocol/tools/` with the `@mcpTool`
decorator (see [How tools are registered](#how-tools-are-registered)) — never
in `MCPServer.ts` directly.
