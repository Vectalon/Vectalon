# vectalon CLI Reference

Complete reference for the `vectalon` command-line interface. Every command is
available as `npx vectalon <command>` (or `vectalon <command>` when installed
globally or linked).

Running `npx vectalon` with no arguments opens an **interactive menu** covering
the most common actions (init, feature, refresh, impact, ecosystem, doctor,
bench, bundle, daemon, telemetry, ci, release, train, leaderboard, sync,
policy, serve, import, pull, models, help).

---

## Conventions

- **Exit code `0`** — success.
- **Exit code `1`** — error: missing `.vectalon/` directory, unknown argument
  value, missing required input, or an operation that failed.
- Most commands take an optional `[directory]` argument; when omitted they act
  on the current working directory.
- Several commands require a `.vectalon/` directory first — run
  `vectalon init` to create it.

---

## `init`

Initialize vectalon in a React Native project: scan the codebase, build the
context snapshot, detect tooling (Expo vs bare RN-CLI), set up the model
provider, and enable the recommended ecosystem items.

```bash
npx vectalon init                  # scan cwd and create .vectalon/
npx vectalon init ./my-app         # scan a specific directory
npx vectalon init --model local    # use the local Qwen2.5-Coder provider
npx vectalon init --model wasm     # zero-config ONNX/WASM provider (downloads on first use)
npx vectalon init --model openai   # remote OpenAI provider (reads OPENAI_API_KEY)
npx vectalon init --model anthropic  # remote Anthropic provider (ANTHROPIC_API_KEY)
npx vectalon init --model azure-openai  # Azure OpenAI deployments (AZURE_OPENAI_API_KEY)
npx vectalon init --model groq     # Groq fast inference (GROQ_API_KEY)
npx vectalon init --model ollama   # local Ollama server — no API key
npx vectalon init --model vllm     # local vLLM server — no API key
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root to scan (default: cwd) |
| `--model <provider>` | Default model provider: `local` \| `wasm` \| `openai` \| `anthropic` \| `azure-openai` \| `groq` \| `ollama` \| `vllm` |

**What it does**

- Scans `package.json`, `src/`, metro config, TypeScript setup, navigation
  patterns → writes `snapshot.json`, `context.md`, `memory.json`
- Adds **`.vectalon/` to the project's `.gitignore`** (creating the file when
  missing) — the workspace is per-machine runtime state and stays untracked
- Detects **Expo-managed vs bare RN CLI** (`tooling` + Expo SDK version) and
  records it in `.vectalon/rn-vectalon.json`
- Sets up the **model provider**: local download (Qwen2.5-Coder, ~1.1 GB,
  offered interactively), zero-config WASM (ONNX/Qwen2.5-Coder, downloads on
  first use), or a remote provider with env-var API keys (keys are never
  written to disk)
- Enables the **flavor-appropriate ecosystem items** (Expo MCP/skills for Expo
  projects; Upgrader MCP/rn-diff-purge for bare RN-CLI) plus the shared baseline
- Scans `package.json` dependencies and **auto-enables matching ecosystem
  items** (zustand, gesture-handler, reanimated, mmkv, flash-list, husky,
  lint-staged, …), logging each detection

**Exit codes**

| Code | When |
|---|---|
| 0 | Project initialized |
| 1 | Unknown `--model` provider |

**Output** — `.vectalon/` containing `snapshot.json`, `context.md`,
`memory.json`, `rn-vectalon.json` (manifest), and `ecosystem.json`. The
workspace is **gitignored**; team-visible workflow documents are written to
`docs/vectalon/<workflow>/<run>/` instead.

---

## `serve`

Start the MCP server so any agent (Claude Code, OpenCode, Codex CLI, Cursor,
Windsurf) can connect for project-aware assistance.

```bash
npx vectalon serve                    # MCP over stdio (default)
npx vectalon serve --protocol stdio   # stdio
npx vectalon serve --protocol http --port 8931   # HTTP for Codex CLI etc.
npx vectalon serve --model openai     # override the model provider for this run
```

**Options**

| Option | Description |
|---|---|
| `-p, --port <number>` | HTTP server port (default `0` = auto-assign) |
| `--protocol <type>` | `mcp` \| `stdio` \| `sse` \| `http` (default `mcp`) |
| `--model <provider>` | Model provider: `local` \| `wasm` \| `openai` \| `anthropic` \| `azure-openai` \| `groq` \| `ollama` \| `vllm` |

**What it does**

- Exposes **58 built-in MCP tools** — 50 by default, plus the knowledge-base
  and team-brain tools when those services are present (project context, SDLC
  modules, devices & E2E incl. screen-reader control, cross-package impact,
  release planning & crash monitoring, training-dataset curation, sandboxed
  execution, headless component rendering, knowledge base, team brain)
- Reads `.vectalon/ecosystem.json` and exposes each **enabled ecosystem MCP
  server as a first-class tool** (Metro MCP, Expo MCP, …) agents auto-discover
- Loads the resolved model provider from the manifest (or `--model`) and logs
  it at startup, warning when a remote API key is missing
- Registers sibling projects from `.vectalon/team.json` (team brain)

**HTTP transport (Codex CLI, web dashboards, remote IDEs)**

When `--protocol http` is used, the server exposes a JSON API in addition to
advertising the tool list, so HTTP-based agents can actually invoke tools:

| Endpoint | Method | Purpose |
|---|---|---|
| `/` or `/tools` | GET | Tool discovery — returns `{ tools, status }` |
| `/call` | POST | Invoke a tool — body `{ id?, name, arguments }` |
| `/invoke` | POST | Alias for `/call` |

Tool calls return the tool result as JSON (`{ id, content, isError? }`), with
`400` for malformed bodies, `404` for unknown tools/paths, `405` for wrong
methods, and `500` when a tool handler errors. Responses include CORS headers
so browser-based dashboards can call the server directly.

```bash
# Discover tools
curl http://localhost:8931/tools

# Call a tool
curl -X POST http://localhost:8931/call \
  -H 'Content-Type: application/json' \
  -d '{"name":"get_project_context","arguments":{}}'
