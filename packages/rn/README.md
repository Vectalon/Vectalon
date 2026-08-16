# @vectalon-dev/rn

**The AI engineering control plane for React Native.** Give it a repository and it continuously understands, reviews, diagnoses, upgrades, and validates the application.

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

### Shortcut: `vc`

The package installs **three** bin names — `vectalon`, `vc`, and
`rn-vectalon` — all pointing at the same CLI. Once the package is installed
in your project, drop the `npx` prefix:

```bash
vc status
vc impact --changed App.tsx
npx vc smoke --full    # npx resolves your local install first
```

> `vc` is also a registered npm package (an unrelated tool), so only use the
> bare name (or `npx vc`) in a project where `@vectalon-dev/rn` is installed
> — `npx` then resolves the local binary first and never fetches the registry
> package.

---

## Quick Start

```bash
# 1. Initialize your project
npx vectalon init      # or: vc init

# 2. Start the MCP server for agents
npx vectalon serve     # or: vc serve

# 3. Run the interactive menu (no arguments)
npx vectalon           # or: vc
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
| `doctor [dir]` | Ecosystem + toolchain + leaderboard + model-access diagnostics — every probe is wrapped so one broken checker never kills the report; also validates each enabled MCP catalog entry against npm (cache-backed) so stale package names are caught before serve does | `--json`, `--fix`, `--selftest`, `--enable <id>`, `--disable <id>`, `--enable-recommended` |
| `fix [issue]` | **The killer workflow — "Fix my React Native issue"**: one command that understands the project, diagnoses the root cause (from your words or a `--log`), explains it, proposes a fix, applies it in a sandbox (or `--apply` to your tree), runs tests/build, verifies, and shows exactly what changed — one structured verdict (root cause / evidence / impact / recommended fix / applied / verification / confidence), zero model calls. Reuses the log classifiers, RN-required version knowledge, and literal text edits — never touches your tree without `--apply` | `--log <path>`, `--apply`, `--force`, `--json` |
| `score` | **The Vectalon Engineering Health Score** — one 0-100 number an engineering manager immediately understands, aggregated from eight deterministic dimensions (Architecture, Dependencies, Build Health, Testing, Performance, Security, Accessibility, RN Upgrade Risk), each scored by a committed scanner consuming the shared Project Intelligence model. Shows the overall, per-dimension bars, the delta vs the previous run ("↓ 8 points this week"), the newly-arrived problems, and P0/P1/P2 recommended actions (error → P0, warning → P1, info → P2). Zero model calls. Report + history to `docs/vectalon/score/` | `--audit`, `--json` |
| `selftest [dir]` | Test every feature in a sandbox — live progress + visible report + activity trace; runs REAL model inference when a model/API key is available | `--category <cat>`, `--only <id>`, `--model <provider>`, `--require-model`, `--list`, `--json`, `--open`, `--out <dir>`, `--no-html`, `--verbose` |
| `status` | One read-only health screen — daemon (pid/port/health), MCP reachability + tool count, model provider ready/degraded, last background refresh, license/trial days remaining, `.vectalon/` disk usage. Every probe is wrapped so one broken source degrades to a line. The first thing you ask a customer to run | — |
| `bundle [dir]` | Metro bundle analysis and performance budgets — ASCII top-package bars in the terminal + optional interactive HTML treemap dashboard (`--open`) with drill-down and replacement suggestions | `--platform <ios\|android>`, `--static`, `--open`, `--no-html`, `--report <dir>` |
| `profile [dir]` | Hermes runtime profiling: JS-thread blocking, retained objects, leak candidates, baselines + regressions | `--profile <file>`, `--heap <file>`, `--baseline <label>`, `--save-baseline`, `--threshold-ms <n>`, `--json` |
| `sandbox` | Run a command in an isolated process with no ambient authority (scrubbed env, writes confined to the root, network denied by default) | `-- <command> [args...]`, `--root <dir>`, `--timeout <ms>`, `--cpu <s>`, `--memory <mb>`, `--network`, `--allow-env <names>`, `--json` |
| `render [dir]` | Compile + headless-render generated TS/TSX in the sandbox — console logs, render tree, runtime errors before the diff | `--entry <file>`, `--file <file>`, `--timeout <ms>`, `--memory <mb>`, `--json` |
| `ci [dir]` | Self-healing CI workflow generator (EAS; GitHub Actions / Azure Pipelines / GitLab CI / Bitbucket Pipelines — detected from the git remote) | `--provider <host>` · `--dry-run` |
| `release [dir]` | Autonomous release pipeline: bump, changelog, E2E submit, crash-rate monitor (z-score anomaly detection + auto-rollout gate) | `--version`, `--changelog`, `--submit`, `--monitor`, `--baseline`, `--zscore <n>`, `--hours`, `--json` |
| `sync [dir]` | Sync team brain to a hosted git remote | `--push`, `--pull`, `--init`, `--remote <url>`, `--branch`, `--force` |
| `team-policy [dir]` | Org-wide guardrail policy: publish/pull the team policy + shared bundle budgets through the sync remote, so one policy change gates every project | `--push`, `--pull`, `--check <file>`, `--show`, `--budget <json>`, `--remove`, `--remote <url>`, `--branch`, `--force` |
| `telemetry [dir]` | Ingest Sentry/Crashlytics/traces/analytics and analyze | `--path <dir>`, `--no-analyze` |
| `daemon` | Live Metro/Hermes companion daemon | `-p <port>`, `--metro-port`, `--stop`, `--status`, `--once`, `--wire-metro`, `--no-device-probe` |
| `impact [dir]` | Cross-package blast radius of changed files (monorepo) — affected screens, navigation stacks, and the Maestro E2E flows that must run, including **accessibility variants** for screens covered by a11y criteria and flags for screens with **no deterministic route** | `--changed <files>`, `--pr <number>`, `--push`, `--json`, `--dry-run` |
| `intel [dir]` | **Project Intelligence Core (Roadmap 001-010)** — one deterministic pass: versioned project manifest + validation, workspace/monorepo discovery (pnpm/yarn/npm/turbo/lerna/nx), file→file dependency graph with circular-import cycles, AST parse-rate stats, incremental repository index (content fingerprints), component + navigation graphs, native module registry (pods/podspecs/gradle/TurboModule specs), and ranked knowledge retrieval with a sub-second benchmark — repository-wide in monorepos, writes `docs/vectalon/intel/report.{json,md}` | `--json`, `--graph <deps\|components\|navigation\|native\|manifest>`, `--search <q>`, `--bench` |
| `perf [dir]` | **Static performance scan (Roadmap Phase 4, items 021-023/027/029)** — one deterministic pass over source: render-phase `setState` (021), inline handler/literal props + unmemoized context values that defeat `React.memo` (022), heavyweight module-scope imports + entry-file side effects that delay first render (023), legacy bridge traffic (`NativeModules` / `requireNativeComponent` / `TurboModuleRegistry`) (027), and a severity-ranked, deduped recommendation engine (029) — with a markdown report to `docs/vectalon/perf/` | `--json` |
| `coverage [dir]` | Render the **coverage dashboard** (`docs/vectalon/coverage/coverage-gaps.md`) — a per-screen E2E + a11y gap summary with links to the open follow-up tasks | `--json`, `--limit <n>` |
| `smoke [dir]` | **Post-release verification** — run every CLI command against the project (dev mode by default so all features run), capture the full output of each, and report pass/warn/skip/fail; exits non-zero on any failure. Wired into the generated release workflows as a `verify` job | `--list`, `--only <ids>`, `--skip <ids>`, `--full`, `--json`, `--no-dev`, `--out <dir>`, `--timeout <ms>` |
| `bench` | RN coding-test benchmark (deterministic baseline or real-model) | `--model <provider>`, `--suite <id>`, `--live`, `--install`, `--json`, `-o <path>`, `--baseline <file>`, `--tolerance <n>` |
| `leaderboard [dir]` | Merge benchmark results into `BENCHMARK_RESULTS.md` | `--out <path>`, `--json`, `--timestamp`, `--pr-comment` |
| `archive [dir]` | **Build Archive Agent** — build (or ingest) IPA/APK/AAB, SHA-256 checksum, typed BuildManifest with full provenance (git, flavor, environment), stored under `.vectalon/builds/`; zero-config flavor detection from Gradle `productFlavors`, Xcode schemes, and `eas.json` | `--flavor`, `--platform`, `--environment`, `--env-file`, `--build-number`, `--no-build`, `--artifact`, `--list`, `--init`, `--dry-run`, `--json` |
| `distribute [dir]` | **Distribution Agent** — deploy an archived build to TestFlight, Google Play, the SaaS portal, or a generated white-label portal; credentials never stored (delegates to fastlane/EAS/Expo or direct API env vars) | `--build`, `--latest`, `--flavor`, `--platform`, `--target <testflight\|play-store\|saas\|portal>`, `--track`, `--domain`, `--list-targets`, `--dry-run`, `--json` |
| `share [dir]` | **Local Share Agent** — ephemeral static install page for an archived build, optional tunnel (ngrok/localtunnel), optional QR, auto-shutdown after `--expires` | `--build`, `--latest`, `--flavor`, `--platform`, `--port`, `--host`, `--tunnel`, `--qr`, `--expires <30m\|2h>`, `--json` |
| `portal [dir]` | **White-label Portal Agent** — generate a self-contained static build portal (SSG) from the archive store with per-build install pages + embedded `builds.json` | `--generate`, `--out <dir>`, `--domain`, `--branding`, `--deploy <static\|vercel\|netlify>`, `--json` |
| `train [dir]` | Curate fine-tuning dataset from benchmark references + LoRA plan | `--build`, `--plan`, `--out <dir>`, `--base <model>`, `--scenarios <dir>`, `--references <dir>`, `--json` |
| `ecosystem [dir]` | Browse/enable MCP servers, skills, tools, hooks — enabling an MCP verifies its npm package exists first (fail-fast; offline proceeds with a warning) | `--category <mcp\|skill\|tool\|hook>`, `--flavor <expo\|rn-cli>`, `--enable <id>`, `--force`, `--disable <id>`, `--export`, `--json` |
| `refresh [dir]` | Refresh knowledge from web sources + improvement suggestions, and re-seed the repo-derived knowledge-base artifacts (idempotent) | `--force` |
| `suggestions [dir]` | List improvement suggestions from the knowledge refresh (outdated dependencies), severity-grouped — and act on them: `--apply <id>` installs the latest version (gated behind confirmation), `--open` renders a self-contained HTML dashboard | `--json`, `--limit <n>`, `--apply <id>`, `--yes`, `--open`, `--out <dir>` |
| `auth` | Manage license/trial, activate keys, GitHub OAuth | `--license <key>`, `--github`, `--status`, `--logout` |
| `policy [dir]` | Manage project-specific guardrail policy | `--init`, `--check <file>` |
| `pull [preset]` | Download a local model preset — usage tier (`fast\|balanced\|quality`) or model id (`qwen2.5-coder-1.5b\|3b\|7b`); defaults to the tier auto-selected for this machine's RAM | `[tier-or-model-id]` |
| `models` | List usage tiers (with the auto-selected one for this machine), downloaded GGUF models, and the WASM model | — |
| `support [dir]` | Collect + upload a sanitized support bundle (logs, error queue, crash report, package.json, `.vectalon` state) with a support token | `--upload`, `--out <path>` |

### Global flags

| Flag | Description |
|------|-------------|
| `--dev` | **Dev mode** — bypass all tier/license checks. All features unlock. |
| `--diagnostics` | Write `.vectalon/diagnostics-bundle.json` (environment, last 5000 log lines, model provider, `.vectalon` state) — works on **every** command |
| `-h, --help` | Display help for command |
| `-V, --version` | Output the version number |

### Reading your reports

Every agent ends in a report. Reports never leave your project unless you
share them — three ways to read them:

1. **In the terminal** — every run prints the verdict, severity-ranked
   findings, and the fix plan to stdout; `vectalon dashboard` prints the
   aggregate across every agent.
2. **In your repo** — each agent writes `docs/vectalon/<cmd>/report.md` +
   `report.json`: plain markdown/JSON that renders on GitHub/GitLab and in
   editors, and is machine-readable for your own dashboards or CI gates.
   Gitignored by default, so reports stay local unless you commit or share
   them.
3. **One HTML file, in a browser** — `vectalon dashboard` writes a
   self-contained `docs/vectalon/dashboard/report.html` with per-agent
   drill-down, search, and severity filters. No server, works offline,
   portable: attach it to a PR or host it anywhere.

---

## Interactive Mode

Run `npx vectalon` with no arguments (Node `>=20.12`, TTY required) to launch an interactive menu powered by `@clack/prompts`:

```
? What would you like to do?
  ○ Initialize a project
  ○ Run feature workflow
  ○ Force refresh knowledge
  ○ View suggestions
  ○ Analyze bundle
  ○ Show status
  ○ Live Metro daemon
  ○ Ingest telemetry
  ○ Analyze impact
  ○ Show coverage dashboard
  ○ Run performance scan
  ○ Run post-release smoke
  ○ Generate CI workflow
  ○ Release pipeline
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
| **local** | GGUF (node-llama-cpp) | Qwen2.5-Coder presets in three auto-selected tiers — `fast` (1.5B, 8 GB RAM), `balanced` (3B, 16 GB), `quality` (7B, 32 GB). Fully offline, zero source leaves the machine. Skills inlined into system prompt. |
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

