# rn-vectalon

**The adaptive AI harness for React Native — bring project-aware SDLC intelligence to any agent.**

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/rn-vectalon)](https://www.npmjs.com/package/rn-vectalon)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## What is rn-vectalon?

rn-vectalon is an open-source React Native package that embeds an adaptive AI harness directly into your RN CLI application. It scans your project, understands its architecture, and exposes a universal protocol that any AI agent — Claude Code, OpenCode, Codex CLI, Cursor, Windsurf — can connect to for project-aware assistance.

The harness **learns** from your codebase over time. It detects naming conventions, architectural patterns, styling preferences, and routing structures, then tailors its suggestions to match your project's unique style.

```
npx rn-vectalon init    # Scan project, build context
npx rn-vectalon serve   # Start MCP server for agents
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

### SDLC Tools
Built-in modules for common development tasks:
- **Component Generator** — Create components matching project conventions
- **Test Writer** — Generate Jest or Detox tests for any component
- **Debug Analyzer** — Categorize and fix build/runtime errors
- **Lint Fixer** — Auto-fix common lint issues
- **Dependency Advisor** — Suggest updates and migrations

### Pluggable Model Layer
Works with any model:
- **Local**: Bundled lightweight model for offline use
- **OpenAI**: GPT-4o, GPT-4, GPT-3.5
- **Anthropic**: Claude Sonnet 4, Claude 3.5 Haiku
- **Custom**: Any API-compatible endpoint

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
│  │  ┌─────▼──────────────▼─────┐                  │    │
│  │  │     Evolution Engine     │                  │    │
│  │  │  (Project Memory +       │                  │    │
│  │  │   Pattern Learner)       │                  │    │
│  │  └──────────────────────────┘                  │    │
│  └──────────────────────────────────────────────┘    │
│                                                        │
│  ┌──────────────────────────────────────────────┐    │
│  │          Your React Native App                 │    │
│  │  src/  components/  screens/  package.json    │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

### Flow

1. **`rn-vectalon init`** — Scans your project, catalogues components, detects patterns, stores context in `.vectalon/`
2. **`rn-vectalon serve`** — Starts a local server exposing MCP tools: `get_project_context`, `generate_component`, `write_test`, `analyze_error`, `get_learned_patterns`
3. **Agent connects** — Your AI agent (Claude Code, OpenCode, etc.) connects to the MCP server and gets full project awareness
4. **Agent acts** — The agent uses the harness tools to generate code, fix bugs, write tests — all in your project's style
5. **Harness learns** — Every interaction improves the pattern store. The next session is even smarter.

---

## Quick Start

### Prerequisites

- Node.js >= 18
- React Native CLI project (>= 0.72)

### Installation

```bash
npm install rn-vectalon
```

### Initialize

```bash
npx rn-vectalon init
```

This scans your project and creates a `.vectalon/` directory with:
- `snapshot.json` — Full project context (components, structure, config)
- `context.md` — Human-readable project summary for agent prompts
- `memory.json` — Learned patterns and decision history

### Serve

```bash
npx rn-vectalon serve
```

Starts the MCP server. Your agent connects and gets all the tools.

---

## Agent Integration

### Claude Code (Anthropic)

Run Claude Code and connect to rn-vectalon via MCP:

```bash
# Terminal 1: start harness
npx rn-vectalon serve

# Terminal 2: use with Claude Code
claude
```

Claude Code automatically discovers MCP servers running locally. You can also add rn-vectalon as a direct MCP tool in your `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "rn-vectalon": {
      "command": "npx",
      "args": ["rn-vectalon", "serve", "--protocol", "stdio"]
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
      "args": ["rn-vectalon", "serve", "--protocol", "stdio"]
    }
  }
}
```

Then ask: *"Generate a new ProfileCard component following the project's conventions"* or *"What's the architecture of this project?"*

### Codex CLI (OpenAI)

```bash
# Start rn-vectalon with HTTP
npx rn-vectalon serve --protocol http --port 8931