```
- Starts a **background knowledge refresh** scheduler (hourly) and runs an
  immediate refresh when the cache is stale

**Exit codes**

| Code | When |
|---|---|
| 0 | Server running (until stopped) |
| 1 | No `.vectalon/` directory found |

---

## `daemon`

Run the **live Metro/Hermes companion daemon** in the background. Instead of
waiting for CLI commands, the daemon hooks into the dev loop and records what
it learns: Metro build events (bundle size + build errors) and Hermes JS-thread
health.

```bash
npx vectalon daemon                    # start the background daemon
npx vectalon daemon --status           # show whether it is running (pid, port, health)
npx vectalon daemon --stop             # stop a running daemon
npx vectalon daemon --once             # single probe pass, then exit (CI-friendly)
npx vectalon daemon --wire-metro       # also patch metro.config.js to use the reporter
npx vectalon daemon --no-device-probe  # disable the Hermes JS-thread probe loop
```

**Options**

| Option | Description |
|---|---|
| `-p, --port <number>` | Daemon HTTP port (default `0` = auto-assign; written to `.vectalon/daemon.json`) |
| `--metro-port <number>` | Metro dev-server port for the Hermes probe (default `8081`) |
| `--stop` | Stop a running daemon via its state file |
| `--status` | Show daemon status (running pid, port, started-at, health) |
| `--once` | Run a single probe pass (Metro status + Hermes latency) and exit |
| `--no-device-probe` | Disable the 30s Hermes JS-thread probe loop |
| `--wire-metro` | Patch `metro.config.js` to use the generated reporter |

**What it does**

- Writes a generated **Metro reporter** to `.vectalon/metro/vectalon-reporter.js`
  that POSTs `bundle_build_done` / `bundle_build_failed` events to the daemon's
  HTTP endpoint (auto-wired into `metro.config.js` with `--wire-metro`; the
  daemon prints the one-line manual wiring for other setups)
- On every successful build, **snapshots bundle composition** into the knowledge
  base (reusing the `bundle` command's budget analyzer) and diffs it against the
  previous build in the session, logging **proactive tips** when a build adds a
  library or grows a module ("your last Metro build added lodash — +80 KB")
  and persisting them as bounded `engineering` artifacts
- Persists **build failures** as deduped artifacts (by content checksum) so a
  failure that scrolls past in the terminal stays in the knowledge base
- Probes **Hermes JS-thread health** every 30s over the Metro WebSocket (CDP)
  and records latency spikes as probe artifacts
- Exposes `GET /health` (status, event count, last probe) and
  `POST /metro/event` (reporter ingest) on its port; the state file at
  `.vectalon/daemon.json` lets `--stop`/`--status` find the live pid, and a
  second `vectalon daemon` refuses to double-run

**Exit codes**

| Code | When |
|---|---|
| 0 | Daemon started / status shown / stopped / single pass completed |
| 1 | No `.vectalon/` directory found, or a daemon is already running |

---

## `feature`

Run the end-to-end feature-development SDLC workflow from a single prompt — or
headlessly from a PM ticket with `--ticket`.

```bash
npx vectalon feature "create a login screen and integrate the auth API"
npx vectalon feature "remove unused imports" --dry-run     # safe preview
npx vectalon feature "remove unused imports" --push        # commit, push, open PR
npx vectalon feature "add login screen" --device           # include iOS/Android builds
npx vectalon feature "fix all lint issues" --heal-attempts 5
npx vectalon feature "fix all lint issues" --heal-interactive
npx vectalon feature "add login screen" --resume <state-id> --from implementation
npx vectalon feature --ticket MOB-123 --push   # ticket-to-PR: read the ticket, run the
                                               # workflow, open a real PR with a review comment
