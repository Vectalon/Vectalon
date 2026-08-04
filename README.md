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
whole lifecycle — **27 modules surfaced as 33 MCP tools**, all callable by any
MCP agent:

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
- **The model doesn't browse the web itself.** Code generation uses the model
and your project's learned patterns only. What keeps the harness current is the
**always-on web-aware knowledge refresh** (`vectalon refresh` and the background
scheduler in `vectalon serve`): it periodically retrieves React Native docs,
library changelogs, and community best practices, caches them, updates the
knowledge graph, and surfaces dependency upgrade suggestions — so the model's
stale training data is supplemented by fresh, project-relevant knowledge.
- **The local model can call tools.** Tool-enabled requests run in JSON mode via
node-llama-cpp's `LlamaJsonSchemaGrammar`, forcing a structured
`{ "tool", "arguments" }` / `{ "answer" }` envelope. The `run_agent` MCP tool
drives a small loop that lets the local LLM call the SDK's own tools (project
context, code review, workflows, and any proxied Metro/Expo MCP tools) and feeds
each result back until it answers — so the local model becomes a real agent over
your toolchain, not just a text generator.
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

### RN Coding Tests Benchmark

Measure how well the harness — or any model — writes React Native code.
`vectalon bench` runs a **versioned suite of 10 RN coding tests** (login screen,
FlatList feeds, typed navigation, secure forms, offline queues, image feeds,
feature flags, accessible forms, hooks refactors, …), scoring generated code on
three axes:

- **Correctness** — real `test` / `typecheck` / `lint` runs in a throwaway temp
  project (`--live`)
- **Best-practice adherence** — a 15-check RN rubric (KeyboardAvoidingView,
  FlatList over `.map`, safe areas, typed nav props, `Platform.OS`, style tokens,
  hook deps, a11y labels, …)
- **Guardrails** — the same project guardrail rules the implementation phase runs

Every scenario ships with a **human-authored reference solution**, so scores are
also reported **relative to the human baseline** (e.g. “generated code is 92% of
human best-practice adherence”). Run the deterministic baseline offline, or pass
`--model local|openai|anthropic` for a real-model leaderboard pass over all 10
scenarios. See `docs/BENCHMARK_PLAN.md` for the full plan.

### Expo & React Native CLI — explicit separation
rn-vectalon detects whether your project is **Expo-managed** or a **bare React
Native CLI** project and behaves accordingly:

- `Scanner` records `tooling: 'expo' | 'rn-cli'` plus the Expo SDK version into
the project snapshot
- The context prompt tells agents the tooling (e.g. `Expo (SDK ~52.0.0)`) so
they don't recommend RN-CLI-native edits for managed projects
- The simulator adapter runs `npx expo run:ios/android` for Expo projects and
`npx react-native run-ios/android` for bare projects
- Dependency removal plans produce Expo-aware cleanup (`npx expo prebuild
--clean`, `npx expo-doctor`) instead of `ios/Podfile` edits when the project is
Expo-managed

### LLM intent detection & smart routing

Before the workflow runs, an **LLM intent detector** classifies the prompt
(`add-feature`, `fix`/`lint`, `refactor`, `remove-dependency`, or `unknown`).
The detected intent and the model's reasoning are surfaced right in the CLI
output — e.g. `Detected intent: fix/lint — LLM, confidence 0.95` — so you can see
*why* the workflow routed the way it did. Intent drives the phase path:

- **`add-feature`** — full scaffold: PRD → scope → design → architecture →
  tasks → TDD tests → implementation → review → verification → PR
- **`fix` / `lint`** — diagnoses the failing check (lint/typecheck/test),
  generates a targeted repair, and re-runs the check instead of scaffolding a
  new feature
- **`refactor`** — restructure path without adding user-facing features
- **`remove-dependency`** — planned dependency removal with Expo-aware cleanup
- **`unknown`** — completes with a clarification plan instead of hard-failing

When the model can't produce parseable intent JSON, the raw (truncated) response
is logged to stderr and a single repair retry fires, so users see exactly what
happened.

### Web-aware knowledge refresh & upgrade suggestions

An always-on refresh service keeps the harness current with the React Native
ecosystem. `vectalon refresh` (or the background scheduler inside
`vectalon serve`) retrieves and caches:

- **Official RN docs** — React Native releases, API changes, new architecture
- **Library changelogs** — version history for dependencies you actually use
- **Community best practices** — curried into the knowledge graph

