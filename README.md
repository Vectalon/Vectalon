# rn-vectalon

**The adaptive AI harness for React Native — bring project-aware SDLC intelligence to any agent.**

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@vectalon-dev/rn-vectalon)](https://www.npmjs.com/package/@vectalon-dev/rn-vectalon)
[![CI](https://github.com/Vectalon/rn-vectalon/actions/workflows/ci.yml/badge.svg)](https://github.com/Vectalon/rn-vectalon/actions/workflows/ci.yml)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## What is rn-vectalon?

rn-vectalon is an open-source React Native package that embeds an adaptive AI harness directly into your RN CLI application. It scans your project, understands its architecture, and exposes a universal protocol that any AI agent — Claude Code, OpenCode, Codex CLI, Cursor, Windsurf — can connect to for project-aware assistance.

The harness **learns** from your codebase over time. It detects naming conventions, architectural patterns, styling preferences, and routing structures, then tailors its suggestions to match your project's unique style.

```
npx vectalon init    # Scan project, build context
npx vectalon serve   # Start MCP server for agents
```

---

## Features

### Universal Agent Protocol
Not locked to any single AI agent. rn-vectalon speaks **MCP** (Model Context Protocol) by default, plus stdio, SSE, and HTTP modes. Any agent that supports these protocols gets full project context.

### Project-Aware Intelligence
The harness scans your entire RN app — `package.json`, folder structure, components, imports, metro config, TypeScript setup, navigation patterns. Agents get rich context, not just a file tree.

### Self-Evolving Memory
rn-vectalon learns as your project grows:
- Detects naming conventions (PascalCase vs camelCase components)
- Recognizes architecture patterns (React Navigation, StyleSheet usage, state management)
- Records decisions and their outcomes
- Adapts its suggestions to match your codebase

### Multi-Role SDLC Harness

Beyond the v0.1 core, rn-vectalon ships deterministic SDLC modules covering the
whole lifecycle — **28 tools total**, all callable by any MCP agent:

- **Requirements & BA** — PRDs, user stories, acceptance criteria, gap analysis,
  SWOT, support-ticket theming
- **QA & Engineering** — test plans, deterministic Jest cases from acceptance
  criteria, bug triage, root-cause analysis, code review, refactor suggestions
- **Architecture, Security, UX** — ADRs, tradeoff ranking, STRIDE threat models,
  accessibility checks, design-token extraction, ASCII wireframes
- **DevOps, Ops, Analytics** — release notes, incident analysis, runbooks, KPI
  reports
- **Company Brain** — a typed, versioned, traceable artifact store plus
  role-scoped context and cross-project team retrieval

Plus the v0.1 development tools: **Component Generator**, **Test Writer**,
**Debug Analyzer**, **Lint Fixer**, and **Dependency Advisor**.

Every SDLC tool is **deterministic-first** — it produces useful output with zero
model calls, and can be optionally `enhance`d through the configured model.

### Pluggable Model Layer
Works with any model:
- **Local**: Bundled lightweight model for offline use
- **OpenAI**: GPT-4o, GPT-4, GPT-3.5
- **Anthropic**: Claude Sonnet 4, Claude 3.5 Haiku
- **Custom**: Any API-compatible endpoint

### Model limitations, guardrails, and verification

rn-vectalon is **deterministic-first**. Most tools — the scanner, code review,
refactor suggestions, test writer, accessibility checker, and many SDLC modules
— run without any model and follow curated, RN-specific heuristics.

When a model is used (e.g., for implementation generation), keep these
limitations in mind:

- **No model knows every React Native best practice.** Models have knowledge
cutoffs and may be unaware of the latest React Native release, newly deprecated
APIs, or your organization's private conventions.
- **There are no automatic web lookups.** The local model and the current
adapters do not browse the web, fetch documentation, or update themselves with
new best practices. The only "learning" happens inside your project: the harness
records patterns it observes in your codebase.
- **Guardrails are applied before generated code is written.** The implementation phase runs an exhaustive rule set over every generated file and reports the results in the workflow output. Rules cover: `console.log`, inline styles, hardcoded URLs, secrets, `any`, missing error handling, unused imports, state mutation, missing hook deps, heavy work in render, missing accessibility labels, deprecated APIs, platform-specific code, navigation types, naming conventions, safe-area usage, TODO/FIXME comments, TypeScript return types, remote image assets, list virtualization, mutation in hooks/Reducers, `==`/`!=`, `var`, and default component exports.
  - System prompts that require real, runnable code and forbid TODOs/placeholders
  - Convention detection (TypeScript, navigation, StyleSheet) that shapes generated code
  - A deterministic fallback scaffold when no model is downloaded
  - Real lint/typecheck/test/native-build verification after implementation
  - Code-review tools that flag `console.log`, `any`, empty catches, TODOs, and inline styles
- **Always review generated code.** Run the verification step, inspect the diff,
and run your own test suite before merging. `vectalon` accelerates the SDLC; it
does not replace engineering judgment.

To improve output quality you can:
- Import your own PRDs, ADRs, and conventions into the knowledge base (`vectalon import`)
- Use a more capable remote model provider (OpenAI/Anthropic) for complex generation
- Run with `--dry-run` first to preview what the workflow will do

### Framework-Native
Zero lock-in. rn-vectalon is a standard npm package that integrates with your existing RN CLI workflow. No new build system, no proprietary DSL — just a `serve` command and your agent connects.

---

## How It Works

```
┌──────────────────────────────────────────────────────┐
│                 AI Agent (any)                        │
│  Claude Code / OpenCode / Codex CLI / Cursor         │
│          │                                           │
│          ▼ MCP / stdio / SSE / HTTP                  │
│  ┌──────────────────────────────────────────────┐    │
│  │              rn-vectalon Server                  │    │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────┐  │    │
│  │  │  Context  │  │  Model   │  │   Agent    │  │    │
│  │  │  Engine   │  │  Router  │  │  Protocol  │  │    │
│  │  └─────┬─────┘  └────┬─────┘  └────────────┘  │    │
│  │        │              │                        │    │
│  │  ┌─────▼──────────────▼─────────────────────┐  │    │
│  │  │          Evolution Engine               │  │    │
│  │  │  (Project Memory + Pattern Learner)     │  │    │
│  │  └─────────────────────────────────────────┘  │    │
│  │  ┌─────────────────────────────────────────┐  │    │
│  │  │        SDLC Modules (28 tools)         │  │    │
│  │  │  BA · QA · Architecture · Security ·   │  │    │
│  │  │  UX · DevOps · Ops · Analytics         │  │    │
│  │  └─────────────────────────────────────────┘  │    │
│  │  ┌─────────────────────────────────────────┐  │    │
│  │  │      Company Brain (knowledge base)    │  │    │
│  │  │  ArtifactStore · RoleEngine · TeamStore│  │    │
│  │  │  KnowledgeIndex · embeddings           │  │    │
│  │  └─────────────────────────────────────────┘  │    │
│  └──────────────────────────────────────────────┘    │
│                                                        │
│  ┌──────────────────────────────────────────────┐    │
│  │          Your React Native App                 │    │
│  │  src/  components/  screens/  package.json    │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

### Flow

1. **`vectalon init`** — Scans your project, catalogues components, detects patterns, stores context in `.vectalon/`
2. **`vectalon serve`** — Starts a local server exposing 26 core MCP tools (plus the Company Brain tools when a knowledge base is present)
3. **`vectalon import`** — Feeds the Company Brain: PRDs, Jira exports, postmortems, any SDLC artifact
4. **Agent connects** — Your AI agent (Claude Code, OpenCode, etc.) connects to the MCP server and gets full project awareness
5. **Agent acts** — The agent uses the harness tools to generate code, fix bugs, write tests, produce PRDs/ADRs/test plans — all in your project's style
6. **Harness learns** — Every interaction improves the pattern store and the knowledge base. The next session is even smarter.

---

## Quick Start

### Prerequisites

- Node.js >= 20.12.0
- React Native CLI project (>= 0.72)

### Installation

```bash
npm install --save-dev @vectalon-dev/rn-vectalon
# or
yarn add -D @vectalon-dev/rn-vectalon
```

> `rn-vectalon` is a development-time tool (CLI, project scanner, and MCP server). Nothing it exports is imported by your app bundle, so it belongs in `devDependencies`.

After installing locally, you can use the shorter alias:

```bash
npx vectalon
```

Running `npx vectalon` with no arguments opens an interactive menu so you can pick init, feature, serve, import, or help without memorizing flags.

### Initialize

```bash
npx vectalon init
```

This scans your project and creates a `.vectalon/` directory with:
- `snapshot.json` — Full project context (components, structure, config)
- `context.md` — Human-readable project summary for agent prompts
- `memory.json` — Learned patterns and decision history

### Serve

```bash
npx vectalon serve
```

Starts the MCP server. Your agent connects and gets all the tools.


### Download a local model (optional)

`vectalon` works offline by default using a deterministic stub, but you can
download a real, free-for-commercial-use local model to generate code in the
implementation phase.

```bash
vectalon pull              # default: Qwen2.5-Coder-1.5B-Instruct-GGUF
vectalon models            # list available and downloaded models
```

The default model is **Qwen2.5-Coder-1.5B-Instruct-GGUF** (`Q4_K_M`, ~1.1 GB), licensed under **Apache 2.0**, which is free for commercial use. If no model is
downloaded, the feature workflow falls back to deterministic scaffolds.

### Run a feature workflow

```bash
npx vectalon feature "create a login screen and integrate the auth API"
```

Runs the full SDLC workflow: PRD, design, architecture, implementation,
verification, PR, docs, and board closure.

By default the workflow uses **real local adapters** — it actually runs `test`,
`lint`, `typecheck`, and native build commands detected from your `package.json`
and project structure. Use `--dry-run` to simulate without side effects, and
`--push` to allow the workflow to push the branch and open a PR:

```bash
npx vectalon feature "remove unused imports" --dry-run   # safe preview
npx vectalon feature "remove unused imports" --push      # commit, push, and open PR
npx vectalon feature "remove unused imports" --verbose   # show full phase output
```

---

## Agent Integration

### Claude Code (Anthropic)

Run Claude Code and connect to rn-vectalon via MCP:

```bash
# Terminal 1: start harness
npx vectalon serve

# Terminal 2: use with Claude Code
claude
```

Claude Code automatically discovers MCP servers running locally. You can also add rn-vectalon as a direct MCP tool in your `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "rn-vectalon": {
      "command": "npx",
      "args": ["vectalon", "serve", "--protocol", "stdio"]
    }
  }
}
```

### OpenCode

Add to your `opencode.json`:

```json
{
  "mcpServers": {
    "rn-vectalon": {
      "command": "npx",
      "args": ["vectalon", "serve", "--protocol", "stdio"]
    }
  }
}
```

Then ask: *"Generate a new ProfileCard component following the project's conventions"* or *"What's the architecture of this project?"*

### Codex CLI (OpenAI)

```bash
# Start rn-vectalon with HTTP
npx vectalon serve --protocol http --port 8931

# In another terminal, use Codex CLI with the MCP endpoint
```

### Cursor / Windsurf / Any MCP Agent

```bash
# rn-vectalon automatically detected if running on standard ports
# Or configure manually in your editor's MCP settings
```

---

## Feature Development Workflow

`rn-vectalon` can run an end-to-end SDLC workflow from a single prompt:

```bash
npx vectalon feature "create a login screen and integrate the auth API"
```

This executes 11 phases in sequence, gating each one on the previous:

1. **PRD** — product requirements, goals, acceptance criteria
2. **Scope & impact analysis** — affected areas, new dependencies, risks
3. **Design & UX** — wireframes and motion-design recommendations
4. **Architecture** — ADR and API integration design
5. **Task creation** — issues/tasks in the configured PM tool (Jira, Monday, …)
6. **Implementation** — project-convention-aware code for service, hook, and screen
7. **Verification** — tests, lint, type check, and native build commands detected from `package.json` and RN CLI project structure (iOS build, Android build, pod install, gradle clean/assemble). Commands stream output to the terminal in real time.
8. **Readiness report** — go/no-go against acceptance criteria
9. **Pull request** — branch, commit, push, and open PR
10. **Documentation** — draft README and CHANGELOG updates
11. **Close feature board** — mark tasks as complete

The workflow is deterministic-first, project-aware, and observable. Each phase
produces artifacts and the full state is persisted to
`.vectalon/workflows/feature-development/<id>.json` so you can resume, audit, or
re-run iterations.

### Iterations

After making changes, re-run the same workflow with its saved state to update
phase outputs and readiness:

```bash
# Re-run the entire workflow using a saved state ID
npx vectalon feature "create a login screen and integrate the auth API" --resume <state-id>

# Resume from a specific phase (e.g. after editing implementation)
npx vectalon feature "create a login screen and integrate the auth API" --resume <state-id> --from implementation
```

### Use from an agent

```json
{
  "name": "execute_workflow",
  "arguments": {
    "workflowId": "feature-development",
    "prompt": "create a login screen and integrate the auth API"
  }
}
```

### Configuring external tools

The workflow uses adapter interfaces for project management, Git, test runners,
and simulators. By default **real local adapters** are used: commands such as
`git`, `yarn test`, `yarn lint`, `yarn typecheck`, and `npx react-native run-ios`
are executed in your project directory. Use `dryRun: true` to fall back to the
console adapters (they print what they would do without running anything):

```typescript
import { createAdapters } from '@vectalon-dev/rn-vectalon'

const adapters = createAdapters({
  dryRun: true, // simulate all adapters
  projectManagement: { provider: 'jira', baseUrl: '...', projectKey: '...', email: '...', token: '...' },
  git: { provider: 'local', push: true }, // or provider: 'github', owner: '...', repo: '...', token: '...'
  testRunner: { provider: 'local' },
  simulator: { provider: 'local' },
})
```

See `src/adapters/` for the interfaces and implementations.

---

## Available Tools

Once the server is running, agents can call **33 tools** — 26 always available,
1 workflow orchestrator, 4 more when a knowledge base is present, and 2 more
when a team brain is configured:

#### Core (project-aware dev)

| Tool | Description |
|---|---|
| `get_project_context` | Full project snapshot: structure, components, dependencies |
| `generate_component` | Generate a functional RN component following project conventions |
| `write_test` | Write Jest/Detox tests for a component |
| `analyze_error` | Analyze RN errors with categorized fixes |
| `suggest_dependency_update` | Suggest dependency upgrades against a curated catalog |
| `get_learned_patterns` | View patterns the harness has learned |
| `execute_workflow` | Run a full end-to-end SDLC workflow (e.g. feature-development) |

#### Requirements & BA

| Tool | Description |
|---|---|
| `write_prd` | Write a Product Requirements Document scaffold for a feature (persists as a `product` artifact) |
| `write_user_stories` | Write user stories, one per persona, optionally linked to a parent artifact |
| `define_acceptance_criteria` | Define Given/When/Then acceptance criteria for a user story |
| `analyze_support_tickets` | Group support tickets into themes and recommend next steps |
| `run_gap_analysis` | Compare desired vs current capabilities and report gaps |

#### QA & Engineering

| Tool | Description |
|---|---|
| `write_test_plan` | Write a QA test plan scaffold for a feature |
| `triage_bugs` | Triage bug reports by severity (critical→low) and priority (p0→p3) |
| `analyze_root_cause` | Classify a production issue into a root-cause bucket with investigation steps |
| `review_code` | Deterministic code review: console.log, `any`, empty catches, TODOs, inline styles |
| `suggest_refactors` | Static refactor heuristics: oversized files/functions, magic numbers, `any` |

#### Architecture, Security & UX

| Tool | Description |
|---|---|
| `write_adr` | Write an Architecture Decision Record scaffold |
| `analyze_tradeoffs` | Rank architecture options by scored attributes |
| `threat_model` | Produce a STRIDE threat model for a feature |
| `check_accessibility` | Deterministic a11y checks: unlabelled images, touchable roles, text inputs |
| `extract_design_system` | Extract design tokens (colors, spacing, fonts, radius) from style code |
| `generate_wireframe` | Generate an ASCII wireframe from a section list |

#### DevOps, Ops & Analytics

| Tool | Description |
|---|---|
| `write_release_notes` | Write release notes, auto-categorizing the change list into Added/Fixed/Security/… sections |
| `analyze_incident` | Analyze a production incident: severity, root-cause bucket, timeline, actions |
| `write_runbook` | Write an ops runbook with symptoms, numbered steps, and escalation |
| `analyze_kpis` | Evaluate KPI metrics (JSON array of `{ name, current, previous?, target? }`) with baselines and targets |

#### Team brain (when `.vectalon/team.json` is configured)

| Tool | Description |
|---|---|
| `get_team_context` | Aggregated knowledge context across team projects, scoped by team, project, and role |
| `search_knowledge` | Ranked cross-project search across the team brain, scoped by team, project, and type |

#### Knowledge base (when a store is present)

| Tool | Description |
|---|---|
| `list_artifacts` | List artifacts in the knowledge base |
| `get_artifact` | Get a single knowledge base artifact by id |
| `get_knowledge_context` | Knowledge base context scoped to a role (pm, ba, architect, engineer, qa, devops, support, analyst) |
| `link_artifacts` | Link a parent artifact to a child artifact |

---

## Knowledge Base

The knowledge base ("Company Brain") is a typed, versioned, traceable document
store at `.vectalon/knowledge/artifacts.json`. It holds SDLC artifacts — PRDs,
user stories, ADRs, test plans, incident reports — so agents get role-scoped
context instead of just a file tree.

### Import artifacts

```bash
# Import a single file
npx vectalon import docs/prd.md

# Import a whole directory of markdown/JSON
npx vectalon import docs/

# Force a type or title
npx vectalon import docs/prd.md --type product --title "Mobile App PRD"
```

Artifact type is resolved from (in order): `--type` flag → frontmatter `type:`
field → keyword detection in content. Supported types: `business`, `research`,
`product`, `requirements`, `design`, `architecture`, `engineering`, `data`,
`security`, `qa`, `devops`, `operations`, `analytics`.

JSON files may be a single `{ title, type, content }` object or an array of
them (useful for Jira/ticket exports). Identical content is skipped via checksum.

### Generate artifacts

Beyond importing, the harness **writes** artifacts into the brain through the
Requirements & BA tools. Generated documents are persisted with `source:
"generated"` and can be linked into a traceability chain — e.g. ask your agent to
"write a PRD for camera onboarding", then "write user stories for it, linked to
the PRD". `write_user_stories` and `define_acceptance_criteria` accept a
`parentId` so stories stay traceable to their PRD:

```json
{ "name": "write_prd", "arguments": { "projectName": "Acme", "feature": "Camera Onboarding" } }
{ "name": "write_user_stories", "arguments": { "feature": "Camera Onboarding", "personas": "new user, returning user", "parentId": "<prd-artifact-id>" } }
```

All BA tools are deterministic (no model call required); pass `enhance: true`
to `write_prd` / `write_user_stories` to have the configured model expand the
scaffold into a full document.

The QA & engineering tools are likewise deterministic: `write_test_plan`,
`triage_bugs`, `analyze_root_cause`, `review_code`, and `suggest_refactors`
all produce structured output with no model call. `write_test` consumes
acceptance criteria to emit deterministic Jest cases:

```json
{ "name": "write_test", "arguments": { "target": "PasswordReset.tsx", "acceptanceCriteria": "- Given the user has access, when they reset their password, then the reset succeeds." } }
```

Generated QA artifacts persist as `qa` (test plans, triage, root cause, test
cases) and `engineering` (code review, refactor suggestions) artifacts.

Architecture, security, and UX artifacts persist as `architecture` (ADRs,
tradeoff analyses), `security` (threat models), and `design` (accessibility
checks, design-system extractions, wireframes):

```json
{ "name": "write_adr", "arguments": { "title": "Choose backend", "context": "Need a BaaS", "options": "Firebase, Supabase", "decision": "Supabase" } }
{ "name": "threat_model", "arguments": { "feature": "Login" } }
{ "name": "generate_wireframe", "arguments": { "title": "Login", "sections": "header, input:Email, button:Sign In, footer" } }
```

DevOps, ops, and analytics artifacts persist as `devops` (release notes),
`operations` (incidents, runbooks), and `analytics` (KPI reports):

```json
{ "name": "write_release_notes", "arguments": { "version": "1.4.0", "changes": "Add camera onboarding\nFix login crash" } }
{ "name": "analyze_incident", "arguments": { "title": "Nightly outage", "description": "App is down for all users after deploy" } }
{ "name": "analyze_kpis", "arguments": { "metrics": "[{\"name\":\"Retention\",\"current\":75,\"previous\":60,\"target\":70}]" } }
```

### Role-scoped context

Agents query the brain through MCP tools. For example, ask your agent:
*"What requirements context does the BA need for the onboarding feature?"* and
it will call `get_knowledge_context` with the `ba` role to receive the relevant
PRD, stories, and research artifacts.

### Team brain

When you add a `.vectalon/team.json` manifest, `serve` registers sibling projects
so agents can query across your whole team instead of one repo. The manifest is
git-backed — commit it so every developer serves the same team brain:

```json
{
  "team": "mobile",
  "projects": [
    { "name": "payments", "path": "../payments", "team": "backend" }
  ]
}
```

Paths are resolved relative to the current project; the current project is
registered automatically under its folder name. Any listed project without a
knowledge base is skipped with a warning. Agents then use:

```json
{ "name": "get_team_context", "arguments": { "team": "backend" } }
{ "name": "search_knowledge", "arguments": { "query": "payment", "team": "backend", "limit": 5 } }
```

`search_knowledge` ranks matches across projects (title matches outweigh content
matches), scopes by `team`, `project`, and `type`, and reports the score
breakdown. Retrieval merges lexical and semantic signals: the `serve` command
attaches a deterministic offline embedding provider by default, so results carry
`lexicalScore` and `semanticScore` even with no model configured. Bring your own
embedding API by implementing the `EmbeddingProvider` interface
(`embed(text: string): number[]`) and passing it to `new TeamStore({ embeddingProvider })`.

```json
{ "name": "search_knowledge", "arguments": { "query": "payments are failing", "team": "backend", "limit": 5 } }
```

See `docs/ENHANCEMENT_PLAN.md` for the full roadmap toward a multi-role SDLC harness.

---

## Configuration

### Runtime config

Runtime settings (model provider, API keys, protocol, learning toggles) are stored
in a user-level config file at `~/.config/rn-vectalon/config.json` (override the
location with the `RN_VECTALON_CONFIG_DIR` environment variable):

```json
{
  "modelProvider": "openai",
  "modelConfig": {
    "modelName": "gpt-4o",
    "temperature": 0.3
  },
  "autoScan": true,
  "learningEnabled": true,
  "sdlcModules": [
    "component-gen",
    "test-writer",
    "debug-analyzer",
    "lint-fixer"
  ]
}
```

Set environment variables for API keys:

```bash
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
```

### Project manifest

`rn-vectalon init` writes `.vectalon/rn-vectalon.json` — a project **manifest**
describing when the project was initialized and what it contained:

```json
{
  "version": "0.1.0",
  "projectName": "my-app",
  "rnVersion": "0.72.0",
  "initializedAt": 1700000000000,
  "modelProvider": "local",
  "autoLearn": true
}
```

The manifest records project state; runtime behavior is controlled by the
user-level config above and by CLI flags.

---

## SDLC Modules

### Component Generator
Generates production-ready React Native components that match your project's detected conventions:

```bash
# Via agent
"Generate a ProfileCard component with navigation and styles"
```

### Test Writer
Creates Jest unit tests or Detox E2E tests:

```bash
# Via agent
"Write tests for src/screens/HomeScreen.tsx"
```

### Debug Analyzer
Categorizes errors and provides curated fixes:

| Category | Examples |
|---|---|
| Module Resolution | `Unable to resolve module`, import errors |
| Null Reference | `null is not an object`, `undefined is not a function` |
| Invariant Violation | React Native invariant checks |
| Native Build | CocoaPods, Xcode, Android NDK issues |
| Metro Bundler | Bundle failures, cache issues |

### Lint Fixer
Auto-fix common React Native lint issues:
- Missing `useEffect`/`useCallback` dependencies
- Unused variables
- Console statements
- Hook ordering violations
- Import ordering

---

## Self-Evolution

rn-vectalon's **Evolution Engine** is what makes it adaptive:

### Pattern Detection
The harness automatically detects:
- **Naming conventions** — PascalCase vs camelCase components
- **Architecture** — Navigation library, state management, API layer
- **Styling** — StyleSheet, TailwindRN, Styled Components
- **Testing** — Jest vs Detox, test location conventions

### Memory Store
Every session records:
- Components discovered
- Patterns identified with confidence scores
- Decisions made and their outcomes
- Agent interactions

Over time, the harness's understanding of your project becomes increasingly accurate, making agent interactions more productive with less manual context.

---

## Project Structure

```
rn-vectalon/
├── src/
│   ├── cli/               # CLI entry point and commands
│   │   ├── commands/
│   │   │   ├── init.ts    # Project initialization
│   │   │   ├── import.ts  # Knowledge base artifact import
│   │   │   └── serve.ts   # MCP server startup (+ .vectalon/team.json)
│   │   └── index.ts       # CLI runner
│   ├── harness/
│   │   ├── Scanner.ts     # Project & component scanner
│   │   ├── ContextEngine  # Context builder & manager
│   │   └── types.ts
│   ├── knowledge/         # Company Brain
│   │   ├── artifactTypes.ts   # 13-type taxonomy + role→type map
│   │   ├── ArtifactStore.ts   # Versioned, traceable artifact store
│   │   ├── Traceability.ts    # RTM graph traversal over links
│   │   ├── RoleEngine.ts      # Role-scoped context assembly
│   │   ├── TeamStore.ts       # Multi-project registry (team brain)
│   │   ├── KnowledgeIndex.ts  # TF + semantic retrieval
│   │   └── embeddings.ts      # Provider seam + cosine similarity
│   ├── sdlc/             # Deterministic-first SDLC modules (27)
│   │   ├── RequirementWriter.ts, StoryWriter.ts, AcceptanceCriteriaWriter.ts,
│   │   │   GapAnalyzer.ts, SWOTAnalyzer.ts, SupportTicketAnalyzer.ts   # BA
│   │   ├── TestPlanWriter.ts, TestCaseWriter.ts, BugTriageAnalyzer.ts,
│   │   │   RootCauseAnalyzer.ts, CodeReviewAnalyzer.ts,
│   │   │   RefactorSuggester.ts                                       # QA/Eng
│   │   ├── ADRWriter.ts, TradeoffAnalyzer.ts, ThreatModeler.ts,
│   │   │   AccessibilityChecker.ts, DesignSystemExtractor.ts,
│   │   │   WireframeGenerator.ts                                      # Arch/Sec/UX
│   │   ├── ReleaseNoteWriter.ts, IncidentAnalyzer.ts, RunbookWriter.ts,
│   │   │   KpiReportAnalyzer.ts                                       # DevOps/Ops
│   │   └── ComponentGenerator.ts, TestWriter.ts, DebugAnalyzer.ts,
│   │       LintFixer.ts                                               # v0.1 core
│   ├── model/
│   │   ├── ModelRouter.ts # Routes requests to providers
│   │   ├── providers/     # LocalProvider, RemoteProvider
│   │   └── types.ts
│   ├── protocol/
│   │   ├── MCPServer.ts   # MCP/stdio/HTTP server (32 tools)
│   │   └── types.ts
│   ├── memory/
│   │   ├── PatternLearner.ts  # Pattern detection
│   │   └── ProjectMemory.ts   # Persistent store
│   └── config/
│       └── index.ts
├── __tests__/            # 264 tests across 49 suites
├── bin/
│   └── rn-vectalon.js       # CLI entry
├── docs/
│   └── ENHANCEMENT_PLAN.md  # Phase roadmap (A–G delivered)
├── package.json
└── README.md
```

---

## Development

```bash
# Clone
git clone https://github.com/Vectalon/rn-vectalon.git
cd rn-vectalon

# Install
npm install

# Build
npm run build

# Watch mode
npm run dev

# Test
npm test

# Lint + typecheck
npm run lint
npm run typecheck
```

### Testing with a local RN project

```bash
# In rn-vectalon package directory
npm link

# In your RN project
npm link @vectalon-dev/rn-vectalon
npx vectalon init
npx vectalon serve
```

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Areas we'd love help with:
- **Model providers** — Add support for more LLM providers
- **Protocol adapters** — More agent protocol implementations
- **SDLC modules** — New tools for the development lifecycle
- **Pattern detection** — Better learning from project codebases
- **Bundled model** — A lightweight ONNX/CoreML model for truly offline use
- **IDE extensions** — VS Code, JetBrains plugins

---

## Roadmap

**Delivered** (see `docs/ENHANCEMENT_PLAN.md` for details):

- ✅ **Phase A — Knowledge base** — typed artifact store, traceability, role engine, `import` command
- ✅ **Phase B — Requirements & BA** — PRD, stories, acceptance criteria, gap/SWOT/ticket tools
- ✅ **Phase C — QA & engineering depth** — test plans, triage, root cause, code review, refactors
- ✅ **Phase D — Architecture, security, UX** — ADRs, tradeoffs, threat models, a11y, design tokens, wireframes
- ✅ **Phase E — DevOps, ops, analytics** — release notes, incidents, runbooks, KPI reports
- ✅ **Phase F — Team brain** — multi-project registry, `get_team_context`, `search_knowledge`
- ✅ **Phase G — Model-backed retrieval** — `KnowledgeIndex`, embedding provider seam, semantic scores

**Next up:**

- **Guardrails & policy engine** — enforce project-specific rules (no hardcoded URLs,
  required error handling, navigation patterns) before any generated code is written
- **Web-aware knowledge refresh** — always-on periodic retrieval of latest React Native docs,
  library changelogs, and community best practices; updates the memory graph, best-practices
  knowledge base, and manages improvement suggestions for each client project
- **Hosted artifact store** — sync the team brain to a remote (git remote or hosted service)
- **Real embedding APIs** — OpenAI/Anthropic embeddings through the `EmbeddingProvider` seam
- **CI/CD integration** — auto-fix PRs, draft release notes in CI
- **VS Code extension** — inline suggestions against the harness
- **v1.0** — Stable protocol, production-ready

---

## Why rn-vectalon?

Existing AI coding tools are **general-purpose** — they don't understand React Native's unique constraints (bridge threading, native modules, platform-specific code, metro bundler quirks, Hermes vs JSC). rn-vectalon fills this gap with an RN-specialized harness that any agent can leverage.

**You keep your favorite agent.** rn-vectalon doesn't replace your AI tooling — it makes it smarter about React Native.

---

## License

MIT © [Vectalon](https://github.com/Vectalon)