```

**Options**

| Option | Description |
|---|---|
| `<prompt>` | The feature request (required) |
| `--workflow <id>` | Workflow to run (default `feature-development`) |
| `--resume <state-id>` | Resume a previous workflow state |
| `--from <phase-id>` | Start from a specific phase when resuming |
| `-o, --output <path>` | Write workflow output to a file |
| `--json` | Output as JSON |
| `--verbose` | Show full phase output |
| `--dry-run` | Simulate adapters without running real commands |
| `--model <provider>` | Model provider: `local` \| `wasm` \| `openai` \| `anthropic` \| `azure-openai` \| `groq` \| `ollama` \| `vllm` |
| `--push` | Allow git push and PR creation (default: local branch/commit only) |
| `--device` | Run device/simulator build checks during verification |
| `--heal-interactive` | Prompt before applying each self-healing review fix |
| `--heal-attempts <n>` | Max review→fix→re-review cycles (default 3) |
| `--heal-severity <level>` | Lowest severity that heals: `error` \| `warning` \| `info` |
| `--ticket <key>` | Read a ticket from the PM adapter (Jira/GitHub/Monday) and run the workflow headlessly from its title + description. The positional prompt becomes optional when this is set |

**What it does**

- Classifies the prompt with **LLM intent detection** (`add-feature` / `fix` /
  `refactor` / `remove-dependency` / `unknown`), surfacing e.g.
  `Detected intent: fix/lint — LLM, confidence 0.95`
- Runs 13 phases: PRD → scope → design → architecture → tasks → **TDD tests**
  → implementation → **self-healing code review** → verification →
  readiness → PR → documentation → close
- With **`--ticket <key>`**, reads the ticket through the PM adapter
  (deterministic stub when no provider is configured) and uses its title +
  description as the workflow prompt — the full **ticket-to-PR pipeline**: the
  self-healing loop fixes findings and re-runs checks, verification gates on
  tests/lint/typecheck, and `--push` opens a real PR with the code-review
  report posted as a review comment
- Writes each phase's document to **`docs/vectalon/<workflow>/<run>/`** (under
  the project's `docs/`, so the team sees them in version control — not in the
  gitignored `.vectalon/` workspace)
- Applies **guardrails** (25 rules + `.vectalon/policy.json`) before writing
  files, and streams **live diffs** for every code change
- **Zero-config WASM**: with no GGUF model downloaded and the tier enabled,
  a `local` run auto-tiers to the ONNX/WASM model — weights download on first
  use and the deterministic stub only remains as the fallback
  (`RN_VECTALON_NO_WASM=1` disables)
- Runs the project's `test`/`lint`/`prettier`/`typecheck` scripts during
  verification (device builds only with `--device`)
- Prints an "upgrade suggestions available" section from
  `.vectalon/knowledge/refresh/suggestions.json` when present

**Exit codes**

| Code | When |
|---|---|
| 0 | Workflow completed successfully |
| 1 | No `.vectalon/`, unknown workflow, unknown provider, or workflow failure |

---

## `ecosystem`

Browse and manage the external tooling catalog — MCP servers, agent skills,
developer tools, and git hooks for React Native / Expo.

```bash
npx vectalon ecosystem                      # list the full catalog
npx vectalon ecosystem --category mcp       # only MCP servers
npx vectalon ecosystem --flavor expo        # only Expo-flavored items
npx vectalon ecosystem --enable metro-mcp   # enable an item
npx vectalon ecosystem --disable maestro    # disable an item
npx vectalon ecosystem --export             # emit MCP client config fragment
npx vectalon ecosystem --export --json      # ... as JSON
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--category <type>` | `mcp` \| `skill` \| `tool` \| `hook` |
| `--flavor <type>` | `expo` \| `rn-cli` |
| `--enable <id>` | Enable an ecosystem item |
| `--disable <id>` | Disable an enabled item |
| `--export` | Export enabled items as an MCP client config fragment |
| `--json` | Print the export as JSON |

**Exit codes**

| Code | When |
|---|---|
| 0 | Success (list / enable / disable / export) |
| 1 | Unknown category, unknown flavor, or unknown item id |

---

## `doctor`

Verify that every enabled ecosystem item is installed and reachable, that the
native toolchain is ready to build and run the project, and that the **nightly
leaderboard prerequisites** are met so a scheduled leaderboard run doesn't
fail silently.

```bash
npx vectalon doctor                 # human-readable report
npx vectalon doctor --json          # machine-readable report
npx vectalon doctor --fix           # auto-install missing items, then re-check
npx vectalon doctor ./my-app        # check a specific project
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--json` | Print the report as JSON |
| `--fix` | Auto-install missing ecosystem items and toolchain components, then re-check |

**Checks**

- **Ecosystem items** — MCP packages resolve locally or respond to a bounded
  probe; tools/hooks resolve from `node_modules` or respond on `PATH`; skills
  exist under `.vectalon/skills/` or `.agents/skills/`
- **Native toolchain** — Node 20+ (18–19 warns), JDK 17+, Android SDK
  (`ANDROID_HOME`/`adb`), Android emulator AVDs, Xcode & CocoaPods (macOS
  only), Metro dev-server port 8081
- **Nightly leaderboard readiness (M5)** — `OPENAI_API_KEY` and
  `ANTHROPIC_API_KEY` secrets set (warn when unset), the default Qwen local
  model downloaded (warn with a `vectalon pull` hint), and `bench/results/`
  present + writable (missing with a `mkdir -p bench/results` hint)

Every check prints a status (`OK`/`MISSING`/`WARN`) with an actionable fix
hint. Toolchain checks run even without an ecosystem config.

**`--fix` auto-remediation**

For every missing check, `doctor --fix` runs the install command and re-checks:

- **npm tools/hooks** — `npm install <package>` (MCP servers install as
  devDependencies with `-D`)
- **Skills** — the catalog's `npx skills add …` command
- **Expo MCP** — `npm install expo` (the CLI it runs through)
- **JDK** — `brew install --cask temurin@17` (macOS)
- **CocoaPods** — `brew install cocoapods`
- **Fastlane** — `gem install fastlane`; **EAS CLI** — `npm install -g eas-cli`
- **Results directory** — `mkdir -p bench/results`

Checks that can't be safely automated (Node via nvm, Android Studio SDK,
emulator AVDs, Xcode, API-key secrets, model downloads) are reported as
`SKIPPED` with their manual hint. The
fix summary prints `before missing → after missing`; install commands run in the
project root with a generous timeout. Manual-only toolchain checks that fail
still cause exit code 1.

**Exit codes**

| Code | When |
|---|---|
| 0 | No missing checks (after `--fix`, if given) |
| 1 | One or more checks are still missing |

---

## `selftest`

Test **every feature of the harness** in isolated temp sandboxes — CLI
commands, SDLC modules, guardrails, knowledge base, harness scanner, model
router, MCP tools, workflows, ecosystem, bench, adapters, and memory. The
suite is deterministic and offline (no model calls, no network, no changes to
your project) and produces a **visible report** plus a full **activity trace**
so clients can see exactly what the package does: every step, every shell
command, and every file created or modified.

```bash
npx vectalon selftest               # run all checks, write report + dashboard
npx vectalon selftest --list        # list every check id and exit
npx vectalon selftest --category knowledge   # only the knowledge category
npx vectalon selftest --only sdlc-git-derivation  # a single check
npx vectalon selftest --json        # print the JSON report to stdout (CI)
npx vectalon selftest --open        # open the HTML dashboard in the browser
npx vectalon selftest --out ./reports  # write artifacts elsewhere
```

**Live progress.** Results stream to stderr as each check finishes — a
clack-style spinner + progress bar while running in a TTY, plain `✔`/`✖`/`⚠`
status lines when piped or in CI — so a failing check is visible the moment it
happens, before the suite finishes. The final summary is printed to stdout.

**Real model inference.** The `model-inference` check runs an **actual**
inference through the configured provider — local GGUF (via `vectalon pull`),
the zero-config WASM runtime (when weights are cached), or a remote API — and
verifies the model-generated output. It never passes on the deterministic
fallback stub: if no model or API key is available it **warns** with the exact
command to enable real inference (or **fails** under `--require-model`).

**Output** (written to `.vectalon/selftest/` by default)

| File | Contents |
|---|---|
| `report.json` | Raw report for CI ingestion (checks, statuses, steps, durations) |
| `report.log` | Human-readable activity trace: every step, command, and file write |
| `report.html` | Self-contained dashboard (no network) with per-check cards and expandable activity traces |

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) — only used for the report output dir |
| `--category <cat>` | Run only one category (`cli`, `sdlc`, `guardrails`, `knowledge`, `harness`, `model`, `mcp`, `workflows`, `ecosystem`, `bench`, `adapters`, `memory`, `upgrade`, `perf`, `sandbox`, `render`) |
| `--only <id>` | Run a single check by id |
| `--model <provider>` | Force the model provider for the real-inference check: `local` \| `wasm` \| `openai` \| `anthropic` \| `azure-openai` \| `groq` \| `ollama` \| `vllm` (default: the project's configured provider, or `local`) |
| `--require-model` | Fail (instead of warn) when the inference check cannot run a real model (no downloaded GGUF / WASM weights, no API key) — for CI runs that guarantee a model |
| `--list` | Print every check id and exit |
| `--json` | Print the JSON report to stdout instead of writing files |
| `--no-html` | Skip writing the HTML dashboard |
| `--open` | Open the HTML dashboard in the browser after the run |
| `--out <dir>` | Report output directory (default `.vectalon/selftest`) |
| `--verbose` | Echo every recorded activity step to the terminal after the run |

**Exit codes**

| Code | When |
|---|---|
| 0 | No check failed (warnings are allowed) |
| 1 | One or more checks failed, or an unknown `--category`/`--only` value |

---

## `bundle`

Build the Metro bundle and enforce **performance budgets** — fully deterministic,
no model calls. Static checks always run against the project on disk; a real
`react-native bundle --json` build snapshots the composition into the knowledge
base and warns when it grows vs the previous snapshot.

```bash
npx vectalon bundle                         # build iOS bundle + run all budgets
npx vectalon bundle --platform android      # build the Android bundle instead
npx vectalon bundle --static                # on-disk static checks only (no build)
```

**What it checks**

- **Large libraries** — direct dependencies adding >100 KB to the bundle
  (per-package size from the Metro module map)
- **Missing `sideEffects: false`** — installed deps without it can keep dead
  code in the tree-shaking pass
- **Unoptimized images** — png/jpeg/gif files over 200 KB (non-WebP) in
  `assets`/`src/assets`/`app/assets`/`res`
- **Oversized assets** — files over 1 MB in those asset directories
- **Bundle growth** — each snapshot is stored in the knowledge base
  (`.vectalon/knowledge/artifacts.json`, type `analytics`; the last 10 per
  platform are kept); the command prints the delta vs the previous snapshot for
  the same platform. Snapshot sizes are measured with `--minify false`, so they
  track *composition* trends rather than exact production sizes

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--platform <type>` | `ios` \| `android` (default `ios`) |
| `--static` | Skip the Metro build; static on-disk checks only |