The refreshed knowledge is stored under `.vectalon/knowledge/refresh/` and the
service compares your `package.json` dependencies against it to generate
**upgrade suggestions** (`.vectalon/knowledge/refresh/suggestions.json`). After a
`vectalon feature` run, a compact "upgrade suggestions available" section prints
at the end of the workflow output with severity-colored lines and a hint to run
`vectalon refresh --force` for the latest data.

### Ecosystem catalog (MCP servers, skills, tools, hooks)
`vectalon ecosystem` indexes the full stack of React Native / Expo MCP servers,
agent skills, developer tools, and git hooks. All items are **opt-in** — nothing
is enabled without an explicit `vectalon ecosystem --enable <id>`.

### Official & Essential Expo MCP Tools

The official `@expo/mcp` server connects AI assistants directly to Expo
documentation, project dependency management, and EAS workflows.

- **`search_documentation`** / **`read_documentation`** — search and read official Expo docs
- **`add_library`** — install Expo/React Native packages via `expo install`
- **`workflow_create`** / **`workflow_validate`** / **`workflow_run`** — generate and check EAS CI/CD YAML
- **`build_list`** / **`build_info`** / **`build_logs`** / **`build_submit`** — track, inspect, and submit EAS builds to App Store / Play Store

### MCP Servers

| Server | What it does | Flavor |
|--------|-------------|--------|
| **Metro MCP** | CDP-based runtime inspection (console, network, component tree, Redux, UI automation, test recording via Maestro/Detox/Appium) | Both |
| **Expo MCP** | Official Expo: docs, `expo install`, EAS builds/workflows, TestFlight crash data, Play Store reviews, expo-router sitemap, device logs | Expo |
| **React Native MCP** | React Fiber tree + hook state inspection, re-render profiler, network mocking, 49 automation tools via ADB/idb | Both |
| **React Native Guide MCP** | Code quality enforcement: auto-remediation, StyleSheet/FlatList refactoring, test generation, dependency auditing | Both |
| **React Native Upgrader MCP** | Track stable/RC RN versions and generate exact upgrade diffs with migration guidance | RN-CLI |

### Agent Skills

| Skill | What it covers | Flavor |
|-------|---------------|--------|
| **Expo Router** | File-based routing, dynamic paths, native stacks, tabs, modals, deep linking, typed routes | Expo |
| **Expo UI / Native UI** | `@expo/ui` components (SwiftUI on iOS, Jetpack Compose on Android), semantic colors, platform styling | Expo |
| **Expo Tailwind Setup** | NativeWind v5 + Tailwind CSS v4: Metro config, babel plugin, global CSS, design tokens | Expo |
| **Expo Data Fetching** | TanStack Query, offline-first storage, caching strategies, optimistic updates | Expo |
| **Expo Dev Client** | Custom development builds for native code testing, dev-launcher workflows | Expo |
| **Expo DOM** | Embed web-only libraries natively using DOM components | Expo |
| **Expo Upgrade** | SDK version migrations, cache clearing, breaking-change codemods, post-upgrade validation | Expo |
| **Expo Project Structure** | File organization, app entry points, configuration standards | Expo |
| **Expo Module** | Native module development via Swift, Kotlin, and C++ (Expo Modules API) — works in Expo and bare RN-CLI | Both |
| **Expo Brownfield** | Integrate React Native screens into existing native Android/iOS codebases | RN-CLI |
| **Expo Skills (all-in-one)** | Bulk install of all official Expo skills above | Expo |
| **Callstack Agent Skills** | RN best practices: profiling, FlashList, React Compiler, Turbo Modules, bundle size, upgrades, brownfield | Both |
| **React Native Expert** | Senior RN/Expo engineering: platform handling, FlashList/LegendList performance, native thread management, Hermes profiling | Both |
| **Android E2E Testing** | Android emulator automation: ADB commands, UI Automator, emulator lifecycle, screenshot testing | Both |
| **SenaiVerse RN Agent System** | 7-role agent system: design token guardian, a11y enforcer, performance budget enforcer, security auditor, /feature /review /test commands | Both |

### Supporting Development Tools

