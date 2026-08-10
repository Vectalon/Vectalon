# @vectalon-dev/rn

**The adaptive AI harness for React Native.**

Project-aware SDLC intelligence for any agent — CLI, MCP server, VS Code extension, benchmark suite, and fine-tuning pipeline in one package.

[Website](https://vectalon.in) · [Docs](https://vectalon.in/docs) · [Pricing](https://vectalon.in/pricing)

> **New here?** Read the [**Onboarding Guide**](../apps/website/docs/ONBOARDING.md) — a step-by-step tour of every feature, from first `init` to shipping — or watch the [**Daily Loop video script**](../apps/website/docs/VIDEO_SCRIPT.md) (13-min walkthrough: init → selftest → feature → review → release), or the [**recorded feature demo**](../apps/website/demo/recording/clips/full-demo.mp4) — a ~1.5-min scripted terminal walkthrough of every CLI command, re-recordable anytime via the [**recording guide**](../apps/website/demo/recording/README.md). For the full command reference, see [**CLI Reference**](../apps/website/docs/CLI_REFERENCE.md).

> **Want the projects from the video?** Two demo projects, both with the feature workflow run end-to-end and a [**replay guide**](../apps/website/demo/login-app/REPLAY.md): the Expo one the Daily Loop builds (a login screen on Expo SDK 53) at [**`apps/website/demo/login-app`**](../apps/website/demo/login-app/), and the non-Expo one (a plain TypeScript CLI app, proving the toolchain isn't Expo-only) at [**`apps/website/demo/cli-app`**](../apps/website/demo/cli-app/). Both are generated deterministically and backed by a CI golden test.

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
| `init [dir]` | Initialize `.vectalon/` workspace, detect flavor, set model provider, and **build the knowledge base automatically from a repo scan** (project snapshot, knowledge graph, code graph, native config, learned patterns — no manual import needed) — transactional: a failed init is recoverable (resume / clean restart) and a completed one is a no-op | `--model <provider>`, `--resume`, `--clean-restart`, `--force` |
| `serve` | Start the MCP server (MCP/stdio/SSE/HTTP) | `-p <port>`, `--protocol <type>`, `--model <provider>`, `--safe-mode` |
| `feature [prompt]` | Full SDLC workflow: PRD → design → architecture → implementation → tests → code-review → PR → docs | `--workflow`, `--resume`, `--from`, `--ticket <key>`, `--push`, `--device`, `--heal-interactive`, `--dry-run`, `--model <provider>` |
| `upgrade [dir]` | React Native / Expo upgrade copilot (impact, codemods, verification) | `--to <version>`, `--dry-run`, `--apply`, `--force` |
| `doctor [dir]` | Ecosystem + toolchain + leaderboard + model-access diagnostics — every probe is wrapped so one broken checker never kills the report | `--json`, `--fix`, `--selftest` |
| `selftest [dir]` | Test every feature in a sandbox — live progress + visible report + activity trace; runs REAL model inference when a model/API key is available | `--category <cat>`, `--only <id>`, `--model <provider>`, `--require-model`, `--list`, `--json`, `--open`, `--out <dir>`, `--no-html`, `--verbose` |
| `status` | One read-only health screen — daemon (pid/port/health), MCP reachability + tool count, model provider ready/degraded, last background refresh, license/trial days remaining, `.vectalon/` disk usage. Every probe is wrapped so one broken source degrades to a line. The first thing you ask a customer to run | — |
| `bundle [dir]` | Metro bundle analysis and performance budgets | `--platform <ios\|android>`, `--static` |
| `profile [dir]` | Hermes runtime profiling: JS-thread blocking, retained objects, leak candidates, baselines + regressions | `--profile <file>`, `--heap <file>`, `--baseline <label>`, `--save-baseline`, `--threshold-ms <n>`, `--json` |
| `sandbox` | Run a command in an isolated process with no ambient authority (scrubbed env, writes confined to the root, network denied by default) | `-- <command> [args...]`, `--root <dir>`, `--timeout <ms>`, `--cpu <s>`, `--memory <mb>`, `--network`, `--allow-env <names>`, `--json` |
| `render [dir]` | Compile + headless-render generated TS/TSX in the sandbox — console logs, render tree, runtime errors before the diff | `--entry <file>`, `--file <file>`, `--timeout <ms>`, `--memory <mb>`, `--json` |
| `ci [dir]` | Self-healing CI workflow generator (EAS / GitHub Actions) | `--dry-run` |
| `release [dir]` | Autonomous release pipeline: bump, changelog, E2E submit, crash-rate monitor (z-score anomaly detection + auto-rollout gate) | `--version`, `--changelog`, `--submit`, `--monitor`, `--baseline`, `--zscore <n>`, `--hours`, `--json` |
| `sync [dir]` | Sync team brain to a hosted git remote | `--push`, `--pull`, `--init`, `--remote <url>`, `--branch`, `--force` |
| `telemetry [dir]` | Ingest Sentry/Crashlytics/traces/analytics and analyze | `--path <dir>`, `--no-analyze` |
| `daemon` | Live Metro/Hermes companion daemon | `-p <port>`, `--metro-port`, `--stop`, `--status`, `--once`, `--wire-metro`, `--no-device-probe` |
| `impact [dir]` | Cross-package blast radius of changed files (monorepo) | `--changed <files>`, `--pr <number>`, `--push`, `--json`, `--dry-run` |
| `bench` | RN coding-test benchmark (deterministic baseline or real-model) | `--model <provider>`, `--suite <id>`, `--live`, `--install`, `--json`, `-o <path>`, `--baseline <file>`, `--tolerance <n>` |
| `leaderboard [dir]` | Merge benchmark results into `BENCHMARK_RESULTS.md` | `--out <path>`, `--json`, `--timestamp`, `--pr-comment` |
| `train [dir]` | Curate fine-tuning dataset from benchmark references + LoRA plan | `--build`, `--plan`, `--out <dir>`, `--base <model>`, `--scenarios <dir>`, `--references <dir>`, `--json` |
| `ecosystem [dir]` | Browse/enable MCP servers, skills, tools, hooks | `--category <mcp\|skill\|tool\|hook>`, `--flavor <expo\|rn-cli>`, `--enable <id>`, `--disable <id>`, `--export`, `--json` |
| `refresh [dir]` | Refresh knowledge from web sources + improvement suggestions, and re-seed the repo-derived knowledge-base artifacts (idempotent) | `--force` |
| `auth` | Manage license/trial, activate keys, GitHub OAuth | `--license <key>`, `--github`, `--status`, `--logout` |
| `policy [dir]` | Manage project-specific guardrail policy | `--init`, `--check <file>` |
| `pull [preset]` | Download local model preset (default Qwen2.5-Coder-1.5b) | `[preset-id]` |
| `models` | List available and downloaded local models | — |
| `support [dir]` | Collect + upload a sanitized support bundle (logs, error queue, crash report, package.json, `.vectalon` state) with a support token | `--upload`, `--out <path>` |

### Global flags

| Flag | Description |
|------|-------------|
| `--dev` | **Dev mode** — bypass all tier/license checks. All features unlock. |
| `--diagnostics` | Write `.vectalon/diagnostics-bundle.json` (environment, last 5000 log lines, model provider, `.vectalon` state) — works on **every** command |
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
  ○ Show status
  ○ Live Metro daemon
  ○ Ingest telemetry
  ○ Analyze impact
  ○ Generate CI workflow
  ○ Release pipeline
  ○ Fine-tune dataset
  ○ Manage ecosystem
  ○ Run doctor
  ○ Run self-test
  ○ Run benchmark
  ○ Update leaderboard
  ○ Sync team brain
  ○ Manage policy
  ○ Start MCP server
  ○ Download local model
  ○ List models
  ○ Show help
```

---

## Model Providers

| Provider | Type | Details |
|----------|------|---------|
| **local** | GGUF (node-llama-cpp) | Qwen2.5-Coder presets. Fully offline. Skills inlined into system prompt. |
| **wasm** | ONNX / WASM (@huggingface/transformers) | Zero-config quantized model. Downloads on first use. No API key, no native build. |
| **openai** | Remote | Chat Completions API (default `gpt-4o`), `OPENAI_API_KEY`. |
| **anthropic** | Remote | Messages API (default `claude-sonnet-4-20250514`), `ANTHROPIC_API_KEY`. |
| **azure-openai** | Remote | Azure OpenAI deployments (default `gpt-4o`), `AZURE_OPENAI_API_KEY`; set the endpoint to your resource + deployment (e.g. `https://<resource>.openai.azure.com/openai/deployments/<deployment>`). |
| **groq** | Remote | OpenAI-compatible fast inference (default `llama-3.3-70b-versatile`), `GROQ_API_KEY`. |
| **ollama** | Local server | OpenAI-compatible `/v1` endpoint on `http://localhost:11434` (default `llama3.1`). No API key. |
| **vllm** | Local server | OpenAI-compatible `/v1` endpoint on `http://localhost:8000` (default `qwen2.5-coder-7b-instruct`). No API key. |

Remote providers are configured entirely from the environment (keys are never
written to disk); `--model` picks the provider, and the endpoint / model can be
overridden per project in `.vectalon/rn-vectalon.json` (`modelConfig.endpoint`,
`modelConfig.modelName`). Set the default provider during `vectalon init` or
override per-command with `--model <provider>`.

---

## Guardrails

36 built-in rules enforced on every code generation and file save:

**Code Quality**: `no-console-log`, `no-inline-styles`, `no-hardcoded-urls`, `no-secrets-in-code`, `no-any-type`, `proper-error-handling`, `no-unused-imports`, `no-direct-state-mutation`, `proper-hook-deps`, `no-heavy-work-in-render`, `use-keyboard-avoiding-view`, `accessibility-labels`, `no-deprecated-apis`, `platform-aware-code`, `proper-navigation-types`, `consistent-naming`, `use-safe-area`, `no-todos-in-code`, `typescript-strict`, `proper-image-assets`, `memoize-expensive-components`, `no-mutation-in-hooks`, `use-strict-equality`, `no-var-declarations`, `proper-export-style`, `use-pressable`, `no-leaked-render`

**New Architecture**: `no-set-native-props`, `no-sync-native-module-calls`, `missing-turbomodule-spec`

**React 19**: `no-ref-mutation-in-render`, `use-effect-cleanup`, `use-outside-suspense`, `unstable-dependency-array`, `no-forward-ref`

**React Compiler**: `compiler-auto-memoization`

Project-specific overrides via `.vectalon/policy.json`.

The code-review analyzer ships a complementary **33-rule deterministic rule
set** that catches the same patterns in reviews (not just on save), including
RN best practices: `use-pressable`, `no-leaked-render`, `animation-layout-props`,
`animation-press-gesture`, `navigation-native-stack`, and
`list-scrollview-map`. Every LLM finding on these rules is hallucination-verified
against the actual code before it counts.

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
| `CrashMonitor` | Post-release crash-rate spike detection (ratio baseline) |
| `CrashAnomalyDetector` | Z-score anomaly detection on the crash-rate time series + auto-rollout gates + knowledge-base baselines |
| `DebugAnalyzer` | Debug strategy and breakpoint recommendations |
| `DesignComplianceChecker` | Enforce design-system token compliance |
| `DesignSystemExtractor` | Extract design tokens and system definitions |
| `FigmaComponentGenerator` | Generate components from Figma specs |
| `GapAnalyzer` | SDLC gap analysis |
| `IncidentAnalyzer` | Incident severity, impact, and cause-bucket analysis |
| `KpiReportAnalyzer` | KPI dashboards and telemetry-derived metrics |
| `LintFixer` | Automatic lint error remediation |
| `LLMCodeReviewer` | LLM-powered code review with a **compile-gated self-healing fix loop** — every LLM fix is typechecked (`tsc`) before it is accepted and reverted when it does not reduce the error count |
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

## Hermes Runtime Profiling (`vectalon profile`)

Parse Hermes `.cpuprofile` and heap snapshots to surface **measured** runtime
problems and track them over time (**Pro tier**):

```bash
npx vectalon profile --profile app.cpuprofile                # JS-thread blocking + hot functions
npx vectalon profile --heap app.heapsnapshot                  # retained objects + leak candidates
npx vectalon profile --profile app.cpuprofile --save-baseline # store a baseline in the knowledge base
npx vectalon profile --profile app.cpuprofile                 # compare against the stored baseline
```

- **JS-thread blocking** — contiguous sample runs where the JS thread stays
  in one frame become blocking events: *"useEffect blocks the JS thread for
  500ms — move to a worklet"*.
- **Heap** — a first-reach retained-size approximation shows which objects the
  GC roots actually hold onto ("imageCache retains 20 MB"), and the largest
  self allocations surface as leak candidates.
- **Baselines & regressions** — each run can be persisted as an `analytics`
  artifact in the knowledge base; later runs are compared against it and
  blocking time up >25% (or retained heap up >30%) flags a regression.
- **Code review evidence** — `CodeReviewAnalyzer.review(code, lang, metrics)`
  cites the measured numbers in findings, so reviews point at real blocking
  code, not just static rules.
- Also available as the MCP tool `analyze_hermes_profile`.

## Sandboxed Code Execution (`vectalon sandbox`)

Run generated code, tests, and scripts in **isolated processes with no
ambient authority** — the trust foundation for auto-executed code
(**Pro tier**):

```bash
npx vectalon sandbox -- node -e 'console.log("hello")'        # run inside the project dir
npx vectalon sandbox --root /tmp/scratch -- npm test           # confine to a scratch dir
npx vectalon sandbox --timeout 5000 -- node run-tests.js       # bound execution
npx vectalon sandbox --cpu 10 --memory 512 -- jest             # CPU + memory caps
```

- **Environment scrubbing** — deny-by-default: only PATH, HOME, TMPDIR, and
  locale vars survive unless you pass `--allow-env`. Credential-shaped
  ambient variables (AWS keys, GitHub tokens, npm tokens, SSH agents, CI
  secrets) are always dropped; the report lists exactly what was stripped.
- **OS isolation** — on macOS, `sandbox-exec` confines file writes to the
  sandbox root and denies outbound network by default; on Linux, `bwrap`
  binds the filesystem read-only and unshares the network namespace. Where
  neither exists, it degrades to process-level isolation (scrubbed env +
  rlimits) and says so honestly.
- **Bounds** — wall-clock timeout (SIGTERM → SIGKILL to the whole process
  group) and POSIX rlimits for CPU seconds, virtual memory, file size,
  open files, and process count. A runaway can never hang the caller.
- **Structured result** — every run returns `ok`, `exitCode`, `signal`,
  `timedOut`, `isolation`, `droppedEnv`, and `durationMs` (also as JSON).

Also available as the MCP tools `sandbox_run` (requires an explicit `root`
+ `command` — never defaults to the current directory) and `sandbox_backend`.

## Crash-Rate Anomaly Detection (`vectalon release --monitor`)

Beyond the fixed ratio check, the release monitor now runs **statistical
anomaly detection** on the crash-rate time series (**Pro tier**):

```bash
npx vectalon release --monitor                          # z-score anomaly detection (24h window)
npx vectalon release --monitor --telemetry telemetry/   # point at the exports dir
npx vectalon release --monitor --zscore 4               # tighter gate: baseline + 4σ
npx vectalon release --monitor --baseline 2.5           # classic ratio check instead
```

- **Time series** — crashes with timestamps (Sentry / Crashlytics exports)
  are bucketed into hourly windows; each bucket is normalized to crashes per
  1k sessions per day.
- **Z-score baseline** — the mean and stdDev of the historical buckets form
  the baseline. A window whose rate exceeds **baseline + n·stdDev** (default
  3σ) is flagged as an anomaly: the harness auto-files an incident artifact
  (via `IncidentAnalyzer`) and **recommends rollback** — the auto-rollout
  gate.
- **Self-learning knowledge base** — after each healthy window the baseline
  is persisted as a `telemetry` artifact, so the next release is compared
  against the accumulated history. A spike window never overwrites the
  baseline — the gate stays strict until the release is rolled back or fixed.
- **Graceful degradation** — untimestamped exports (or an explicit
  `--baseline`) fall back to the classic ratio check; thin history reports a
  `watch` instead of a false alarm.

Also available as the MCP tool `check_crash_rate` (pass crash JSON with
`timestamp`s to get the z-score analysis).

## Metro-aware Execution Sandbox (`vectalon render`)

Compile generated files through the Metro transform pipeline and **render them
headlessly** inside the V-1 sandbox — reading console logs, the render tree,
and runtime errors **before presenting a diff to the user** (**Pro tier**):

```bash
npx vectalon render --entry src/App.tsx                    # render a project file
npx vectalon render --entry src/App.tsx --file src/Header.tsx  # compile siblings too
npx vectalon render --entry src/App.tsx --json             # structured result
```

- **Transpile** — project Babel with TS/React presets (the exact Metro
  transform chain when the project ships them), falling back to offline
  TypeScript `transpileModule`, with a parser-only syntax check as the last
  resort. A bundled parser backstop catches syntax errors that
  `transpileModule` silently recovers from (e.g. unclosed JSX).
- **Headless render** — a self-contained zero-dependency React + react-native
  shim runs inside the sandbox (no network, no installs): function
  components, hooks (`useState` / `useEffect` / `useMemo` / `useContext` …),
  host components (View, Text, FlatList, …), console capture, and a
  depth/node-capped render tree serialized to JSON.
- **Self-correcting agents** — a component that throws at render, fails to
  load, or logs an error is surfaced structurally (`loadError` /
  `runtimeError` / `logs`) so the agent can fix the JSX/TS before the user
  ever sees the diff.

Also available as the MCP tool `render_component` (pass a map of
path → source, get back the compiled modules, render tree, logs, and errors).

## Upgrade Copilot (`vectalon upgrade`)

Automated React Native / Expo version upgrades with codemods, AST-grade
breaking-change impact analysis, and New Architecture migration awareness
(**Pro tier**):

```bash
npx vectalon upgrade --to 0.76            # dry-run plan + impact analysis
npx vectalon upgrade --to 0.76 --apply    # execute codemods + verify
npx vectalon upgrade --to 0.76 --apply --force  # also apply review steps
npx vectalon upgrade --to 0.86.2 --diff   # + official rn-diff-purge template diff
```

The pipeline is **Detect → Catalog → Impact → Plan → Codemods → Verify**:

- **Deterministic planning** — a curated migration catalog (Hermes flag
  relocation, New Architecture opt-in, `requireNativeComponent` →
  `codegenNativeComponent`, ReactTestRenderer import fix, SDK / Kotlin /
  AGP requirements, React pairing) drives known migrations with no LLM
  involved. Every step is scored `auto` / `review` / `manual` with a total
  risk label.
- **rn-diff-purge integration** — every bare RN CLI plan includes an
  `rn-diff-purge` manual step pointing at the official community-maintained
  template diff between your exact from→to versions. It always surfaces
  **both the native (`android/`, `ios/`) and JS/TS (`App.tsx`, `index.js`,
  babel/metro/ts configs) changes to apply** — the same data the Upgrade
  Helper shows — and `--diff` fetches and categorizes it live from GitHub,
  so upgrades are current even for releases newer than the catalog. Also
  available as the MCP tool `get_rn_upgrade_diff` (fetch live or parse an
  inline diff offline).
- **Impact analysis** — scans the project's own source for native modules,
  bridge usage (`NativeModules`, `requireNativeComponent`), and
  Fabric-hostile patterns so you see exactly which files a major jump will
  break before touching anything.
- **Provenance** — `--apply` backs up every edited file under
  `.vectalon/upgrades/backups/` and writes a machine-readable manifest
  (`.vectalon/upgrades/<timestamp>-upgrade.json`).
- **Verification** — the apply loop runs `vectalon doctor`, a typecheck,
  and a bundle-budget regression gate against a pre-upgrade Metro snapshot.

Also available as MCP tools (`plan_upgrade`, `apply_upgrade`,
`detect_upgrade_state`). `apply_upgrade` always requires an explicit
`directory` argument — it never writes to the current working directory by
accident.

## MCP Server & Tools

`vectalon serve` exposes 60+ project-aware MCP tools across four categories:

- **CoreTools** — project scanning, context building, file reading, AST analysis
- **EcosystemTools** — catalog browsing, skill loading, ecosystem doctor
- **KnowledgeTools** — artifact search, traceability, team brain queries
- **SdlcTools** — invoke any SDLC analyzer/writer/generator on demand

Protocols: `mcp` (default), `stdio`, `sse`, `http`.

---

## VS Code Extension

The `vectalon` VS Code extension (in `extension/`) provides:

- **Auto-start MCP server** on activation (configurable)
- **Knowledge Base tree view** in the sidebar
- **Guardrail checks on save** — surfaced in the Problems panel
- **9 command-palette workflows**:
  - Run Feature Workflow
  - Review Code (current file)
  - Check Guardrails (current file)
  - Generate Component
  - Show Project Context
  - Search Knowledge Base
  - Refresh Knowledge View
  - Start MCP Server
  - Stop MCP Server
- **Webview preview** for workflow results and code reviews

**Marketplace** — published as `vectalon-dev.vectalon` (search "Vectalon" in
the Extensions view). Every `[publish-rn]` release packages a new `.vsix`
(`scripts/publish-vsce.js`) and publishes it, so VS Code's auto-update keeps
you current. Full marketplace metadata lives in `extension/package.json`
(gallery banner, badges, icon) and the Marketplace changelog is
`extension/CHANGELOG.md`.

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
- **Provenance & confidence** — every artifact carries a deterministic
  confidence score (`source × status × recency`), a staleness date (last
  updated + 90-day TTL), and its source; learned patterns carry provenance
  too. `KnowledgeIndex` ranks results by **relevance × confidence**, so agents
  trust recent, high-confidence context over stale or speculative guesses —
  and the `search_knowledge` MCP tool surfaces `confidence` and `rankedScore`
  on every hit
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

## Diagnostics & Error Telemetry

Production visibility without usage tracking — **errors only, opt-out**.

| Capability | How it works |
|------------|--------------|
| **Error pipeline** | Structured crash dumps (stack, CLI command, version, OS) queue to `<config>/telemetry-queue.json` and POST to the Vectalon error endpoint. `reportError(…, 'warn')`, uncaught exceptions, and unhandled rejections feed it. |
| **`--diagnostics`** | `vectalon <command> --diagnostics` writes `.vectalon/diagnostics-bundle.json` — Node/OS, RN/Expo versions, model provider, last 5000 log lines, sanitized `.vectalon` listing, full stack on failure. Paste it into a support ticket. |
| **Heartbeats** | `serve` and `daemon` POST a liveness ping every 5 min (version, uptime, model provider, OS, project type). A broken release is visible within one interval. |
| **Deep `/health`** | `vectalon serve --protocol http` → `GET /health` returns `healthy \| degraded \| critical` + `checks[]`: model provider reachable, artifact store writable, sub-MCP responsive, init config valid. The VS Code status bar tooltip shows it. |
| **`support --upload`** | Sanitized bundle (logs, error queue, crash report, package.json, `.vectalon` state) → gzipped upload with a `RN-XXXXXXXX` token; secrets redacted recursively. |

Privacy: all telemetry is **opt-out** — set `telemetry.enabled=false` (or
`telemetry.errors=false`) in `~/.config/rn-vectalon/config.json`. Dev mode and
`NODE_ENV=test` never send anything. Override the endpoint with
`RN_VECTALON_TELEMETRY_URL`.

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
│   │   ├── commands/           # 28 CLI command files
│   │   ├── index.ts            # CLI entry + interactive mode
│   │   └── logger.ts           # Output abstraction
│   ├── config/                 # Global configuration
│   ├── daemon/                 # Metro/Hermes live companion
│   ├── ecosystem/              # Catalog, config, skills, doctor
│   ├── guardrails/             # 36 rules, engine, policy system
│   ├── harness/                # Scanner, AST, knowledge graph, impact
│   ├── index.ts                # Package main export
│   ├── knowledge/              # Stores, embeddings, telemetry, sync, refresh
│   ├── memory/                 # Pattern learning, project memory
│   ├── model/                  # Routing, local/WASM/remote inference
│   ├── protocol/               # MCP server, sub-MCP clients, tools
│   ├── render/                 # Metro-aware execution sandbox (transpile, headless shim, render harness)
│   ├── sandbox/                # Sandboxed code execution (env scrub, backends, rlimits, bounded runs)
│   ├── sdlc/                   # 30 SDLC analyzers/writers/generators
│   ├── training/               # Fine-tuning dataset builder, LoRA plan
│   ├── utils/                  # Bundle analysis, Figma, diff, native scan, visual diff
│   └── workflows/              # Feature-development workflow engine + 13 phases
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
| **Free** | $0 | Project scanning, 60+ MCP tools, component generation, test writing, ecosystem doctor, benchmark suite |
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
- **V-1** — Sandboxed code execution: isolated processes with no ambient authority (env scrub, write/network confinement, rlimits) — the trust foundation for the Metro sandbox (I-4) and the self-healing CI loop
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