**Exit codes**

| Code | When |
|---|---|
| 0 | Budgets met (or run completed with only informational findings) |
| 1 | Missing `.vectalon/` directory |

---

## `ci`

Generate (or verify) the project's CI workflow for the vectalon-generated
branch — the first step of the self-healing CI pipeline. Idempotent: an
existing workflow is never overwritten.

```bash
npx vectalon ci            # EAS Workflows for Expo, GitHub Actions for bare RN CLI
npx vectalon ci ./my-app
```

**What it does**

- **Expo projects** — writes `.eas/workflows/vectalon.yml` running the
  project's lint/typecheck/format/test scripts on every pull request
- **Bare RN CLI projects** — writes `.github/workflows/vectalon-ci.yml` with a
  `quality` job (lint/typecheck/format/test from the actual `package.json`
  scripts, corepack-enabled for Yarn/pnpm, npm-ci / frozen-lockfile installs)
  plus a `native` job on `macos-latest` when detected validation commands
  (pod install, gradle) exist
- The same files are auto-generated by the workflow's PR phase on every
  `--push` run, so `vectalon ci` is only needed to add CI to an existing repo
  or to (re)generate after script changes

**Exit codes**

| Code | When |
|---|---|
| 0 | Workflow generated (or already present) |
| 1 | No `.vectalon/` directory found |

---

## `release`

Run the **autonomous release & monitor pipeline**: detect the version bump from
git history, generate the changelog, write the release workflow (E2E on a
device farm + store submission), and monitor the crash rate after the release
ships.

```bash
npx vectalon release                          # plan: version bump + changelog
npx vectalon release --changelog              # print only the changelog
npx vectalon release --submit                 # write the release workflow
npx vectalon release --monitor                # monitor crash rate (24h window)
npx vectalon release --monitor --telemetry telemetry/ --zscore 4   # tighter gate
npx vectalon release --monitor --telemetry telemetry/ --baseline 2.5  # ratio check
npx vectalon release --version 2.1.0          # explicit current version
npx vectalon release --json                   # release plan as JSON
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--version <v>` | Current version (default: `package.json` version) |
| `--changelog` | Print only the generated changelog and exit |
| `--submit` | Write the release workflow — EAS Workflows for Expo, GitHub Actions for bare RN CLI (quality → Maestro E2E on the device farm → store submission → scheduled 24h monitor) |
| `--monitor` | Ingest telemetry and monitor the crash rate for spikes — **z-score anomaly detection** on the time series when crashes have timestamps (see below) |
| `--telemetry <dir>` | Telemetry exports directory for `--monitor` (default `.vectalon/telemetry`) |
| `--baseline <rate>` | Baseline crash rate per 1k sessions for the classic ratio spike check (overrides z-score) |
| `--zscore <n>` | Z-score threshold for anomaly detection (default `3` = baseline + 3σ) |
| `--hours <n>` | Monitoring window in hours (default `24`) |
| `--json` | Print the release plan as JSON |

**What it does**

- **Detects the version bump** from `git log --oneline` history: breaking
  changes → `major`, `feat` → `minor`, `fix`/`chore`/… → `patch`
- **Generates the changelog** from commit messages with the same deterministic
  categorizer as the `write_release_notes` tool
- **`--submit`** writes `.eas/workflows/vectalon-release.yml` (Expo) or
  `.github/workflows/vectalon-release.yml` (bare RN CLI) — idempotent, never
  overwrites. The workflow runs quality checks, **Maestro E2E flows** on the
  device farm (when `.maestro/` exists), submits to **App Store Connect /
  Play Console** (EAS submit / fastlane), and schedules a **24h crash-rate
  monitor** job
- **`--monitor`** ingests Sentry / Crashlytics exports via the telemetry
  service. With timestamped crashes it runs **z-score anomaly detection**:
  crashes are bucketed into hourly windows (rates normalized to crashes per
  1k sessions/day), the historical buckets form a mean + stdDev baseline, and
  a window exceeding **baseline + n·stdDev** (default 3σ) auto-files an
  incident **and suggests a rollback** — the auto-rollout gate. After each
  healthy window the baseline is persisted in the knowledge base (a
  `telemetry` artifact), so the next release compares against accumulated
  history; a spike window never overwrites it. Thin history reports a
  `watch`; untimestamped exports or an explicit `--baseline` fall back to the
  classic ratio check (rate vs baseline × threshold, default 2×)