| Category | Recommended Tooling |
|----------|-------------------|
| **Debugging** | Reactotron (state/network inspection), Flipper (layout/network/database inspector), React Native DevTools (component tree, Hermes debugger) |
| **State & Storage** | Zustand (hooks-based state), MMKV (>30x AsyncStorage, synchronous reads, encryption), React Native SecureStore (Keychain/EncryptedSharedPrefs) |
| **Animations** | React Native Reanimated (UI-thread animations, worklets, layout animations), Gesture Handler (pan/pinch/tap/long-press) |
| **Build & CI/CD** | EAS CLI (Expo: build, submit, update), Fastlane (bare RN-CLI: beta deployments, App Store/Google Play) |
| **E2E Testing** | Maestro (YAML-based, simplest), Detox (gray-box, native sync) |
| **Performance** | FlashList (Shopify, virtualized lists), Reactotron (profiling), RN DevTools (profiler) |

### Git Hooks

- **Husky** — lint/typecheck/tests before commits
- **lint-staged** — run lint/format only on staged files
- **Lefthook** — fast parallel git hooks (Go alternative to husky)

### Ecosystem Export

`vectalon ecosystem --export` emits the enabled MCP servers as a JSON config
fragment ready to paste into Cursor/Claude Code, and `--flavor expo|rn-cli`
filters items by project flavor.

When `vectalon serve` starts, it reads the enabled ecosystem items from
`.vectalon/ecosystem.json` and **spawns each enabled MCP server as a child
process, completing the MCP `initialize` handshake and proxying its real tools**
into the parent tool list — namespaced as `<id>__<tool>`, e.g.
`metro-mcp__get_console_logs` — so connected agents call the Metro MCP, Expo
MCP, etc. directly through rn-vectalon with zero manual MCP config. Servers that
fail to start (package not installed, handshake timeout) are skipped with a
warning plus the install command, and every spawned server is terminated on
shutdown. (`vectalon ecosystem --export` still emits the ready-to-paste config
fragment for agents that manage their own MCP server list.)

`vectalon init` **auto-enables ecosystem items from your installed dependencies**
— scanning `package.json` and matching package names against the catalog
(zustand, react-native-gesture-handler, react-native-reanimated, react-native-mmkv,
@shopify/flash-list, husky, lint-staged, …), surfacing each detection in the init
log with `(already enabled)` markers when the flavor recommendations already
covered it.

**Enabled skills also feed the local model.** When a skill is installed
(`.vectalon/skills/<id>/SKILL.md` or `.agents/skills/<id>/SKILL.md`) and enabled,
its best-practice content is inlined into the system prompt of every **local**
generation — intent detection, implementation, MCP tools, and fixes — so the
local LLM follows the same guidance external agents load from the skills
(capped at 4k chars per skill, 8 skills, 16k total). `vectalon feature` logs how
many skills were inlined.

### Ecosystem Doctor

`vectalon doctor` verifies that every enabled ecosystem item is actually
installed and reachable, so agents never discover tooling that isn't there:

- **MCP servers** — the npx package resolves locally, or the binary responds
  to a bounded version/help probe
- **Tools & hooks** — the npm package is resolvable from the project's
  `node_modules`, or the global binary (fastlane/maestro/EAS CLI) responds on
  `PATH`
- **Skills** — the skill install directory exists under `.vectalon/skills/` or
  `.agents/skills/`

It also checks the **native toolchain** a React Native project needs to build
and run:

- **Node.js** — version 20+ (18-19 warns, older is flagged) with an `nvm`
  upgrade hint
- **JDK** — 17+ required for RN Android builds
- **Android SDK** — resolved from `ANDROID_HOME`/`ANDROID_SDK_ROOT`, or via
  `adb` on `PATH` (warns when the project has no `android/` dir)
- **Android emulator** — lists configured AVDs when the `emulator` binary
  responds
- **Xcode & CocoaPods** — verified on macOS only (skipped elsewhere)
- **Metro port 8081** — warns (never fails) when no dev server is listening;
  honors a custom port via options

It also checks the **nightly leaderboard readiness** so a failed scheduled
leaderboard run is diagnosed before the cron fires:

- **API-key secrets** — `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` set (warns
  when unset: that matrix entry would be skipped)
- **Local model** — the default Qwen preset is downloaded (warns with a
  `vectalon pull` hint)
- **Results directory** — `bench/results/` is present and writable (missing
  when not, with a `mkdir -p bench/results` hint — auto-fixed by `--fix`)

Finally, it checks **model access** — whether the configured model can actually
reach the toolchain:

- **Configured model** — the local Qwen preset is downloaded (missing, with a
  `vectalon pull` hint), or the remote provider's API key env var is set
  (warns when missing)
- **Ecosystem items enabled** — at least one item in `.vectalon/ecosystem.json`
  (warns when none: the model has no MCP servers or skills to reach)