## Post-Release Verification (`vectalon smoke`)

Run **every CLI command** against the project and capture the full output of
each one, so a release can be verified end-to-end before it ships:

```bash
npx vectalon smoke                # every fast check, dev mode → .vectalon/smoke/report.{json,log,html}
npx vectalon smoke --full         # + feature workflow, bench, full selftest, model pull
npx vectalon smoke --json         # machine-readable report (CI gates)
npx vectalon smoke --only impact,coverage
npx vectalon smoke --no-dev       # respect the real tier — Pro/Team commands become skips
```

- **37 checks** cover the whole surface — version/help, init, status, models,
  auth, policy, refresh, suggestions, ecosystem, doctor, impact, coverage,
  intel, diagnostics, generate, perf, telemetry, bundle, profile, sandbox,
  render, ci, release, leaderboard, visual-ci, visual-baseline, ci-incident,
  serve (boot-probed then killed), daemon, sync, team-policy, support;
  `--full` adds feature, bench, selftest, pull
- **Full captured output** per command lands in `report.log` (readable),
  `report.json` (CI), and an HTML dashboard; the terminal streams each check
  live and prints a summary table
- **Always runs in dev mode** — every check runs with `VECTALON_DEV_MODE=1`, so
  Pro/Team features (bundle, sandbox, ci, visual-ci, ci-incident, team-policy)
  execute for real instead of hitting the license gate; pass `--no-dev` to
  respect the actual tier. Commands that need inputs a project lacks (Hermes
  profile files, a sync remote) stay `skip` with reasons