**Exit codes**

| Code | When |
|---|---|
| 0 | Plan printed / workflow written / monitor completed |
| 1 | No `.vectalon/` directory found |

---

## `train`

Curate the **fine-tuning dataset** for an RN code model from the benchmark's
human reference solutions, and generate the LoRA training plan. The GPU
training itself runs outside the repo — this command produces the dataset and
the deterministic plan, and the benchmark suite is the eval harness.

```bash
npx vectalon train                         # build the dataset (default)
npx vectalon train --plan                  # dataset + LoRA training plan
npx vectalon train --base deepseek-coder-1.3b
npx vectalon train --out ./training-data
npx vectalon train --scenarios ./my-evals --references ./my-refs
npx vectalon train --json                  # dataset stats as JSON
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--build` | Build the fine-tuning dataset (default) |
| `--plan` | Also generate the LoRA training plan |
| `--out <dir>` | Dataset output directory (default `.vectalon/training`) |
| `--base <model>` | Base model: `qwen2.5-coder-1.5b` \| `qwen2.5-coder-3b` \| `deepseek-coder-1.3b` |
| `--scenarios <dir>` | Custom benchmark scenario pack (default `bench/scenarios`) |
| `--references <dir>` | Custom reference-solutions directory (default `bench/references`) |
| `--json` | Print the dataset/plan as JSON |

**What it does**

- Pairs every benchmark scenario's **prompt + fixture project context** with
  its **gold reference implementation** as a ChatML conversation
  (`system` = RN expert rules → `user` = prompt + project files → `assistant`
  = reference files)
- Writes `rn-finetune-dataset.jsonl` (one ChatML conversation per line —
  unsloth / axolotl / LLaMA-Factory / transformers compatible) plus a
  `manifest.json` with per-example ids and token stats
- `--plan` prints the **LoRA training plan**: base model, rank/alpha/dropout
  + target modules, epochs scaled to dataset size, learning rate, and the
  install → train → GGUF-convert → eval command chain
- The eval step is the benchmark harness: `vectalon bench --model local
  --live --install` scores the fine-tuned model against the same scenarios
  the dataset was curated from

**Exit codes**

| Code | When |
|---|---|
| 0 | Dataset written (and plan printed with `--plan`) |
| 1 | No `.vectalon/`, or unknown `--base` model |

---

## `telemetry`

Ingest runtime telemetry exports (Sentry events, Firebase Crashlytics reports,
performance traces, analytics JSON/JSONL) into the knowledge base as telemetry
artifacts, then run data-driven crash / incident / KPI analysis.

```bash
npx vectalon telemetry                          # ingest .vectalon/telemetry or telemetry/
npx vectalon telemetry --path ./exports          # ingest a specific dir or file
npx vectalon telemetry --no-analyze              # ingest only, skip analysis
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--path <dir>` | Telemetry exports directory or file (default `.vectalon/telemetry` or `telemetry/`) |
| `--no-analyze` | Ingest only; skip crash/incident/KPI analysis |

**What it does**

- Parses Sentry / Crashlytics / trace / analytics JSON or JSONL exports into
  typed telemetry artifacts (`telemetry` type) in the knowledge base
- Runs the `analyze_crash`, `analyze_incident`, and `analyze_kpis` analyzers
  over the ingested events and persists the analyses

**Exit codes**

| Code | When |
|---|---|
| 0 | Telemetry ingested (analysis failures are reported, not fatal) |
| 1 | No `.vectalon/` directory found |

---

## `bench`

Score the harness — or any model — on the RN coding tests benchmark.

```bash
npx vectalon bench                          # deterministic baseline (offline)
npx vectalon bench --suite data-flow        # only the data-flow suite
npx vectalon bench --live                   # run real tests/typecheck/lint
npx vectalon bench --live --install         # ... installing deps in each temp project first
npx vectalon bench --model local            # real-model leaderboard (all 11)
npx vectalon bench --model wasm             # zero-config WASM model pass
npx vectalon bench --model openai --json    # JSON summary for tooling
npx vectalon bench -o report.md             # write the report to a file
npx vectalon bench --scenarios ./my-evals   # run your own custom eval pack
npx vectalon bench --scenarios ./my-evals --references ./my-refs  # + custom human baselines
npx vectalon bench --baseline bench/baseline.json  # CI regression gate (exit 1 on regression)
```

**Options**

| Option | Description |
|---|---|
| `--model <provider>` | `local` \| `wasm` \| `openai` \| `anthropic` \| `azure-openai` \| `groq` \| `ollama` \| `vllm` — run the real-model pass |
| `--suite <id>` | Only one suite: `core-ui` \| `data-flow` \| `forms-security` \| `navigation` \| `a11y` \| `perf` \| `refactor` |
| `--live` | Run real tests/typecheck/lint for correctness (slow) |
| `--install` | `npm install` each temp project before the live checks (use with `--live` when the fixture project has a `package.json` but no `node_modules`) |
| `--json` | Print a JSON summary instead of markdown |
| `-o, --output <path>` | Write the report to a file |
| `--scenarios <dir>` | Override the scenarios directory (default `bench/scenarios`) |
| `--references <dir>` | Override the human reference-solutions directory (default `bench/references`) |
| `--baseline <file>` | Compare the deterministic run against a stored baseline JSON and **exit 1 on any axis regression** — the CI gate. Pass `bench/baseline.json` to run the gate; without the flag the gate does not run |
| `--tolerance <fraction>` | Max allowed axis drop before a regression is flagged (default `0.01`). Cannot be combined with `--model` |

**Custom scenario packs** — teams can author their own RN evals without a PR.
Scenarios live in a user-supplied directory (any nesting depth) as versioned
JSON files (see `docs/BENCHMARK_PLAN.md` for the spec shape). Files that fail
validation — wrong `specVersion`, missing fields, unknown axes, duplicate ids —
are reported as warnings and skipped, and the command exits `1` if nothing ran.
Pair them with `--references` to score relative-to-human against your own
reference solutions.

