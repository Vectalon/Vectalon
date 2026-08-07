# @vectalon-dev/rn

**The adaptive AI harness for React Native.**

Project-aware SDLC intelligence for any agent — CLI, MCP server, VS Code extension, benchmark suite, and fine-tuning pipeline in one package.

[Website](https://vectalon.in) · [Docs](https://vectalon.in/docs) · [Pricing](https://vectalon.in/pricing)

---

## Installation

```bash
npm install --save-dev @vectalon-dev/rn
# or
yarn add -D @vectalon-dev/rn
# or
pnpm add -D @vectalon-dev/rn
```

Node.js `>=20.12.0` required.

---

## Quick Start

```bash
# 1. Initialize your project
npx vectalon init

# 2. Start the MCP server for agents
npx vectalon serve

# 3. Run the interactive menu (no arguments)
npx vectalon
```

---

## CLI Commands

Run `npx vectalon <command> --help` for detailed options.

| Command | Description | Key Options |
|---------|-------------|-------------|
| `init [dir]` | Initialize `.vectalon/` workspace, detect flavor, set model provider | `--model <provider>` |
| `serve` | Start the MCP server (MCP/stdio/SSE/HTTP) | `-p <port>`, `--protocol <type>`, `--model <provider>` |
| `feature [prompt]` | Full SDLC workflow: PRD → design → architecture → implementation → tests → code-review → PR → docs | `--workflow`, `--resume`, `--from`, `--ticket <key>`, `--push`, `--device`, `--heal-interactive`, `--dry-run`, `--model <provider>` |
| `upgrade [dir]` | React Native / Expo upgrade copilot (impact, codemods, verification) | `--to <version>`, `--dry-run`, `--apply`, `--force` |
| `doctor [dir]` | Ecosystem + toolchain + leaderboard + model-access diagnostics | `--json`, `--fix` |
| `bundle [dir]` | Metro bundle analysis and performance budgets | `--platform <ios\|android>`, `--static` |
| `ci [dir]` | Self-healing CI workflow generator (EAS / GitHub Actions) | `--dry-run` |
| `release [dir]` | Autonomous release pipeline: bump, changelog, E2E submit, crash monitor | `--version`, `--changelog`, `--submit`, `--monitor`, `--baseline`, `--hours`, `--json` |
| `sync [dir]` | Sync team brain to a hosted git remote | `--push`, `--pull`, `--init`, `--remote <url>`, `--branch`, `--force` |
| `telemetry [dir]` | Ingest Sentry/Crashlytics/traces/analytics and analyze | `--path <dir>`, `--no-analyze` |
| `daemon` | Live Metro/Hermes companion daemon | `-p <port>`, `--metro-port`, `--stop`, `--status`, `--once`, `--wire-metro`, `--no-device-probe` |
| `impact [dir]` | Cross-package blast radius of changed files (monorepo) | `--changed <files>`, `--pr <number>`, `--push`, `--json`, `--dry-run` |
| `bench` | RN coding-test benchmark (deterministic baseline or real-model) | `--model <provider>`, `--suite <id>`, `--live`, `--install`, `--json`, `-o <path>`, `--baseline <file>`, `--tolerance <n>` |
| `leaderboard [dir]` | Merge benchmark results into `BENCHMARK_RESULTS.md` | `--out <path>`, `--json`, `--timestamp`, `--pr-comment` |
| `train [dir]` | Curate fine-tuning dataset from benchmark references + LoRA plan | `--build`, `--plan`, `--out <dir>`, `--base <model>`, `--scenarios <dir>`, `--references <dir>`, `--json` |
| `ecosystem [dir]` | Browse/enable MCP servers, skills, tools, hooks | `--category <mcp\|skill\|tool\|hook>`, `--flavor <expo\|rn-cli>`, `--enable <id>`, `--disable <id>`, `--export`, `--json` |
| `import <target>` | Import SDLC artifacts (markdown/JSON) into knowledge base | `--type <type>`, `--title <title>` |
| `refresh [dir]` | Refresh knowledge from web sources + improvement suggestions | `--force` |
| `auth` | Manage license/trial, activate keys, GitHub OAuth | `--license <key>`, `--github`, `--status`, `--logout` |
| `policy [dir]` | Manage project-specific guardrail policy | `--init`, `--check <file>` |
| `pull [preset]` | Download local model preset (default Qwen2.5-Coder-1.5b) | `[preset-id]` |
| `models` | List available and downloaded local models | — |

### Global flags

| Flag | Description |
|------|-------------|
| `--dev` | **Dev mode** — bypass all tier/license checks. All features unlock. |
| `-h, --help` | Display help for command |
| `-V, --version` | Output the version number |

---

## Interactive Mode

Run `npx vectalon` with no arguments (Node `>=20.12`, TTY required) to launch an interactive menu powered by `@clack/prompts`:

```
? What would you like to do?
  ○ Initialize a project
  ○ Run feature workflow
  ○ Refresh knowledge
  ○ Analyze bundle
  ○ Live Metro daemon
  ○ Ingest telemetry
  ○ Analyze impact
  ○ Generate CI workflow
  ○ Release pipeline
  ○ Fine-tune dataset
  ○ Manage ecosystem
  ○ Run doctor
  ○ Run benchmark
  ○ Update leaderboard
  ○ Sync team brain
  ○ Manage policy
  ○ Start MCP server
  ○ Import artifacts
  ○ Download local model
  ○ List models
```

---

## Model Providers

| Provider | Type | Details |
|----------|------|---------|
| **local** | GGUF (node-llama-cpp) | Qwen2.5-Coder presets. Fully offline. Skills inlined into system prompt. |
| **wasm** | ONNX / WASM (@huggingface/transformers) | Zero-config quantized model. Downloads on first use. No API key, no native build. |
| **openai** | Remote | Chat Completions API (default `gpt-4o`). |
| **anthropic** | Remote | Messages API (default `claude-sonnet-4-20250514`). |

Set default provider during `vectalon init` or override per-command with `--model <provider>`.

---

## Guardrails

35+ built-in rules enforced on every code generation and file save:

**Code Quality**: `no-console-log`, `no-inline-styles`, `no-hardcoded-urls`, `no-secrets-in-code`, `no-any-type`, `proper-error-handling`, `no-unused-imports`, `no-direct-state-mutation`, `proper-hook-deps`, `no-heavy-work-in-render`, `use-keyboard-avoiding-view`, `accessibility-labels`, `no-deprecated-apis`, `platform-aware-code`, `proper-navigation-types`, `consistent-naming`, `use-safe-area`, `no-todos-in-code`, `typescript-strict`, `proper-image-assets`, `memoize-expensive-components`, `no-mutation-in-hooks`, `use-strict-equality`, `no-var-declarations`, `proper-export-style`

**New Architecture**: `no-set-native-props`, `no-sync-native-module-calls`, `missing-turbomodule-spec`

**React 19**: `no-ref-mutation-in-render`, `use-effect-cleanup`, `use-outside-suspense`, `unstable-dependency-array`, `no-forward-ref`

**React Compiler**: `compiler-auto-memoization`

Project-specific overrides via `.vectalon/policy.json`.

---

## SDLC Analyzers & Writers

30+ modules covering the full software lifecycle:

| Module | Purpose |
|--------|---------|
| `AcceptanceCriteriaWriter` | Generate acceptance criteria from requirements |
| `AccessibilityChecker` | Check accessibility labels, roles, iOS keyboard avoidance |
| `ADRWriter` | Architecture Decision Record writer |
| `BugTriageAnalyzer` | Triage severity/priority classifier |
| `CodeReviewAnalyzer` | Static code-review finding generator |
| `ComponentGenerator` | React Native component code generator |
| `CrashMonitor` | Post-release crash-rate spike detection |
| `DebugAnalyzer` | Debug strategy and breakpoint recommendations |
| `DesignComplianceChecker` | Enforce design-system token compliance |
| `DesignSystemExtractor` | Extract design tokens and system definitions |
| `FigmaComponentGenerator` | Generate components from Figma specs |
| `GapAnalyzer` | SDLC gap analysis |
| `IncidentAnalyzer` | Incident severity, impact, and cause-bucket analysis |
| `KpiReportAnalyzer` | KPI dashboards and telemetry-derived metrics |
| `LintFixer` | Automatic lint error remediation |
| `LLMCodeReviewer` | LLM-powered code review with self-healing fix loop |
| `MaestroFlowWriter` | YAML E2E test-flow generation for Maestro |
| `NativeModuleGenerator` | TurboModule / native component scaffolding (iOS/Android/TS) |
| `RefactorSuggester` | Refactoring recommendations with risk/effort scoring |
| `ReleaseNoteWriter` | Auto-generated release notes from git history |
| `ReleasePlanner` | Version-bump detection and changelog planning |
| `RequirementWriter` | PRD / requirements document generation |
| `RootCauseAnalyzer` | Crash-root-cause analysis from stack traces |
| `RunbookWriter` | Operational runbook / SOP generation |
| `StoryWriter` | User-story and story-card generation |
| `SupportTicketAnalyzer` | Support ticket theme and resolution-path analysis |
| `SWOTAnalyzer` | Strategic SWOT analysis generator |
| `TestCaseWriter` | Detailed test-case generation from acceptance criteria |
| `TestPlanWriter` | Test strategy and plan documents |
| `TestWriter` | Unit/integration test code generation |
| `ThreatModeler` | Security threat-modeling output |
| `TradeoffAnalyzer` | Engineering trade-off ranking and decision support |
| `WireframeGenerator` | Low-fidelity wireframe section generation |

---

## MCP Server & Tools

`vectalon serve` exposes 40+ project-aware MCP tools across four categories:

- **CoreTools** — project scanning, context building, file reading, AST analysis
- **EcosystemTools** — catalog browsing, skill loading, ecosystem doctor
- **KnowledgeTools** — artifact search, import, traceability, team brain queries
- **SdlcTools** — invoke any SDLC analyzer/writer/generator on demand

Protocols: `mcp` (default), `stdio`, `sse`, `http`.

---

## VS Code Extension

The `vectalon` VS Code extension (in `extension/`) provides:

- **Auto-start MCP server** on activation (configurable)
- **Knowledge Base tree view** in the sidebar
- **Guardrail checks on save** — surfaced in the Problems panel
- **7 command-palette workflows**:
  - Run Feature Workflow
  - Review Code (current file)
  - Check Guardrails (current file)
  - Generate Component
  - Show Project Context
  - Search Knowledge Base
  - Refresh Knowledge View
- **Webview preview** for workflow results and code reviews

Install from the VS Code marketplace (search "Vectalon").

---

## Benchmark Suite

11 scenario-based coding tests covering:

- `core-ui` — Login screen, settings panel, dashboard
- `data-flow` — API integration, state management
- `forms-security` — Form validation, secure input
- `navigation` — Tab navigator, deep linking
- `a11y` — Accessibility compliance
- `perf` — List virtualization, image optimization
- `refactor` — Legacy code modernization

Run deterministically (offline scaffolding) or with real models for leaderboard scoring. CI regression gate via `--baseline`.

---

## Ecosystem Catalog

30+ curated items for React Native / Expo projects:

**MCP Servers**: metro-mcp, expo-mcp, react-native-mcp, react-native-guide-mcp, react-native-upgrader-mcp

**Skills**: expo-router, expo-ui, expo-tailwind-setup, expo-data-fetching, expo-dev-client, expo-dom, expo-upgrade, callstack-agent-skills, react-native-expert, android-e2e-testing

**Tools**: Reactotron, Flipper, RN DevTools, Zustand, MMKV, SecureStore, Reanimated, Gesture Handler, EAS CLI, Fastlane, Repomix, rn-diff-purge, Maestro, Detox, FlashList, expo-doctor

**Hooks**: Husky, lint-staged, Lefthook

Enable items with `vectalon ecosystem --enable <id>`.

---

## Knowledge Base

- **ArtifactStore** — SQLite-backed with vector search (`cosineSimilarity`)
- **TeamStore** — Multi-project team brain with semantic search
- **Traceability** — Link artifacts to code, tests, and PRs
- **Refresh** — Pull best practices and dependency suggestions from web sources
- **Git history derivation** — derive changelog entries, release notes, and ADR drafts from `git log` automatically (MCP `derive_from_git_history` tool) — knowledge that writes itself
- **Sync** — Git-based push/pull to a hosted remote (`.vectalon/sync.json`)
- **Telemetry** — Ingest Sentry, Crashlytics, performance traces, analytics events

---

## Live Metro Daemon

`vectalon daemon` continuously watches:

- Metro bundle size and build errors
- Hermes JS-thread health
- Bundle deltas (what changed, impact)
- Auto-generates reporter output for CI

---

## Project Structure

```
packages/rn/
├── bin/
│   └── rn-vectalon.js          # CLI entry point
├── src/
│   ├── adapters/               # External tool adapters (git, PM, test runner, simulator, design)
│   ├── bench/                  # Benchmark harness (scoring, runner, leaderboard, baseline)
│   ├── cli/
│   │   ├── commands/           # 24 CLI command files
│   │   ├── index.ts            # CLI entry + interactive mode
│   │   └── logger.ts           # Output abstraction
│   ├── config/                 # Global configuration
│   ├── daemon/                 # Metro/Hermes live companion
│   ├── ecosystem/              # Catalog, config, skills, doctor
│   ├── guardrails/             # 35+ rules, engine, policy system
│   ├── harness/                # Scanner, AST, knowledge graph, impact
│   ├── index.ts                # Package main export
│   ├── knowledge/              # Stores, embeddings, telemetry, sync, refresh
│   ├── memory/                 # Pattern learning, project memory
│   ├── model/                  # Routing, local/WASM/remote inference
│   ├── protocol/               # MCP server, sub-MCP clients, tools
│   ├── sdlc/                   # 30 SDLC analyzers/writers/generators
│   ├── training/               # Fine-tuning dataset builder, LoRA plan
│   ├── utils/                  # Bundle analysis, Figma, diff, native scan, visual diff
│   └── workflows/              # Feature-development workflow engine + 17 phases
├── extension/                  # VS Code extension
│   └── src/
│       ├── extension.ts        # Extension lifecycle
│       ├── commands.ts         # 9 command-palette entries
│       ├── client.ts           # MCP HTTP client
│       ├── serverManager.ts    # Spawn vectalon serve
│       ├── guardrails.ts       # On-save guardrail runner
│       ├── knowledgeTree.ts    # Sidebar tree view
│       └── webview.ts          # Results preview panel
├── bench/
│   ├── baseline.json           # Deterministic CI regression baseline
│   ├── scenarios/              # 11+ scenario JSON files
│   └── references/             # Human reference solutions (M6)
└── docs/
    └── vectalon/               # Feature-development generated docs
```

---

## Tiers

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | Project scanning, 40+ MCP tools, component generation, test writing, ecosystem doctor, benchmark suite |
| **Pro** | $19/mo | + Upgrade Copilot, Self-healing CI, Bundle Budgets, Advanced Guardrails (New Architecture, React Compiler) |
| **Team** | $99/seat/mo | + Team Brain, Cloud Sync, Custom Models (Azure/Ollama/vLLM), Priority Inference |

Start a 14-day free trial: `npx vectalon auth --github`

---

## Dev Mode (Internal Only)

> ⚠️ **For Vectalon contributors and maintainers only.** Not intended for end users.

Bypasses all tier and license checks so the team can test every feature during development:

```bash
# CLI flag
npx vectalon --dev doctor
npx vectalon --dev sync --init --remote <url>
npx vectalon --dev telemetry --analyze

# Environment variable
VECTALON_DEV_MODE=1 npx vectalon sync
VECTALON_BYPASS_TIER=1 npx vectalon doctor
```

In dev mode:
- All features unlock (treated as `enterprise` tier)
- Telemetry tracking is skipped (no noise)
- A yellow banner prints on startup

**Never use in production. End users should use the free tier or start a trial instead.**

---

## Future Scope / Roadmap

- **M7** — Relative-to-human scoring (benchmark against reference solutions)
- **M8** — LoRA fine-tuning pipeline (dataset → train → convert → eval)
- **M9** — WASM model auto-tier (zero-config quantized fallback)
- **M10** — Team brain semantic search with remote embeddings (OpenAI/Azure)
- **M11** — Self-healing code-review loop (generate → review → fix → verify)
- **M12** — VS Code extension marketplace publish
- **M13** — Multi-provider inference routing (local + remote hybrid)
- **M14** — iOS/Android device-control adapters (build, install, screenshot)
- **M15** — Figma-to-code pipeline (design → component → tests)
- **M16** — Maestro/Detox E2E flow generation and execution
- **M17** — Performance regression detection (bundle budgets, startup time)
- **M18** — Crash-rate anomaly detection and auto-rollout gates
- **M19** — Custom model provider support (Azure, Ollama, vLLM, Groq)
- **M20** — Enterprise SSO and RBAC for team brain

---

## License

Business Source License 1.1 (BSL-1.1)

© 2026 Bhishak Sanyal. Commercial use requires a paid license.

- **Free**: Personal use, education, open source, teams ≤3 developers
- **Paid**: Teams >3 developers — starting at $19/month

See [LICENSE](../LICENSE) for full terms.