- **Skills installed** — every enabled skill's install dir exists (warns when
  uninstalled skills won't reach the model via prompt inlining)
- **MCP servers reachable** — every enabled MCP server passes the ecosystem
  check (warns when the agent loop would skip some)

Each check prints a status (`OK`/`MISSING`/`WARN`) with an actionable fix hint
(e.g. the `npm install` / `npx skills add` / `brew install` command to run).
The command runs the toolchain checks even without an ecosystem config, exits
non-zero when anything is missing — useful in CI — and `--json` emits the full
report (ecosystem + toolchain + leaderboard) as machine-readable output.

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
│  │  │     SDLC Modules (27, 33 MCP tools)     │  │    │
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
2. **`vectalon serve`** — Starts a local server exposing 33 MCP tools (plus the Company Brain tools when a knowledge base is present, and the **real proxied tools of every enabled ecosystem MCP server**, namespaced as `<id>__<tool>`)
3. **`vectalon import`** — Feeds the Company Brain: PRDs, Jira exports, postmortems, any SDLC artifact
4. **Agent connects** — Your AI agent (Claude Code, OpenCode, etc.) connects to the MCP server and gets full project awareness
5. **Agent acts** — The agent uses the harness tools to generate code, fix bugs, write tests, produce PRDs/ADRs/test plans — all in your project's style
6. **Harness learns** — Every interaction improves the pattern store and the knowledge base. The next session is even smarter.

---

## Quick Start

### Prerequisites

- Node.js >= 20.12.0
- A React Native project — Expo-managed or bare RN CLI (>= 0.72)

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

Running `npx vectalon` with no arguments opens an interactive menu so you can pick init, feature, refresh, ecosystem, doctor, bench, leaderboard, sync, policy, serve, import, pull, models, or help without memorizing flags.

For the full command reference — every command with its options, examples, and
exit codes — see [docs/CLI_REFERENCE.md](docs/CLI_REFERENCE.md).

### Initialize

```bash
npx vectalon init
```

This scans your project and creates a `.vectalon/` directory with:
- `snapshot.json` — Full project context (components, structure, config)
- `context.md` — Human-readable project summary for agent prompts
- `memory.json` — Learned patterns and decision history
- `rn-vectalon.json` — Manifest with the detected tooling and model choice
- `ecosystem.json` — Enabled MCP servers, skills, and hooks

`init` also completes the **model side** of the setup — the provider you choose
is written to the manifest and used by `vectalon feature`/`serve` automatically:

- `vectalon init --model local` (default) — the local Qwen2.5-Coder provider;
  interactively, `init` offers to download the model (~1.1 GB) right away
- `vectalon init --model openai` — remote OpenAI provider; `init` records the
  model name and that it reads `OPENAI_API_KEY` from the environment
- `vectalon init --model anthropic` — remote Anthropic provider via
  `ANTHROPIC_API_KEY`
- Without a flag on a TTY, `init` prompts you to pick a provider; API keys are
  **never written to disk** — only the env var name is recorded

`init` detects whether your project is **Expo-managed** or a **bare React Native
CLI** project and sets up the tooling accordingly:

- **Expo projects** (`expo` dependency) auto-enable the Expo MCP server, the
  official Expo agent skills, and `expo-doctor` alongside the shared RN MCPs
  and hooks
- **Bare RN-CLI projects** auto-enable the React Native Upgrader MCP and
  `rn-diff-purge` alongside the shared items
- The detected `tooling` and Expo SDK version are stored in the manifest so
  every later phase (context prompt, simulator runs, dependency removal) uses
  the right commands
- Run `vectalon ecosystem --export` afterwards to emit the enabled MCP servers
  as a config fragment for your agent (Cursor/Claude Code)

All ecosystem items are **opt-in** — `init` only enables the recommended set;
add or remove anything with `vectalon ecosystem --enable <id>` / `--disable <id>`.

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

By default the workflow uses **real local adapters** — it automatically runs
`test`, `lint`, `prettier`, and `typecheck` scripts found in your `package.json`.
Device/simulator builds (`run-ios`, `run-android`) are **opt-in** via `--device`.
Use `--dry-run` to simulate without side effects, and `--push` to allow the
workflow to push the branch and open a PR:

```bash
npx vectalon feature "remove unused imports" --dry-run   # safe preview
npx vectalon feature "remove unused imports" --push      # commit, push, and open PR
npx vectalon feature "remove unused imports" --verbose   # show full phase output
npx vectalon feature "add login screen" --device         # include iOS/Android build checks
```