**CI regression gate (M4)** — `--baseline <file>` compares the deterministic
run against a committed baseline (`bench/baseline.json`) and exits `1` when any
scored axis drops more than the tolerance, a baseline scenario stops running,
or a suite/overall composite regresses. The GitHub Actions `bench` job runs
this on every PR (`.github/workflows/ci.yml`). Regenerate the baseline after
intentional improvements with:

```bash
npx vectalon bench --json -o bench/baseline.json
```
**What it does**

- Runs **11 versioned RN coding test scenarios** (login screen, FlatList feeds,
  typed navigation, secure forms, offline queues, image feeds, feature flags,
  accessible forms, hooks refactors, dependency removal with native cleanup, …)
- Scores on three axes: **correctness** (real test/typecheck/lint with
  `--live`), a **16-check best-practice rubric**, and the **guardrail rules**
- Reports scores **relative to the human reference solutions**

**Exit codes**

| Code | When |
|---|---|
| 0 | Benchmark ran (report printed/written) |
| 1 | Unknown provider, or no scenarios ran |

---

## `leaderboard`

Merge per-model benchmark results into a timestamped `BENCHMARK_RESULTS.md`
leaderboard — the public scenario × model × axis comparison table.

```bash
npx vectalon leaderboard bench/results                # merge bench/results/*.json
npx vectalon leaderboard bench/results --out LEADERBOARD.md
npx vectalon leaderboard bench/results --json         # merged runs as JSON
npx vectalon leaderboard bench/results --timestamp 2026-08-03T03:00:00.000Z
npx vectalon leaderboard bench/results --pr-comment   # compact PR comment to stdout
```

**What it does**

- Reads every `BenchSummary` JSON in the directory (each written by
  `vectalon bench --model <m> --json -o bench/results/<m>.json`), one per model
- Renders a **timestamped markdown leaderboard** with a scenario × model table
  per axis (composite, correctness, adherence, guardrails), an overall row, and
  a relative-to-human summary when references are present
- Writes `BENCHMARK_RESULTS.md` (default) — the nightly workflow commits this
  back to the repo

**Options**

| Option | Description |
|---|---|
| `[directory]` | Results dir containing one JSON per model (default `bench/results`) |
| `--out <path>` | Output file (default `BENCHMARK_RESULTS.md`) |
| `--json` | Print the merged runs as JSON instead of writing markdown |
| `--timestamp <iso>` | Override the leaderboard timestamp (default now) |
| `--pr-comment` | Print a compact PR comment (with the `<!-- vectalon-leaderboard -->` upsert marker) to stdout instead of writing markdown |

**Exit codes**

| Code | When |
|---|---|
| 0 | Leaderboard written (or JSON / PR comment printed) |
| 1 | No result files found in the directory |

**Nightly leaderboard (M5)** — `.github/workflows/leaderboard.yml` runs
`vectalon bench --live --install --model` on a `[local, openai, anthropic, azure-openai, groq, ollama, vllm]`
matrix at 03:00 UTC daily (or on `workflow_dispatch`), skips remote providers
whose API key secret is unset, uploads each model's result as an artifact, then
merges them with this command and commits the timestamped
`BENCHMARK_RESULTS.md` — and the per-model result JSONs (force-added, since the
repo gitignores `bench/results/*.json` locally) — back to the repo.

**PR leaderboard comments** — `.github/workflows/pr-leaderboard.yml` runs on
`pull_request` (`opened` / `synchronize` / `reopened`): it builds, renders the
compact comparison with `--pr-comment` from the committed results, and upserts a
single comment (located by the marker) so the leaderboard stays current as the
branch evolves. When no results are committed yet (e.g. before the first nightly
run), the workflow skips gracefully without failing the PR check.

---

## `impact`

Compute the **cross-package blast radius** of changed files in a monorepo:
which workspace packages consume them, which screens re-render, which
navigation stacks are affected, and which Maestro E2E flows must run.