- **Clean output** — captured stdout/stderr is ANSI-stripped and children run
  with `FORCE_COLOR=0`, so `report.log` / the HTML dashboard contain plain
  text with no escape codes or gate-promo noise
- **Honest classification** — exit 0 or an ok-exit (doctor) is `pass`;
  non-zero exits and timeouts are `fail`; exit code is 1 on any failure
- **Runs after every release** — the generated release workflows
  (`.github/workflows/vectalon-release.yml`, `.eas/workflows/vectalon-release.yml`)
  include a `verify` job that runs `vectalon smoke --full --json` after
  quality, so a broken command surface blocks submission

## Project Intelligence Core (`vectalon intel`)

One deterministic pass (Roadmap Phase 1, items 001-010) that maps the whole
project — canonical manifest (versioned schema + validation), workspace /
monorepo discovery (pnpm, yarn, npm, turbo, lerna, **nx**), file → file
dependency graph with **circular-import cycles**, AST parse-rate statistics,
an **incremental** repository index (content fingerprints — re-index only
changed files), component + navigation graphs, a native module registry
(Podfile pods, podspecs, Gradle includes, TurboModule specs), and **ranked
knowledge retrieval** with a sub-second benchmark:

```bash
npx vectalon intel --bench                 # full report + retrieval benchmark
npx vectalon intel --search "login screen" # ranked retrieval with timings
npx vectalon intel --graph deps            # export the dependency graph as JSON
npx vectalon intel --model                 # the application digest (see below)
```