### Run the benchmark

Score the harness on the RN coding tests — no project setup required:

```bash
npx vectalon bench                            # deterministic baseline (offline)
npx vectalon bench --suite data-flow          # only the data-flow scenarios
npx vectalon bench --live                     # run real tests/typecheck/lint
npx vectalon bench --model local              # real-model leaderboard (all 10 scenarios)
npx vectalon bench --model openai --json      # JSON summary for tooling
npx vectalon bench -o report.md               # write the report to a file
npx vectalon bench --scenarios ./my-evals     # run your own custom eval pack
npx vectalon bench --baseline bench/baseline.json  # CI regression gate
npx vectalon leaderboard bench/results              # merge runs into BENCHMARK_RESULTS.md
```

- `--model <provider>` — `local` / `openai` / `anthropic`; runs the real-model
  leaderboard pass over all 10 scenarios
- `--suite <id>` — only scenarios in one suite
  (`core-ui`, `data-flow`, `forms-security`, `navigation`, `a11y`, `perf`, `refactor`)
- `--live` — run real tests/typecheck/lint for the correctness axis (slow)
- `--install` — `npm install` each temp project before the live checks (needed
  when the fixture project has a `package.json` but no `node_modules`)
- `--json` — machine-readable summary instead of markdown
- `-o, --output <path>` — write the report to a file
- `--scenarios <dir>` — override the scenarios directory (custom eval packs)
- `--references <dir>` — override the human reference-solutions directory
- `--baseline <file>` — compare the deterministic run against a stored baseline
  JSON and **exit 1 on any axis regression** (the CI gate; pass
  `bench/baseline.json` to run it — without the flag the gate is off);
  `--tolerance <fraction>` tunes the allowed drop (default `0.01`)

**Custom eval packs** — teams can author their own RN evals without a PR.
Point `--scenarios` at any directory of versioned scenario JSON files (nested
subdirectories are fine) and `--references` at your own human reference
solutions; files that fail validation (wrong `specVersion`, missing fields,
duplicate ids) are reported and skipped. See the
[benchmark plan](docs/BENCHMARK_PLAN.md) for the scenario spec shape.

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

This executes 13 phases in sequence, gating each one on the previous:

1. **PRD** — product requirements, goals, acceptance criteria
2. **Scope & impact analysis** — affected areas, new dependencies, risks
3. **Design & UX** — wireframes and motion-design recommendations
4. **Architecture** — ADR and API integration design
5. **Task creation** — issues/tasks in the configured PM tool (Jira, Monday, …)
6. **Test writing (TDD)** — tests are written BEFORE implementation, defining the contract the code must satisfy
7. **Implementation** — project-convention-aware code for service, hook, and screen, generated to make the written tests pass
8. **Code review** — LLM + rule-based review of the generated code and tests, with a **self-healing loop**: error findings are fed back to the model, the corrected files are written (with diffs streamed to the console), and the phase re-reviews up to N attempts before giving up and restoring the originals. It also runs the project's `lint`/`typecheck` and heals those errors too
9. **Verification** — runs the tests (validating the TDD gate), plus `lint`, `prettier:check`, and `typecheck` scripts from `package.json`. iOS/Android device builds are only included when you pass `--device`.
10. **Readiness report** — go/no-go against acceptance criteria
11. **Pull request** — branch, commit, push, and open PR
12. **Documentation** — draft README and CHANGELOG updates
13. **Close feature board** — mark tasks as complete

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

#### Self-healing code review

During the code-review phase, findings are fed back to the model until the code
is clean or the attempt cap is reached:

```bash
# Ask before applying each model fix (accept / reject / retry)
npx vectalon feature "create a login screen" --heal-interactive

# Override the heal loop per run
npx vectalon feature "create a login screen" --heal-attempts 5 --heal-severity warning
```

- `--heal-interactive` — stream a live diff and prompt for each fix instead of
  applying it automatically
- `--heal-attempts <n>` — max review→fix→re-review cycles (default 3)
- `--heal-severity <error|warning|info>` — lowest severity that triggers healing
  (default `error`; `warning` also heals warnings, `info` heals everything)