```bash
npx vectalon impact --changed packages/ui/src/Button.tsx
npx vectalon impact --changed packages/ui/src/Button.tsx --pr 123 --push
npx vectalon impact --changed "packages/ui/src/Button.tsx,packages/core/src/hooks.ts" --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root / workspace root (default: cwd) |
| `--changed <files>` | Comma-separated changed file paths relative to the workspace root (required) |
| `--pr <number>` | Post the impact report as a comment on the given pull request |
| `--push` | Allow git push / PR comments |
| `--json` | Print the impact report as JSON instead of markdown |
| `--dry-run` | Simulate the PR comment without posting |

**What it does**

- Detects the workspace (pnpm / Yarn / npm / Turborepo / Lerna) and scans every
  member package with the same AST analysis as the knowledge graph
- Finds every file that imports a changed package by name (cross-package) or
  directly imports a changed file (same-package), plus screens (default-export
  components, navigator-declared components, Expo route files), navigator
  definitions referencing affected screens, re-render screens (screens
  rendering a changed binding), and `.maestro/` + `e2e/` YAML flows referencing
  affected screens (component or route name)
- With `--pr <number>`, posts the rendered report as a PR comment via the git
  adapter (`--push` required for real posting; without it — or without a
  GitHub remote / `GITHUB_TOKEN` / `gh` CLI — the adapter logs a warning and
  skips the post, so the command still succeeds)

**Exit codes**

| Code | When |
|---|---|
| 0 | Report printed (comment post is best-effort) |
| 1 | Missing `--changed`

---

## `upgrade`

React Native / Expo **automated upgrade copilot** with codemods and
AST-grade breaking-change impact analysis. Deterministic, catalog-driven
planning (no model calls), provenance logging for every codemod, and an
optional verification loop (doctor + typecheck + bundle budget gate).
Requires the **Pro tier**.

```bash
npx vectalon upgrade                     # dry-run plan for the latest known RN
npx vectalon upgrade --to 0.76           # plan the 0.72 → 0.76 migration
npx vectalon upgrade --to 0.76 --json    # plan as JSON (CI-friendly)
npx vectalon upgrade --to 0.76 --dry-run # explicit dry-run: no writes
npx vectalon upgrade --to 0.76 --apply   # execute safe codemods + verify
npx vectalon upgrade --to 0.76 --apply --force  # also apply risky review steps
npx vectalon upgrade --to 53 --apply     # Expo SDK target
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--to <version>` | Target: RN `0.76`, Expo SDK `53`, or `latest` (default: latest known stable) |
| `--dry-run` | Preview the plan + impact analysis without touching files (default) |
| `--apply` | Execute codemods and dependency bumps, then verify |
| `--force` | Also apply `review` steps (New Architecture flips, SDK level bumps) |
| `--json` | Print the report as JSON instead of markdown |

**Workflow stages**

1. **Detect** — reads `package.json`, `android/build.gradle`,
   `android/gradle.properties`, `ios/Podfile`, `app.json` (react-native, expo
   SDK, Hermes, New Architecture, Kotlin, SDK levels). No network.
2. **Catalog** — a curated migration catalog of the top breaking changes per
   RN release (Hermes flag relocation, New Architecture opt-in,
   `requireNativeComponent` → `codegenNativeComponent`, ReactTestRenderer
   import fix, SDK / Kotlin / AGP requirements, React pairing).
3. **Impact** — walks the project's own source with the harness scanner to
   find affected files: native modules, bridge usage
   (`NativeModules` / `requireNativeComponent`), and Fabric-hostile patterns.
4. **Plan** — step-by-step migration plan with per-step risk and a total
   risk label; steps are `auto` (safe codemods), `review` (risky — need
   `--force`), or `manual` (documented instructions).
5. **Codemods** — applies only with `--apply`; backs up every edited file
   under `.vectalon/upgrades/backups/` and writes a provenance manifest
   (`.vectalon/upgrades/<timestamp>-upgrade.json`) recording every edit.
6. **Verify** — with `--apply` (and unless disabled), runs `vectalon doctor`,
   a typecheck, and the bundle-budget regression gate against a pre-upgrade
   Metro snapshot.

**Exit codes**

| Code | When |
|---|---|
| 0 | Plan printed, or upgrade applied successfully |
| 1 | Not an RN/Expo project, tier gate failed, or fatal error |

---

## `profile`

Analyze Hermes **runtime profiles** — JS-thread blocking events, retained
objects, and leak candidates — and track them over time with knowledge-base
baselines. Deterministic (no model calls). Requires the **Pro tier**.

```bash
npx vectalon profile --profile app.cpuprofile
npx vectalon profile --heap app.heapsnapshot
npx vectalon profile --profile app.cpuprofile --save-baseline
npx vectalon profile --profile app.cpuprofile --baseline release --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root with a `.vectalon/` workspace (default: cwd) |
| `--profile <file>` | Path to a Hermes `.cpuprofile` JSON file |
| `--heap <file>` | Path to a Hermes `.heapsnapshot` JSON file |
| `--baseline <label>` | Baseline label in the knowledge base (default `default`) |
| `--save-baseline` | Persist this run as the baseline for future comparisons |
| `--threshold-ms <n>` | JS-thread blocking threshold in ms (default 100) |
| `--json` | Print the report as JSON instead of markdown |

**What it detects**