# In another terminal, use Codex CLI with the MCP endpoint
```

### Cursor / Windsurf / Any MCP Agent

```bash
# rn-vectalon automatically detected if running on standard ports
# Or configure manually in your editor's MCP settings
```

---

## Available Tools

Once the server is running, agents can call:

| Tool | Description |
|---|---|
| `get_project_context` | Full project snapshot: structure, components, dependencies |
| `generate_component` | Generate a functional RN component following project conventions |
| `write_test` | Write Jest/Detox tests for a component |
| `analyze_error` | Analyze RN errors with categorized fixes |
| `suggest_dependency_update` | Suggest dependency upgrades against a curated catalog |
| `get_learned_patterns` | View patterns the harness has learned |
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
npx rn-vectalon import docs/prd.md

# Import a whole directory of markdown/JSON
npx rn-vectalon import docs/

# Force a type or title
npx rn-vectalon import docs/prd.md --type product --title "Mobile App PRD"
```

Artifact type is resolved from (in order): `--type` flag → frontmatter `type:`
field → keyword detection in content. Supported types: `business`, `research`,
`product`, `requirements`, `design`, `architecture`, `engineering`, `data`,
`security`, `qa`, `devops`, `operations`, `analytics`.

JSON files may be a single `{ title, type, content }` object or an array of
them (useful for Jira/ticket exports). Identical content is skipped via checksum.

### Role-scoped context

Agents query the brain through MCP tools. For example, ask your agent:
*"What requirements context does the BA need for the onboarding feature?"* and
it will call `get_knowledge_context` with the `ba` role to receive the relevant
PRD, stories, and research artifacts.

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
│   │   │   └── serve.ts   # MCP server startup
│   │   └── index.ts       # CLI runner
│   ├── harness/
│   │   ├── Scanner.ts     # Project & component scanner
│   │   ├── ContextEngine  # Context builder & manager
│   │   └── types.ts
│   ├── knowledge/         # Company Brain: typed, traceable artifact store
│   │   ├── artifactTypes.ts
│   │   ├── ArtifactStore.ts
│   │   ├── Traceability.ts
│   │   └── RoleEngine.ts
│   ├── model/
│   │   ├── ModelRouter.ts # Routes requests to providers
│   │   ├── providers/
│   │   │   ├── LocalProvider.ts
│   │   │   └── RemoteProvider.ts
│   │   └── types.ts
│   ├── protocol/
│   │   ├── MCPServer.ts   # MCP/stdio/HTTP server
│   │   └── types.ts
│   ├── sdlc/
│   │   ├── ComponentGenerator.ts
│   │   ├── TestWriter.ts
│   │   ├── DebugAnalyzer.ts
│   │   └── LintFixer.ts
│   ├── memory/
│   │   ├── PatternLearner.ts  # Pattern detection
│   │   └── ProjectMemory.ts   # Persistent store
│   └── config/
│       └── index.ts
├── bin/
│   └── rn-vectalon.js       # CLI entry
├── package.json
└── README.md
```

---

## Development

```bash
# Clone
git clone https://github.com/bhishaksanyal/rn-vectalon.git
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
npm link rn-vectalon
npx rn-vectalon init
npx rn-vectalon serve
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

- **v0.2** — Local ONNX model for offline component generation
- **v0.3** — VS Code extension with inline suggestions
- **v0.4** — Multi-project pattern sharing & team memory
- **v0.5** — CI/CD integration (auto-fix PRs, write changelogs)
- **v1.0** — Stable protocol, production-ready

---

## Why rn-vectalon?

Existing AI coding tools are **general-purpose** — they don't understand React Native's unique constraints (bridge threading, native modules, platform-specific code, metro bundler quirks, Hermes vs JSC). rn-vectalon fills this gap with an RN-specialized harness that any agent can leverage.

**You keep your favorite agent.** rn-vectalon doesn't replace your AI tooling — it makes it smarter about React Native.

---

## License

MIT © [Bhishak Sanyal](https://github.com/bhishaksanyal)