Failed heals are recorded to `.vectalon/knowledge/failed-heals.json` and injected
as context into the next run's review prompts, so the model avoids repeating the
same mistakes. See [Policy configuration](#policy-configuration) to tune the heal
loop per project.

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

Once the server is running, agents can call **33 built-in tools** — 26 always
available, 1 workflow orchestrator, 4 more when a knowledge base is present, and
2 more when a team brain is configured — plus any **enabled ecosystem MCP
servers** (Metro MCP, Expo MCP, …) exposed as first-class tools:

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

#### Remote embedding APIs

Semantic search (`search_knowledge`) uses a deterministic offline hash provider by
default so it works with no model configured. To get real model embeddings,
point the harness at an OpenAI-compatible `/v1/embeddings` endpoint (OpenAI,
Azure OpenAI, local vLLM/Ollama, or any compatible gateway):

```json
{
  "embeddingProvider": "openai",
  "openaiBaseUrl": "https://api.openai.com/v1",
  "embeddingModel": "text-embedding-3-small"
}
```

- `embeddingProvider` — `openai` or `openai-compatible` (or `hash` for the
  offline deterministic provider)
- `openaiApiKey` — key (also read from `OPENAI_API_KEY` /
  `RN_VECTALON_OPENAI_API_KEY` env vars)
- `openaiBaseUrl` — base URL for compatible endpoints; defaults to
  `https://api.openai.com/v1`
- `embeddingModel` — model id; defaults to `text-embedding-3-small`

When a remote provider is configured, `search_knowledge` embeds the query with
real vectors and merges the semantic score with lexical ranking.

### Team brain sync (hosted artifact store)

Sync the team brain (`.vectalon/knowledge/`) to a git remote so the knowledge
base is shared across the team:

```bash
# Configure a remote once
npx vectalon sync --init --remote git@github.com:org/team-brain.git

# Push the local team brain to the remote
npx vectalon sync --push

# Pull the remote team brain over the local one
npx vectalon sync --pull
```

Sync settings live in `.vectalon/sync.json`:

```json
{
  "remote": "git@github.com:org/team-brain.git",
  "branch": "main",
  "enabled": true
}
```

- `--branch <name>` — sync branch (default `main`)
- `--force` — run even when sync is disabled (`"enabled": false`)

Push commits the knowledge directory and pushes to a `vectalon-sync` remote;
pull fetches the branch and checks out its knowledge directory over the local
one. `vectalon serve` logs the sync status at startup.

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

### Policy configuration

Project-specific guardrails live in `.vectalon/policy.json` (create it with
`vectalon policy --init`). Besides base-rule overrides and custom regex rules,
the policy tunes the **self-healing code review** loop:

```json
{
  "version": 1,
  "rules": {
    "no-hardcoded-urls": { "enabled": false }
  },
  "customRules": [],
  "codeReview": {
    "maxAttempts": 5,
    "healSeverity": "warning",
    "toolChecks": true
  }
}
```

- `maxAttempts` — review→fix→re-review cycles before the phase gives up
  (default `3`)
- `healSeverity` — lowest finding severity that triggers the heal loop
  (`error`, `warning`, or `info`; default `error`). The phase still only fails
  on error-severity findings
- `toolChecks` — run the project's `lint` and `typecheck` after the LLM review
  loop and feed their errors back through the same heal loop (default `true`).
  Note that the verification phase also runs these checks, so on large projects
  you may prefer `toolChecks: false` to avoid running lint/typecheck twice
  when the verification gate alone is enough

CLI flags `--heal-attempts` and `--heal-severity` override the policy for a
single run.

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

## Graph Engineering

rn-vectalon builds a **code dependency graph** during every `init` and `refresh`. The graph parses imports and exports across your `src/` tree and persists to `.vectalon/code-graph.json`:

- **Entry points** — files with no incoming imports (top-level screens, app entry)
- **Circular dependencies** — detected cycles in the import graph
- **Orphan files** — source files unreachable from any entry point
- **Dependents / dependencies** — query who imports a file and what it imports

Agents can use this graph for architecture analysis, refactoring impact assessment, and dead-code detection.

---

## Project Structure

```
rn-vectalon/
├── src/
│   ├── cli/               # CLI entry point and commands (12)
│   │   ├── commands/
│   │   │   ├── init.ts        # Project init: scan, tooling detection (Expo vs
│   │   │   │                  #   RN-CLI), model setup, dependency auto-enable
│   │   │   ├── feature.ts     # End-to-end feature-development workflow
│   │   │   ├── serve.ts       # MCP server (+ team.json, background refresh)
│   │   │   ├── import.ts      # Knowledge base artifact import
│   │   │   ├── refresh.ts     # Web-aware knowledge refresh + suggestions
│   │   │   ├── ecosystem.ts   # Browse/enable/export MCPs, skills, tools, hooks
│   │   │   ├── doctor.ts      # Ecosystem + native toolchain health checks
│   │   │   ├── policy.ts      # Project-specific guardrail policy
│   │   │   ├── sync.ts        # Team brain sync to a git remote
│   │   │   ├── bench.ts       # RN coding tests benchmark CLI
│   │   │   ├── leaderboard.ts # Merge model runs into BENCHMARK_RESULTS.md
│   │   │   ├── pull.ts        # Download a local model
│   │   │   └── models.ts      # List local models
│   │   └── index.ts       # CLI runner + interactive menu
│   ├── bench/             # RN coding tests benchmark
│   │   ├── runner.ts      # Scenario runner + scoring aggregation
│   │   ├── rubric.ts      # 15-check RN best-practice rubric
│   │   ├── scoring.ts     # Correctness / rubric / guardrails scoring
│   │   ├── modelGenerate.ts  # ModelRouter-backed generate seam
│   │   ├── references.ts  # Human reference solution loader
│   │   ├── loader.ts      # Versioned scenario spec loading
│   │   ├── snapshot.ts    # Project snapshot capture
│   │   ├── report.ts      # Markdown/JSON report formatter
│   │   └── leaderboard.ts # Per-model result merge → BENCHMARK_RESULTS.md
│   ├── ecosystem/         # External tooling catalog + doctor
│   │   ├── catalog.ts     # MCP servers, skills, tools, hooks (Expo & RN-CLI)
│   │   ├── config.ts      # ecosystem.json, recommendations, dependency detection
│   │   ├── doctor.ts      # Ecosystem + native toolchain check engine
│   │   └── types.ts
│   ├── guardrails/        # Guardrail rules + policy engine
│   │   ├── rules.ts       # 25 RN-specific guardrail rules
│   │   ├── engine.ts      # runGuardrails + formatGuardrailResult
│   │   ├── PolicyEngine.ts    # .vectalon/policy.json overrides + custom rules
│   │   └── types.ts
│   ├── harness/
│   │   ├── Scanner.ts     # Project & component scanner (Expo vs RN-CLI)
│   │   ├── CodeGraph.ts   # Dependency graph builder
│   │   ├── ContextEngine.ts  # Context builder & manager
│   │   └── types.ts
│   ├── knowledge/         # Company Brain
│   │   ├── artifactTypes.ts   # 13-type taxonomy + role→type map
│   │   ├── ArtifactStore.ts   # Versioned, traceable artifact store
│   │   ├── Traceability.ts    # RTM graph traversal over links
│   │   ├── RoleEngine.ts      # Role-scoped context assembly
│   │   ├── TeamStore.ts       # Multi-project registry (team brain)
│   │   ├── KnowledgeIndex.ts  # TF + semantic retrieval
│   │   ├── embeddings.ts      # Hash provider + cosine similarity
│   │   ├── remoteEmbeddings.ts  # OpenAI / OpenAI-compatible providers
│   │   ├── artifactSync.ts    # Git-backed team brain sync
│   │   └── refresh/           # Web-aware refresh (fetchers, sources, cache)
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
│   │   ├── setup.ts       # Provider resolution during init
│   │   ├── providers/     # LocalProvider, RemoteProvider
│   │   ├── local/         # ModelStore, download, inference, presets
│   │   └── types.ts
│   ├── protocol/
│   │   ├── MCPServer.ts   # MCP/stdio/HTTP server (33 tools + ecosystem MCPs)
│   │   └── types.ts
│   ├── workflows/         # Feature-development workflow engine
│   │   ├── WorkflowEngine.ts  # Phase orchestration + state
│   │   ├── intent.ts          # LLM intent detection (add-feature/fix/refactor/…)
│   │   ├── definitions/       # featureDevelopment workflow definition
│   │   └── phases/            # prd, scope, design, architecture, task, test
│   │       │                  #   (TDD), implementation, codeReview
│   │       │                  #   (self-healing), verification, readiness,
│   │       │                  #   pr, documentation, close
│   │       └── helpers.ts, healMemory.ts, fileOutput.ts, documentWriter.ts
│   ├── memory/
│   │   ├── PatternLearner.ts  # Pattern detection
│   │   └── ProjectMemory.ts   # Persistent store
│   ├── utils/
│   │   ├── fileDiff.ts        # Streamed diffs for code changes
│   │   ├── unusedImports.ts   # Unused import detection/removal
│   │   ├── validationCommands.ts # Detect test/lint/typecheck scripts
│   │   └── dynamicImport.ts
│   ├── adapters/          # PM, git, test-runner, simulator, runCommand
│   └── config/
│       └── index.ts
├── __tests__/            # 604 tests across 81 suites
├── bench/
│   └── scenarios/        # 10 versioned RN coding test scenarios (rn-01…rn-10)
├── bin/
│   └── rn-vectalon.js       # CLI entry
├── docs/
│   ├── ENHANCEMENT_PLAN.md  # Phase roadmap (A–H delivered, I+ futuristic)
│   ├── BENCHMARK_PLAN.md    # RN coding tests benchmark plan (M1–M6)
│   └── CLI_REFERENCE.md     # Full command reference (options, examples, exit codes)
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
- ✅ **Guardrails & policy engine** — project-specific `.vectalon/policy.json` rules,
  self-healing code review, interactive heals
- ✅ **Web-aware knowledge refresh** — always-on periodic retrieval of latest React Native docs,
  library changelogs, and community best practices; updates the memory graph, best-practices
  knowledge base, and manages improvement suggestions for each client project
- ✅ **Hosted artifact store** — `vectalon sync` pushes/pulls the team brain to a git remote
- ✅ **Real embedding APIs** — OpenAI & OpenAI-compatible embedding providers behind the
  `EmbeddingProvider` seam (async semantic search in `search_knowledge`)
- ✅ **RN coding tests benchmark** — versioned scenario spec, 10 eval scenarios,
  deterministic baseline runner, 15-check best-practice rubric, human reference
  solutions with relative-to-human scoring, custom eval packs
  (`--scenarios`/`--references`), and the `vectalon bench` CLI
  (`--model`/`--suite`/`--live`) for deterministic or real-model leaderboard runs
- ✅ **Benchmark CI regression gate (M4)** — committed `bench/baseline.json` and
  `vectalon bench --baseline`, run by the CI `bench` job on every PR so any
  axis regression fails the build; regenerate with
  `npx vectalon bench --json -o bench/baseline.json`
- ✅ **Scheduled model leaderboard (M5)** — `.github/workflows/leaderboard.yml`
  runs `vectalon bench --live --install --model` on a `[local, openai, anthropic]`
  matrix nightly, merges per-model results with `vectalon leaderboard`, and
  commits a timestamped `BENCHMARK_RESULTS.md` scenario × model × axis table
- ✅ **Expo & RN-CLI separation** — `Scanner` detects `tooling` + Expo SDK
  version; context prompts, simulator runs, and dependency removal are
  flavor-aware
- ✅ **LLM intent detection & smart routing** — `add-feature` / `fix` / `refactor` /
  `remove-dependency` / `unknown` classification with confidence surfaced in the
  CLI, driving the correct phase path (fixes skip scaffolding)
- ✅ **Ecosystem catalog** — 35+ MCP servers, agent skills, tools, and git hooks
  for Expo & RN-CLI, browsable via `vectalon ecosystem`, with flavor-based
  recommendations and install-command exports
- ✅ **Ecosystem MCP exposure** — `vectalon serve` reads `.vectalon/ecosystem.json`
  and exposes every enabled MCP server as a first-class tool agents auto-discover
- ✅ **Init tooling & model setup** — `vectalon init` detects Expo vs RN-CLI,
  auto-enables matching ecosystem items from `package.json` dependencies
  (zustand, gesture-handler, reanimated, …), and offers local-download or
  remote (OpenAI/Anthropic) model configuration written to the manifest
- ✅ **Resolved-model surfacing** — the feature workflow summary and `serve`
  startup logs print the actual provider + model used, with a warning when a
  remote key is missing
- ✅ **Ecosystem doctor** — `vectalon doctor` verifies every enabled ecosystem
  item is installed/reachable **and** checks the native toolchain (Node, JDK,
  Android SDK/emulator, Xcode/CocoaPods, Metro port) with actionable fix hints
  and `--json` output
- ✅ **Doctor auto-remediation** — `vectalon doctor --fix` auto-installs missing
  ecosystem items (npm packages, `npx skills add`, gem, brew cask for JDK) and
  re-runs the checks, reporting `before → after` missing counts
- ✅ **Leaderboard readiness in doctor** — `vectalon doctor` verifies the
  nightly leaderboard prerequisites (API-key secrets, local model downloaded,
  `bench/results` writable) so a failed scheduled run is caught before the
  cron fires

**Next up:**

- **PR leaderboard comments** — comment the nightly leaderboard comparison on PRs
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