- **JS-thread blocking** — contiguous sample runs where the JS thread stayed
  in one frame longer than the threshold become blocking events with the
  function, file, line, and duration ("useEffect blocks the JS thread for
  500ms — move to a worklet").
- **Hot functions** — total self time per function, ranked.
- **Retained objects** — a first-reach retained-size approximation per
  top-level object held by the GC roots ("imageCache retains 20 MB").
- **Leak candidates** — the largest self-size allocations still reachable.
- **Regressions** — without `--save-baseline`, the run is compared against the
  stored baseline: blocking time up >25% or retained heap up >30% flags a
  regression finding.

**Exit codes**

| Code | When |
|---|---|
| 0 | Report printed / baseline saved |
| 1 | No `.vectalon/` workspace, missing input files, tier gate failed |

---

## `sandbox`

Run a command in an **isolated process with no ambient authority** — the
trust foundation for running generated code, tests, and scripts. The
environment is scrubbed to a deny-by-default allowlist, file writes are
confined to the sandbox root (OS-enforced on macOS/Linux), network is denied
by default, and the run is bounded by a wall-clock timeout plus optional CPU /
memory limits. Requires the **Pro tier**.

```bash
npx vectalon sandbox -- node -e 'console.log("hello")'        # run inside the project dir
npx vectalon sandbox --root /tmp/scratch -- npm test           # confine to a scratch dir
npx vectalon sandbox --timeout 5000 -- node run-tests.js       # bound execution
npx vectalon sandbox --cpu 10 --memory 512 -- jest             # CPU + memory caps
npx vectalon sandbox --allow-env NODE_ENV -- npm run build     # keep one ambient var
npx vectalon sandbox --json -- node -e 'process.exit(3)'       # structured result
```

**Options**

| Option | Description |
|---|---|
| `--root <dir>` | Sandbox root — the working directory and (on macOS/Linux) the only writable location (default: cwd) |
| `<command> [args...]` | The command to run inside the sandbox (everything after `--`) |
| `--timeout <ms>` | Wall-clock timeout in ms (default 30000) — SIGTERM then SIGKILL to the whole process group |
| `--cpu <seconds>` | CPU time limit in seconds (`ulimit -t`) |
| `--memory <mb>` | Virtual memory limit in MB (`ulimit -v`) |
| `--network` | Allow outbound network (default: **denied** where the backend supports it) |
| `--allow-env <names>` | Comma-separated ambient env vars to keep (deny-by-default otherwise) |
| `--json` | Print the structured result as JSON instead of the human report |

**What it does**

- **Environment scrubbing** — deny-by-default: only PATH, HOME, TMPDIR, and
  locale variables survive unless passed via `--allow-env`. Credential-shaped
  ambient variables (AWS keys, GitHub tokens, npm tokens, SSH agents, CI
  secrets) are **always dropped**, and the report lists exactly which variable
  names were stripped.
- **OS isolation** — on macOS, `sandbox-exec` confines file writes to the
  sandbox root and denies outbound network by default; on Linux, `bwrap` binds
  the filesystem read-only and unshares the network namespace. Where neither
  exists, it degrades to process-level isolation (scrubbed env + rlimits) and
  says so honestly in the report.
- **Bounds** — a wall-clock timeout kills the whole process group (SIGTERM →
  SIGKILL), and POSIX rlimits cap CPU seconds, virtual memory, file size,
  open files, and process count. Output capture is capped per stream.

The same capability is exposed to agents as the MCP tools `sandbox_run`
(requires an explicit `root` + `command` — never defaults to the current
directory) and `sandbox_backend`.

**Exit codes**

| Code | When |
|---|---|
| 0 | Command succeeded inside the sandbox |
| 1 | Command failed, timed out, was killed by a limit, tier gate failed, or the root does not exist |

---

## `render`

Compile generated TS/TSX through the **Metro transform pipeline** and
**render it headlessly** inside the isolated sandbox — reading console logs,
the render tree, and runtime errors **before presenting a diff to the user**.
The flagship "agent that ships" capability: agents self-correct on JSX/TS
errors instead of only being lint-aware. Requires the **Pro tier**.

```bash
npx vectalon render --entry src/App.tsx                 # render a project file
npx vectalon render --entry src/App.tsx --file src/Header.tsx  # compile siblings too
npx vectalon render --entry src/App.tsx --json          # structured result
npx vectalon render ./my-app --entry src/screens/Home.tsx
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--entry <file>` | Entry file to compile and render (required) |
| `--file <file>` | Extra files to compile alongside the entry (repeatable, comma-separated) |
| `--timeout <ms>` | Render wall-clock timeout in ms (default 30000) |
| `--memory <mb>` | Virtual memory limit in MB for the sandboxed node process |
| `--json` | Print the structured result as JSON instead of the human report |

**What it does**

- **Transpile** — project Babel with TS/React presets (the exact Metro
  transform chain when the project ships them), falling back to offline
  TypeScript `transpileModule`, with a parser-only syntax check as the last
  resort. A bundled parser backstop catches syntax errors that
  `transpileModule` silently recovers from (e.g. unclosed JSX) — nothing
  invalid reaches the render step.
- **Headless render** — a self-contained zero-dependency React + react-native
  shim runs inside the sandbox (no network, no installs): function
  components, hooks (`useState` / `useEffect` / `useMemo` / `useContext` …),
  host components (View, Text, FlatList, …), bounded console capture, and a
  depth/node-capped render tree serialized to JSON.
- **Self-correcting loop** — a component that throws at render, fails to
  load, or logs an error is surfaced structurally (`loadError` /
  `runtimeError` / `logs`) so an agent can fix the JSX/TS and re-render
  before the user ever sees the diff.

The same capability is exposed to agents as the MCP tool `render_component`
(pass a map of sandbox-relative path → source, get back the compiled modules,
render tree, logs, and errors).

**Exit codes**

| Code | When |
|---|---|
| 0 | Compiled and rendered (or the report was printed) |
| 1 | Compile/load/render error, missing entry, tier gate failed, or file not found |

---

## `policy`

Manage project-specific guardrail policy (`.vectalon/policy.json`).

```bash
npx vectalon policy --init                    # create a default policy file
npx vectalon policy                           # show the current policy
npx vectalon policy --check src/screens/Home.tsx   # run policy against a file
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--init` | Create a default `.vectalon/policy.json` |
| `--check <file>` | Run the policy against a source file |

**Exit codes**

| Code | When |
|---|---|
| 0 | Policy initialized / shown, or check passed |
| 1 | No `.vectalon/`, file not found, or check failed |

---

## `refresh`

Refresh knowledge from web sources and generate improvement suggestions.

```bash
npx vectalon refresh              # refresh only if the cache is stale
npx vectalon refresh --force      # refresh regardless
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--force` | Refresh even if the cache is still fresh |

**What it does**

- Retrieves latest React Native docs, library changelogs, and community best
  practices; updates the knowledge graph and best-practices knowledge base
- Compares your `package.json` dependencies against the fetched data and writes
  **improvement suggestions** to
  `.vectalon/knowledge/refresh/suggestions.json`

**Exit codes**

| Code | When |
|---|---|
| 0 | Refresh completed (or cache was fresh) |
| 1 | No `.vectalon/` directory found |

---

## `sync`

Sync the team brain (`.vectalon/knowledge/`) to a hosted git remote.

```bash
npx vectalon sync --init --remote git@github.com:org/team-brain.git
npx vectalon sync --push                       # push the local brain
npx vectalon sync --pull                       # pull the remote brain
npx vectalon sync --push --branch release      # different branch
npx vectalon sync --push --force               # run even if disabled in config
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--push` | Push the knowledge base to the remote |
| `--pull` | Pull the knowledge base from the remote |
| `--init` | Create `.vectalon/sync.json` (requires `--remote`) |
| `--remote <url>` | Git remote URL for the hosted artifact store |
| `--branch <name>` | Branch to sync to/from (default `main`) |
| `--force` | Override a disabled sync config (`"enabled": false`) |

**Exit codes**

| Code | When |
|---|---|
| 0 | Config created, or push/pull succeeded |
| 1 | No `.vectalon/`, `--init` without `--remote`, no `sync.json`, or sync failed |

---

## `import`

Import SDLC artifacts (markdown/JSON) into the knowledge base.

```bash
npx vectalon import docs/prd.md
npx vectalon import docs/
npx vectalon import docs/prd.md --type product --title "Mobile App PRD"
```

**Options**

| Option | Description |
|---|---|
| `<target>` | File or directory to import (required) |
| `--type <type>` | Artifact type: `business` \| `research` \| `product` \| `requirements` \| `design` \| `architecture` \| `engineering` \| `data` \| `security` \| `qa` \| `devops` \| `operations` \| `analytics` |
| `--title <title>` | Artifact title |

Type resolution order: `--type` flag → frontmatter `type:` → keyword detection.
JSON files may be a single `{ title, type, content }` object or an array.

**Exit codes**

| Code | When |
|---|---|
| 0 | Import completed (duplicates skipped by checksum) |
| 1 | Invalid target or import failure |

---

## `pull`

Download a local model preset (default: Qwen2.5-Coder-1.5B).

```bash
npx vectalon pull              # download the default model (~1.1 GB)
npx vectalon pull <preset>     # download a specific preset
```

**Exit codes**

| Code | When |
|---|---|
| 0 | Model downloaded (or already exists) |
| 1 | Unknown preset, or download failed |

---

## `models`

List available and downloaded local models, including the zero-config WASM
tier (shows whether its weights are already cached).

```bash
npx vectalon models
```

**Exit codes**

| Code | When |
|---|---|
| 0 | Always (list printed) |