### Intel is the foundation of everything

`docs/vectalon/intel/report.json` is the **canonical Project Intelligence
model**, and `readProjectIntel()` is the one door every agent consumes —
`fix`, `upgrade` (impact), and the rest read the same model instead of
independently rediscovering the repository. Fresh by default (15 min), it
re-runs one incremental pass per process when stale, and never blocks when
unavailable (consumers fall back to direct reads). That is the moat: a
generic coding agent sees **files**; Vectalon sees an **application** —
screens, navigation, state, native modules, dependencies, build config,
tests, telemetry, architecture, team decisions:

```
application
 ├── screens        (18)   Onboarding, Login, Signup, ForgotPassword, Home, Catalog …
 ├── navigation     (1)  Stack
 ├── state          (1)  CartContext
 ├── native modules (0)
 ├── dependencies   (7, 4 native)
 ├── source files   (51)
 └── architecture   (components 27 · cycles 0)
```

In a monorepo the scan is repository-wide — every member package's source is
indexed when the target is a workspace root. Reports land in
docs/vectalon/intel/report.{json,md} (gitignored). Deterministic — no model
calls; the hash embeddings run offline.

## Project Diagnostics (`vectalon diagnostics`)

One deterministic pass (Roadmap Phase 2, items 011-015) that validates the
build/toolchain surface and suggests a **concrete fix for every finding**:

```bash
npx vectalon diagnostics                          # full report → docs/vectalon/diagnostics/
npx vectalon diagnostics --gradle-log build.log   # classify a Gradle failure's root cause + fix
npx vectalon diagnostics --xcode-log build.log    # classify an Xcode failure's root cause + fix
```

- **Metro (011)** — config shape, alias targets resolve? watchFolders in
  monorepos, cache advice
- **Hermes (012)** — `hermesEnabled` / `newArchEnabled` checked against a
  known-issue database (disabled Hermes, New-Arch without Hermes, legacy RN)
- **Android / Gradle (013)** — compileSdkVersion, daemon heap, plus a log
  parser covering the top RN build errors (SDK/AGP/resolution/AAPT/NDK/Java/
  network/OOM) with the standard fix for each
- **iOS / Xcode (014)** — Podfile + deployment target, plus a log parser for
  CocoaPods, signing, linker, plist, and Xcode-version failures
- **Dependencies (015)** — peer checks against an RN ecosystem matrix and
  duplicate versions across monorepo members

Each check is `pass` / `warn` / `fail` / `info` with a fix line. Monorepo
members are scanned (Metro config also read at the workspace root). Reports
land in docs/vectalon/diagnostics/report.{json,md} (gitignored).

## Code Generation (`vectalon generate`)

Deterministic templates (Roadmap Phase 2, items 016-020) written into the
project — or previewed with `--dry-run`:

```bash
npx vectalon generate component UserCard                 # → src/components/UserCard.tsx
npx vectalon generate screen Profile                     # → src/screens/Profile.tsx (navigation wired)
npx vectalon generate test UserCard                      # → __tests__/user-card.test.tsx (Jest RTL)
npx vectalon generate test UserCard --framework detox    # Detox E2E instead
npx vectalon generate native-module CameraScanner --spec '{"moduleName":"CameraScanner"}'
npx vectalon generate api OrdersApi --spec openapi.json  # typed client + apiBase.ts
```

- **Component (016)** — functional TS + StyleSheet (`--no-typescript`, `--no-styles`, `--navigation`)
- **Screen (017)** — component with React Navigation hooks
- **Native module (018)** — iOS (ObjC++) + Android (Kotlin) scaffold, `--api rn-cli` (TurboModule) or `expo`, from a JSON spec
- **Test (019)** — Jest `@testing-library/react-native` or Detox test
- **API client (020)** — typed service class + `apiBase.ts` (ApiError) from an **OpenAPI spec**: path params, request bodies, response types, error handling

## Static Performance Scan (`vectalon perf`)

One deterministic pass (Roadmap Phase 4, items 021-023, 027, 029) over the
project's source — no build, no device, no model calls:

```bash
npx vectalon perf                      # findings + markdown report → docs/vectalon/perf/
npx vectalon perf --json               # machine-readable report (CI)
```

- **Render profiler / re-render detector (021-022)** — render-phase
  `setState` calls (error), and the memo-defeating patterns that re-render
  subtrees: 2+ inline arrow handlers on one element, inline object/array
  literal props, and unmemoized `<X.Provider value={{…}}>` context values
- **Startup analyzer (023)** — heavyweight module-scope imports (moment,
  lodash, rxjs, d3, three, Skia, victory-native, tfjs, realm, ffmpeg) and
  top-level side effects in entry files (index.*, App.*) that delay first
  render
- **Bridge traffic analyzer (027)** — legacy bridge usage that blocks or
  bypasses the New Architecture: direct `NativeModules.X.method()` calls,
  `requireNativeComponent`, and `TurboModuleRegistry.get(...)` access
  (warning severity in JSX/TSX render paths, info in service files)
- **Recommendation engine (029)** — severity-ranked (error → warning → info),
  deduplicated fix suggestions, surfaced as the report's top 3

Reports land in docs/vectalon/perf/report.{json,md} (gitignored). Complements
`vectalon profile` (measured runtime data) and `vectalon bundle` (bundle
budgets): `perf` catches the static hazards before you ever profile.

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
│   │   ├── commands/           # 30 CLI command files
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

© 2026 Vectalon. Commercial use requires a paid license.

- **Free**: Personal use, education, open source, teams ≤3 developers
- **Paid**: Teams >3 developers — starting at $19/month

See [LICENSE](../LICENSE) for full terms.
