# vectalon CLI Reference

Complete reference for the `vectalon` command-line interface. Every command is
available as `npx vectalon <command>` (or `vectalon <command>` when installed
globally or linked).

The package also installs the **shortcut `vc`** — same CLI, same commands.
In a project where `@vectalon-dev/rn` is installed, `npx vc status` and
`vc status` are equivalent to `npx vectalon status`. (`vc` is also an
unrelated npm package, so the bare name resolves to your local install only
when the package is installed; `npx` prefers the local binary.)

Running `npx vectalon` with no arguments opens an **interactive menu** covering
the most common actions (init, feature, refresh, suggestions, bundle, status,
daemon, telemetry, impact, coverage, intel, diagnostics, generate, perf,
smoke, ci, release, ecosystem, doctor, selftest, bench, leaderboard, sync,
policy, serve, pull, models, help).

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

**The 15-minute proof of value.** Initialize vectalon in a React Native
project with one command: scan the codebase, build the context snapshot,
detect tooling (Expo vs bare RN-CLI), set up the model provider, and enable
the recommended ecosystem items — then end with the **payoff**: the scan
summary, the **Vectalon Health Score**, and the **Top 5 problems** Vectalon
found, in the proof-of-value window. **No LLM configuration is ever asked**
— the model router's local auto-select (or WASM/remote with automatic
fallback) runs silently underneath, and the summary itself is zero model
calls.

```bash
npx vectalon init                  # scan cwd, create .vectalon/, and show the score + top problems
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

The proof-of-value window is exactly the commercial surface:

```
Scanning React Native project...

✓  1,842 files
✓    127 components
✓     34 screens
✓     18 native modules
✓    412 dependencies
✓      6 navigation stacks
✓     23 tests
!      4 architecture risks

Vectalon Health Score: 76/100  grade C

Top problems Vectalon found:

  1. ● Android dependency conflict
  2. ● Circular dependency
  3. ● Checkout has no E2E coverage
  4. ● 3 unnecessary render cycles
  5. ○ RN upgrade risk detected
```

The counts come from the shared Project Intelligence model; the score is the
eight-dimension `vc score` aggregation (offline, deterministic). The run also
seeds the intel + score-history caches, so the next `vc score` is instant
and already has a baseline for its "↓ N points this week" delta.

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root to scan (default: cwd) |
| `--mode <mode>` | Deployment mode (`cloud` \| `private` \| `air-gapped`) — constrains the provider to the mode's privacy ladder and records it in the manifest |
| `--model <provider>` | Default model provider: `local` \| `wasm` \| `openai` \| `anthropic` \| `azure-openai` \| `groq` \| `ollama` \| `vllm` (refused when outside `--mode`) |
| `--resume` | Resume an interrupted init from its last completed phase |
| `--clean-restart` | Roll back an interrupted init (restore originals) and start over |
| `--force` | Re-initialize even when the project is already initialized |

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
- **Builds the knowledge base automatically** — from the repo scan it seeds the
  artifact knowledge base with a project snapshot, knowledge graph, code graph,
  native configuration, and learned patterns, so agents get project context
  through `search_knowledge` immediately. No manual import step: knowledge
  maintenance is Vectalon's job, and the same idempotent seed re-runs on every
  periodic refresh (hourly in `serve`, or `vectalon refresh`) so the knowledge
  base tracks code changes on its own
- **Ends with the proof-of-value window** — scan summary counts, the Vectalon
  Health Score (the `vc score` aggregation, offline), and the Top 5 problems
  with P0/P1/P2 severity dots. Zero model calls, no configuration asked; the
  run also seeds the intel + score-history caches for an instant next `vc score`

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
| `--safe-mode` | **Safe mode** — CI/debug escape hatch: model generation returns stubs, file-writing tools are disabled, and device-control live execution is off. No risk of side effects on customer machines |

**What it does**

- Exposes **65 built-in MCP tools** — 58 available by default (core harness, SDLC, ecosystem,
  upgrade, perf, sandbox, and render tools), plus the knowledge-base
  and team-brain tools when those services are present (project context, SDLC
  modules, devices & E2E incl. screen-reader control, cross-package impact,
  release planning & crash monitoring, sandboxed execution, headless
  component rendering, knowledge base, team brain). The
  knowledge tools (`search_knowledge`, team-brain search) rank hits by
  **relevance × confidence** — every artifact carries a provenance-derived
  confidence score (`source × status × recency`), a staleness date (last
  updated + 90-day TTL), and its source — so agents trust recent,
  high-confidence context over stale or speculative guesses; each hit surfaces
  `confidence` and `rankedScore`
- Reads `.vectalon/ecosystem.json` and exposes each **enabled ecosystem MCP
  server as a first-class tool** (Metro MCP, Expo MCP, …) agents auto-discover.
  A sub-MCP server that fails to start (missing package, wrong name) logs **one
  compact warning with the failure reason and install hint** instead of a wall
  of npm error output; the full stderr is shown only under `VECTALON_DEBUG=1`
- With **`--safe-mode`**: model tools return deterministic stubs, file-writing
  and device-control tools are absent from the tool list, and the server logs
  `SAFE MODE` at startup — run Vectalon in CI or on customer machines without
  side effects
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
- Starts a **background knowledge maintenance** loop (hourly): refreshes web
  knowledge + improvement suggestions AND re-scans the repo, re-seeding the
  repo-derived artifacts (project snapshot, knowledge graph, code graph,
  native configuration, learned patterns) so the knowledge base tracks code
  changes automatically; runs an immediate pass when the cache is stale

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
| `--telemetry-watch` | Also watch telemetry exports (`.vectalon/telemetry`) — new crashes/analytics ingest as they land, surfaced in the daemon log |

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
| `--strict-verification` | Gate on pre-existing project failures too (default: ignore failures that reference no workflow-touched file) |
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
- Applies **guardrails** (36 rules + `.vectalon/policy.json`) before writing
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
npx vectalon ecosystem --enable metro-mcp   # enable an item (verified on npm first)
npx vectalon ecosystem --enable metro-mcp --force  # ... skip the registry check
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
| `--enable <id>` | Enable an ecosystem item — for MCP items, the npm package is first verified to exist on the registry (fail-fast: a confirmed 404 blocks with a clear message instead of surfacing as a serve-time failure). Offline, the check is skipped with a warning |
| `--force` | Skip the npm-registry existence check when enabling an MCP item |
| `--disable <id>` | Disable an enabled item |
| `--info <id>` | Show the install command + capabilities for one item |
| `--export` | Export enabled items as an MCP client config fragment |
| `--json` | Print the export as JSON |
| `--expanded` | Force the full catalog view (descriptions + commands) even when piped |

**Exit codes**

| Code | When |
|---|---|
| 0 | Success (list / enable / disable / export) |
| 1 | Unknown category, unknown flavor, or unknown item id |

---

## `doctor`

Diagnose the project: enabled ecosystem items, native toolchain, nightly
leaderboard readiness, model access, and web-intel freshness. Every section
outputs a wrapping table (no truncation — every Detail and Hint is fully
visible), and each missing check comes with a numbered fix step.

```bash
npx vectalon doctor                         # human-readable report
npx vectalon doctor --json                  # machine-readable report
npx vectalon doctor --fix                   # auto-install missing items, then re-check
npx vectalon doctor --enable metro-mcp      # quick-toggle an item on
npx vectalon doctor --disable maestro       # quick-toggle an item off
npx vectalon doctor ./my-app                # check a specific project
npx vectalon doctor --selftest              # verify the doctor's own probes work
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--json` | Print the report as JSON |
| `--fix` | Auto-install missing ecosystem items and toolchain components, then re-check |
| `--selftest` | Verify the doctor's own probes work (P0-10), then exit |
| `--enable <id>` | Enable a single ecosystem item and exit (writes `.vectalon/ecosystem.json`) |
| `--disable <id>` | Disable a single ecosystem item and exit |
| `--enable-recommended` | Enable every ecosystem item recommended for the project's detected flavor, then exit |

**Checks**

- **Ecosystem items** — MCP packages resolve locally or respond to a bounded
  probe; tools/hooks resolve from `node_modules` or respond on `PATH`; skills
  exist under `.vectalon/skills/` or `.agents/skills/`
- **Catalog health** — every enabled MCP item's npm package is checked against
  the registry (cache-backed, 24h, offline-tolerant): a confirmed 404 warns
  with the corrected install command, so a stale/wrong catalog entry is caught
  here instead of as a serve-time `npx` failure
- **Native toolchain** — Node 20+ (18–19 warns), JDK 17+, Android SDK
  (`ANDROID_HOME`/`adb`), Android emulator AVDs, Xcode & CocoaPods (macOS
  only), Metro dev-server port 8081
- **Nightly leaderboard readiness (M5)** — `OPENAI_API_KEY` and
  `ANTHROPIC_API_KEY` secrets set (warn when unset), the default Qwen local
  model downloaded (warn with a `vectalon pull` hint), and `bench/results/`
  present + writable (missing with a `mkdir -p bench/results` hint)
- **Model access + web intel** — the configured model is usable and can reach
  MCPs / skills; web intel (RN release notes, Expo changelog, community
  newsletter headlines) is cached and current — so the model system prompt
  stays aligned with the latest ecosystem decisions even during offline
  generation

Every check prints a status (`OK`/`MISSING`/`WARN`) with an actionable fix
hint. Toolchain checks run even without an ecosystem config. When the project
is an Expo project the header says "Expo project"; when a bare RN-CLI project
it says "bare RN-CLI project" — so the flavor is always visible.

**Recommended-but-not-enabled section** — items the ecosystem catalog
recommends for the detected project flavor that haven't been enabled yet.
Each row shows the enable command so there is no ambiguity about what to run.

**Numbered fix steps** — every missing check is listed with a step number,
its install command (or manual instruction), and an auto/manual label.

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
| `--category <cat>` | Run only one category (`cli`, `sdlc`, `guardrails`, `knowledge`, `harness`, `model`, `mcp`, `workflows`, `ecosystem`, `bench`, `adapters`, `memory`, `upgrade`, `perf`, `sandbox`, `render`, `diagnostics`, `naming`) |
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

## `status`

One read-only health screen — the **first thing you ask a customer to run.**
Prints daemon status (pid, port, health), MCP server reachability + registered
tool count, model provider status (`ready` / `degraded` with the exact fix
hint), last background knowledge refresh, license/trial days remaining, and
`.vectalon/` disk usage. Every probe is wrapped, so a single broken source
(stale pid file, missing license, unresponsive port) degrades to a line
instead of killing the report — and a silent heartbeat (>30 min, active
license) surfaces the admin alert path too.

```bash
npx vectalon status
```

**Options** — none; runs against the current working directory.

**Exit codes**

| Code | When |
|---|---|
| 0 | Status printed |
| 1 | No `.vectalon/` directory found |

---

## `bundle`

Build the Metro bundle and enforce **performance budgets** — fully deterministic,
no model calls. Static checks always run against the project on disk; a real
`react-native bundle --json` build snapshots the composition into the knowledge
base and warns when it grows vs the previous snapshot.

```bash
npx vectalon bundle                         # build iOS bundle + run all budgets
npx vectalon bundle --platform android      # build the Android bundle instead
npx vectalon bundle --open                  # …and open the HTML treemap dashboard
npx vectalon bundle --static                # on-disk static checks only (no build)
```

**What it checks**

- **Bundle composition** — the top packages render as ASCII bars in the
  terminal; `--open` writes a self-contained HTML dashboard
  (`.vectalon/bundle/report.html`, no network needed) with a squarified
  treemap of the whole bundle, per-package drill-down (sizes, modules),
  and budget violations highlighted in red
- **Replacement suggestions** — the dashboard proposes lighter alternatives
  for heavy packages (e.g. moment → dayjs, lodash → lodash-es) backed by npm
  maintenance signals — last publish, weekly downloads, GitHub stars — cached
  in `.vectalon/bundle/signals.json` for 24h (fetches never block or fail the
  run; offline runs show sizes without signals)
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
| `--open` | Open the HTML treemap dashboard in the browser after the run |
| `--no-html` | Skip writing the dashboard (and the npm signal fetches) |
| `--report <dir>` | Dashboard output directory (default `.vectalon/bundle`) |

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

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--provider <host>` | Force a CI host instead of detecting from the git remote (`github` \| `azure` \| `gitlab` \| `bitbucket`) |
| `--dry-run` | Show what would be generated without writing files |

**Exit codes**

| Code | When |
|---|---|
| 0 | Workflow generated (or already present) |
| 1 | No `.vectalon/` directory found |

---

## `visual-ci`

PR-mode **visual regression**: capture the screens a branch changes, diff
them against the committed baselines (`docs/vectalon/visual-baselines`), post
the report on the PR, and exit with a gating code — the visual half of the
self-healing CI pipeline.

```bash
npx vectalon visual-ci                          # diff changed screens vs origin/main
npx vectalon visual-ci --base main              # use a different base ref
npx vectalon visual-ci --screens LoginScreen,ProfileScreen   # explicit screens
npx vectalon visual-ci --verdict strict         # fail on any visual diff
npx vectalon visual-ci --pr 123 --push          # post the report as a PR comment
npx vectalon visual-ci --json                   # machine-readable outcome
npx vectalon visual-ci --dry-run                # describe the plan, touch nothing
npx vectalon visual-ci --incident               # file a triaged incident on regression
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--base <ref>` | Ref whose baselines are used (default: `GITHUB_BASE_REF` or `origin/main`) |
| `--screens <list>` | Comma-separated screen keys to check (default: derived from changed files) |
| `--changed <files>` | Comma-separated changed files (default: `git diff base...HEAD`) |
| `--platform <type>` | Device platform (`ios` \| `android`) |
| `--attempts <n>` | Capture attempts per screen (default 3) |
| `--settle-ms <n>` | Settle wait before each capture in ms (default 2500) |
| `--verdict <policy>` | Gating policy: `strict` \| `warn` \| `report` (default `warn`) |
| `--pr <number>` | Post the report as a PR comment (upsert) |
| `--push` | Allow git push / PR comments |
| `--out <dir>` | Run output directory (default `.vectalon/visual-ci`) |
| `--json` | Print the machine-readable outcome as JSON |
| `--dry-run` | Describe the plan without touching a device |
| `--incident` | File a triaged incident into the knowledge base when the gate fails (regression only — infrastructure failures are reported, not filed) |

**Exit codes**

| Code | When |
|---|---|
| 0 | No regressions (or `--verdict warn`/`report` passed) |
| 1 | A regression failed the gate under `--verdict strict`, or the run errored |

---

## `ci-incident`

The **self-healing CI gate**: file a triaged incident — severity, cause bucket,
rollback suggestion — for a failed CI gate into the knowledge base, so every
CI failure becomes something the team brain learns from.

```bash
npx vectalon ci-incident --gate bundle-budget --step quality --exit 1
npx vectalon ci-incident --gate visual-regression --commit abc1234 --severity sev1
npx vectalon ci-incident --command "vectalon bench --baseline" --output "$(cat fail.log)"
npx vectalon ci-incident --telemetry telemetry/ --json   # data-driven triage
npx vectalon ci-incident --dry-run                       # analyze + print, don't persist
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--gate <name>` | Gate that failed, e.g. `visual-regression` \| `quality` \| `bundle-budget` \| `bench-regression` (default `ci`) |
| `--step <name>` | Workflow step that failed |
| `--command <cmd>` | The failing command |
| `--exit <code>` | Exit code of the failing step |
| `--output <text>` | Failing output (truncated in the report) |
| `--commit <sha>` | Failing commit sha (default: `git HEAD`) |
| `--branch <name>` | Failing branch (default: git / CI env) |
| `--severity <level>` | Override severity: `sev1` \| `sev2` \| `sev3` |
| `--telemetry <dir>` | Ingest crash telemetry exports to make the triage data-driven |
| `--json` | Print the incident as JSON |
| `--dry-run` | Analyze + print without persisting |

**Exit codes**

| Code | When |
|---|---|
| 0 | Incident filed (or printed with `--dry-run`/`--json`) |
| 1 | No `.vectalon/`, missing inputs, or the triage failed |

---

## `visual-baseline`

Manage the **committed visual baselines** (`docs/vectalon/visual-baselines`)
that `visual-ci` diffs against: list, capture, update, prune, and quarantine
them.

```bash
npx vectalon visual-baseline --list
npx vectalon visual-baseline --capture LoginScreen --from login.png --platform ios
npx vectalon visual-baseline --update LoginScreen --from login-new.png
npx vectalon visual-baseline --quarantine LoginScreen --reason "flaky dark mode"
npx vectalon visual-baseline --unquarantine LoginScreen
npx vectalon visual-baseline --prune --dry-run        # see what would be removed
npx vectalon visual-baseline --tolerance '{"driftThreshold":0.05}'
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--list` | List committed baselines |
| `--capture <key>` | Add a baseline for a screen key |
| `--update <key>` | Replace a baseline (clears quarantine) |
| `--from <path>` | PNG source for `--capture`/`--update` |
| `--platform <type>` | Platform for `--capture` (`ios` \| `android`) |
| `--note <text>` | Note for the baseline entry |
| `--tolerance <json>` | Per-key diff tolerance overrides, e.g. `{"driftThreshold":0.05}` |
| `--quarantine <key>` | Quarantine a baseline (reports but never gates) |
| `--reason <text>` | Reason for `--quarantine` |
| `--unquarantine <key>` | Clear a quarantine |
| `--prune` | Remove baselines whose key matches no screen in the project |
| `--dry-run` | Show what `--prune` would remove without removing |
| `--json` | Print the result as JSON |

**Exit codes**

| Code | When |
|---|---|
| 0 | Operation completed |
| 1 | No `.vectalon/`, unknown key, missing `--from`, or the operation failed |

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

## `telemetry`

Ingest runtime telemetry exports (Sentry events, Firebase Crashlytics reports,
performance traces, analytics JSON/JSONL) into the knowledge base as telemetry
artifacts, then run data-driven crash / incident / KPI analysis.

```bash
npx vectalon telemetry                          # ingest .vectalon/telemetry or telemetry/
npx vectalon telemetry --path ./exports          # ingest a specific dir or file
npx vectalon telemetry --no-analyze              # ingest only, skip analysis
npx vectalon telemetry --fixtures                # write sample exports + ingest them (see the pipeline end-to-end)
npx vectalon telemetry --format crashlytics      # force a format instead of auto-detecting
npx vectalon telemetry --formats                 # print the accepted formats guide
npx vectalon telemetry --watch                   # keep watching the directory; ingest new exports as they land
npx vectalon telemetry --watch --interval 5000   # poll every 5 s (default 10000 ms)
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--path <dir>` | Telemetry exports directory or file (default `.vectalon/telemetry` or `telemetry/`) |
| `--no-analyze` | Ingest only; skip crash/incident/KPI analysis |
| `--fixtures` | Write one realistic sample export per format into `.vectalon/telemetry/`, then ingest them |
| `--format <fmt>` | Force a telemetry format: `sentry` \| `crashlytics` \| `performance` \| `analytics` |
| `--formats` | Print the accepted formats guide and exit |
| `--watch` | Keep watching the telemetry directory and ingest new exports as they land (Ctrl-C to stop) |
| `--interval <ms>` | Watch poll interval in ms (default `10000`) |

**What it does**

- Parses Sentry / Crashlytics / trace / analytics JSON, JSON arrays, or JSONL
  exports (including pretty-printed files) into typed telemetry artifacts
  (`telemetry` type) in the knowledge base
- Runs the `analyze_crash`, `analyze_incident`, and `analyze_kpis` analyzers
  over the ingested events and persists the analyses
- `--watch` polls the directory and ingests **only changed files** (deduped by
  mtime/size against `.vectalon/telemetry-watch-state.json`, plus the store's
  content-checksum dedupe), printing the delta analysis per batch; the
  interactive menu and `vectalon daemon --telemetry-watch` use the same
  watcher

**Exit codes**

| Code | When |
|---|---|
| 0 | Telemetry ingested (analysis failures are reported, not fatal), or `--formats` printed |
| 1 | No `.vectalon/` directory found, invalid `--format`, or **nothing ingested** (no exports found / nothing parseable — scripts and CI can rely on this) |

The interactive menu (`vectalon` → Ingest telemetry) never hard-exits: when no
exports are found it offers **Specify a path**, **Generate sample exports**, or
**Supported formats** instead of claiming success.

---

## `bench`

Score the harness — or any model — on the RN coding tests benchmark.

```bash
npx vectalon bench                          # deterministic baseline (offline)
npx vectalon bench --suite data-flow        # only the data-flow suite
npx vectalon bench --live                   # run real tests/typecheck/lint
npx vectalon bench --live --install         # ... installing deps in each temp project first
npx vectalon bench --model local            # real-model leaderboard (all 13)
npx vectalon bench --model local --preset balanced   # ... with the 3B tier (fast|balanced|quality)
npx vectalon bench --model local --preset balanced --live --install -o bench/results/local-3b.json  # live-scored, saved for the leaderboard
npx vectalon bench --model wasm             # zero-config WASM model pass
npx vectalon bench --model openai --json    # JSON summary for tooling
npx vectalon bench -o report.md             # write the report to a file
npx vectalon bench --scenarios ./my-evals   # run your own custom eval pack
npx vectalon bench --scenarios ./my-evals --references ./my-refs  # + custom human baselines
npx vectalon bench --baseline bench/baseline.json  # CI regression gate (exit 1 on regression)
```

Model-backed passes (`--model`) report **live per-scenario progress** — each
scenario prints `[n/total]` as it starts and its composite as it completes, so
a long leaderboard run shows movement instead of a silent hang. The first
scenario also announces the model-engine warm-up (the GGUF load that used to
look like a freeze).

| Option | Description |
|---|---|
| `--model <provider>` | `local` \| `wasm` \| `openai` \| `anthropic` \| `azure-openai` \| `groq` \| `ollama` \| `vllm` — run the real-model pass |
| `--preset <id>` | Local GGUF for `--model local`: a usage tier (`fast` \| `balanced` \| `quality`) or a model id (`qwen2.5-coder-1.5b` \| `qwen2.5-coder-3b` \| `qwen2.5-coder-7b`); defaults to the tier auto-selected for this machine's RAM |
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
| `--out <dir>` | Write the impact doc to this directory instead of `docs/vectalon/impact` |

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

## `coverage`

Render the **coverage dashboard** — the committed `docs/vectalon/coverage/coverage-gaps.md`
that the close phase of each feature workflow run appends to — as a
**per-screen summary of E2E and accessibility gaps** with links to the open
follow-up tasks.

```bash
npx vectalon coverage                        # per-screen gap summary table
npx vectalon coverage --json                 # machine-readable summary (CI/agents)
npx vectalon coverage --limit 10             # cap the number of screens listed
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root / workspace root (default: cwd) |
| `--json` | Print the per-screen summary as JSON instead of markdown |
| `--limit <n>` | Cap the number of screens listed (default: all) |

**What it does**

- Reads `docs/vectalon/coverage/coverage-gaps.md` — one dated entry per feature
  run, appended by the close phase — and rolls the entries into one row per
  screen: how many runs recorded an **E2E gap** (impact screen with no
  deterministic route, so no regression flow was generated) and how many
  recorded an **a11y gap** (affected screen with no accessibility flow)
- Shows each screen's **latest follow-up** state: the open task id (linked when
  the PM provider recorded a URL), `(tracked)` when the latest run deduplicated
  against an already-open follow-up, or `—` when no follow-up exists
- Sorts noisiest gaps first; `--json` emits `{ docPath, entries, screens[] }`
  for scripts and CI

**Exit codes**

| Code | When |
|---|---|
| 0 | Summary printed (missing dashboard prints an info note) |

---

## `intel`

**Project Intelligence Core** (Roadmap Phase 1, items 001-010) — one
deterministic pass over the project that produces the full intelligence
picture, from canonical manifest to sub-second knowledge retrieval:

```bash
npx vectalon intel                  # full report → docs/vectalon/intel/report.{json,md}
npx vectalon intel --bench          # + sub-second retrieval benchmark
npx vectalon intel --search "nav screen"  # ranked retrieval over the indexed project
npx vectalon intel --graph deps     # export one graph as JSON
npx vectalon intel --model          # the application digest — screens, navigation, state, native modules, deps, architecture
npx vectalon intel --json           # full machine-readable report on stdout
```

`intel` is **the foundation of everything**: `docs/vectalon/intel/report.json`
is the canonical Project Intelligence model, and every agent (`fix`, `upgrade`
impact, and the rest) consumes it through the shared `readProjectIntel()`
door — fresh by default (15 min), one incremental re-pass per process when
stale, direct-read fallback when unavailable — instead of independently
rediscovering the repository.

**Layers (001-010)**

| # | Layer | What it produces |
|---|---|---|
| 001 | Project manifest | Versioned schema (v2): name, RN/Expo versions, tooling, platforms, dependencies + validation issues |
| 002 | Workspace discovery | Monorepo detection (pnpm/yarn/npm/turbo/lerna/**nx**) + member package map |
| 003 | Dependency graph | File → file import edges, external package boundaries, **circular-import cycles** (Tarjan SCC) |
| 004 | AST layer | Parse-rate statistics over every source file (roadmap: 95%+) + import/export counts |
| 005 | Repository index | Incremental — content fingerprints, re-index only changed files |
| 006 | Embeddings | Deterministic hash embeddings + 200-line chunking with overlap (offline, no model calls) |
| 007 | Component graph | Parent → child relationships, shared components, re-render impact |
| 008 | Navigation graph | React Navigation navigators, Expo Router routes, URL scheme + deep-link map |
| 009 | Native registry | JS references, Podfile pods, podspecs, Gradle includes, TurboModule specs |
| 010 | Retrieval API | Ranked semantic + lexical search over the index, **sub-second** benchmark |

In a monorepo the scan is **repository-wide**: when the target is a workspace
root, every member package's source is indexed too. `--graph` accepts `deps`,
`components`, `navigation`, `native`, or `manifest`. Writes
`docs/vectalon/intel/report.json` + `report.md`; the report directory is
gitignored.

---

## `diagnostics`

**Project Diagnostics** (Roadmap Phase 2, items 011-015) — one deterministic
pass that validates the build/toolchain surface of a React Native project and
suggests a concrete fix for every finding:

```bash
npx vectalon diagnostics                    # full report → docs/vectalon/diagnostics/report.{json,md}
npx vectalon diagnostics --json             # machine-readable report on stdout
npx vectalon diagnostics --gradle-log build.log   # classify a Gradle failure's root cause
npx vectalon diagnostics --xcode-log build.log    # classify an Xcode failure's root cause
```

**Categories (011-015)**

| # | Category | What it validates |
|---|---|---|
| 011 | Metro | Config shape, alias targets (do they resolve?), watchFolders in monorepos, cache advice |
| 012 | Hermes | hermesEnabled / newArchEnabled flags against a **known-issue database** (disabled, New-Arch mismatch, legacy RN) |
| 013 | Android (Gradle) | compileSdkVersion, daemon heap, and a **log parser** classifying the top RN build errors (SDK/AGP/deps/AAPT/NDK/Java/network/OOM) |
| 014 | iOS (Xcode) | Podfile + deployment target, and a **log parser** for CocoaPods/signing/linker/plist/Xcode-version failures |
| 015 | Dependencies | Peer checks against an RN ecosystem matrix + duplicate versions across monorepo members |

Each check carries `pass` / `warn` / `fail` / `info`, a human detail line, and a
`fix` with the exact command or config edit. Gradle/Xcode log analysis reports
the root cause, the matching evidence lines, and the standard fix. In a
monorepo every member package is scanned (Metro config is also read at the
workspace root). Writes `docs/vectalon/diagnostics/report.json` + `report.md`
(gitignored).

---

## `generate`

**Code generation** (Roadmap Phase 2, items 016-020) — deterministic templates
for the pieces every RN app needs, written into the project (or previewed with
`--dry-run`):

```bash
npx vectalon generate component UserCard          # → src/components/UserCard.tsx
npx vectalon generate screen Profile              # → src/screens/Profile.tsx (with navigation)
npx vectalon generate test UserCard               # → __tests__/user-card.test.tsx (Jest RTL)
npx vectalon generate test UserCard --framework detox
npx vectalon generate native-module CameraScanner --spec '{"moduleName":"CameraScanner","methods":[...]}'
npx vectalon generate api OrdersApi --spec openapi.json   # typed services + apiBase
npx vectalon generate component PaymentSheet --dry-run    # preview without writing
```

**Generators (016-020)**

| # | Generator | Output |
|---|---|---|
| 016 | Component | Functional TS component with StyleSheet (flags: `--no-typescript`, `--no-styles`, `--navigation`) |
| 017 | Screen | Component with React Navigation hooks wired in |
| 018 | Native module | Full iOS (ObjC++ header/impl) + Android (Kotlin) scaffold, `--api rn-cli` (TurboModule) or `expo`, from a JSON spec |
| 019 | Test | Jest `@testing-library/react-native` or Detox E2E test for a component |
| 020 | API client | Typed service class + shared `apiBase.ts` (ApiError) from an **OpenAPI spec** — path params, request bodies, response types, error handling |

`--dry-run` prints the files that would be written and the full generated
source without touching the project — safe for review. Native-module and api
generators take `--spec` as inline JSON or a path to a `.json` file.

---

## `perf`

**Static performance scan** (Roadmap Phase 4, items 021-023, 027, 029) — one
deterministic pass over the project's source that catches the render and
startup hazards `profile`/`bundle` only see after you build or profile. No
build, no device, no model calls.

```bash
npx vectalon perf                      # findings + markdown report → docs/vectalon/perf/
npx vectalon perf --json               # machine-readable report (CI)
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--json` | Print the JSON report to stdout (the markdown report is still written) |

**What it checks**

- **Render profiler / re-render detector (021-022)** — render-phase
  `setState(...)` calls in a component body (error), plus the memo-defeating
  patterns that re-render subtrees: 2+ inline arrow handlers on one element,
  inline object/array literal props, and unmemoized `<X.Provider value={{…}}>`
  context values (warnings)
- **Startup analyzer (023)** — heavyweight module-scope imports (moment,
  lodash, rxjs, d3, three, Skia, victory-native, tfjs, realm, ffmpeg;
  moment/lodash warn, the rest error) and top-level side effects in entry
  files (`index.*`, `App.*`) that delay the first render
- **Bridge traffic analyzer (027)** — legacy bridge usage that blocks or
  bypasses the New Architecture: direct `NativeModules.X.method()` calls,
  `requireNativeComponent`, and `TurboModuleRegistry.get(...)` access
  (warning severity in JSX/TSX render paths, info in service files)
- **Recommendation engine (029)** — severity-ranked (error → warning → info),
  deduplicated fix suggestions, surfaced as the report's top 3

Reports land in `docs/vectalon/perf/report.{json,md}` (gitignored).

**Exit codes**

| Code | When |
|---|---|
| 0 | Scan completed (findings are informational — they never gate) |
| 1 | Project root unreadable or no source files found |

---

## `smoke`

**Post-release verification**: run **every CLI command** against the project
(Expo or bare RN CLI), capture the full output of each one, and report
pass / warn / skip / fail. Exit non-zero when anything fails — the thing to
run after a release to verify everything is in order.

```bash
npx vectalon smoke                       # every fast check, dev mode, report to .vectalon/smoke/
npx vectalon smoke --full                # + slow/model-heavy checks (feature, bench, selftest, pull)
npx vectalon smoke --json                # machine-readable report on stdout (CI)
npx vectalon smoke --only impact,coverage # targeted subset
npx vectalon smoke --list                # show all 37 checks
npx vectalon smoke --no-dev              # respect the real tier — Pro/Team commands report as skips
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--list` | List all checks and exit |
| `--only <ids>` | Run only these check ids (comma-separated) |
| `--skip <ids>` | Skip these check ids (comma-separated) |
| `--full` | Include slow / model-heavy checks (feature, bench, selftest, pull) |
| `--no-dev` | Disable dev mode — tier-gated commands report as skips instead of running (dev mode is **on by default**) |
| `--json` | Print the JSON report to stdout instead of writing files |
| `--no-html` | Skip writing the HTML dashboard |
| `--open` / `--no-open` | Open the HTML dashboard in the browser (default: TTY only) |
| `--out <dir>` | Report output directory (default `.vectalon/smoke`) |
| `--timeout <ms>` | Per-check timeout (default 60000) |

**What it does**

- Runs 37 checks covering the whole command surface — version/help, init,
  status, models, auth, policy, refresh, suggestions, ecosystem, doctor,
  impact, coverage, intel, diagnostics, generate, perf, telemetry, bundle,
  profile, sandbox, render, ci, release, leaderboard, visual-ci,
  visual-baseline, ci-incident, serve
  (boot-probed then killed), daemon, sync, team-policy, support, plus
  `--full` adds the feature workflow, benchmark, full self-test, and model
  pull
- Captures each command's **full stdout/stderr** into `report.json`, a
  readable `report.log`, and an HTML dashboard; the terminal prints a live
  per-check stream followed by a summary table
- **Always runs in dev mode** — every check runs with `VECTALON_DEV_MODE=1` so
  Pro/Team features (bundle, sandbox, ci, visual-ci, ci-incident, team-policy)
  execute for real instead of hitting the license gate; a post-release
  verification should exercise every feature. Pass `--no-dev` to respect the
  actual tier (gated commands then report as skips)
- **Clean output** — captured stdout/stderr is ANSI-stripped and children run
  with `FORCE_COLOR=0`, so reports contain plain text with no escape codes
- **Classification** — exit 0 (or an ok exit, e.g. doctor's exit 1 on a
  healthy-but-incomplete project) is a pass; commands that need inputs a
  project doesn't have (Hermes profile files, a sync remote) are skips with
  reasons; a non-zero exit is a fail; exceeding the timeout is a fail
- **Exit codes** — `0` when every check passed (warns/skips don't fail),
  `1` when any check failed or timed out

Generated release workflows (`.github/workflows/vectalon-release.yml` and
`.eas/workflows/vectalon-release.yml`) include a **`verify` job** that runs
`vectalon smoke --full --json` after quality checks, so every release is
automatically verified against the full command surface before it can submit.

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
npx vectalon upgrade --to 0.86.2 --diff  # also print the official rn-diff-purge template diff
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
| `--diff` | Also fetch and print the official **rn-diff-purge** template diff (categorized native `android/`/`ios/` vs JS/TS `App.tsx`/`index.js`/configs) for this upgrade — live from GitHub, always current even for releases newer than the catalog. Bare RN CLI only (Expo uses expo-upgrade) |
| `--json` | Print the report as JSON instead of markdown |
| `--no-verify` | Skip post-apply verification (doctor, typecheck, bundle budget gate) |

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
   `--force`), or `manual` (documented instructions). Every bare RN CLI plan
   includes an `rn-diff-purge` manual step pointing at the official
   community-maintained template diff — which always surfaces **both the
   native and the JS/TS changes to apply**, even for releases newer than the
   catalog.
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
- **Web intel** — fetches the latest React Native release announcements, Expo
  changelog entries, community newsletter headlines, Hacker News React Native
  stories, GitHub's most-starred React Native repositories, and the Callstack
  monthly Open Source Report from GitHub releases / blog RSS / Atom feeds and
  JSON APIs, extracts the top headlines, and persists them to
  `.vectalon/knowledge/refresh/intel.json`. Headlines are then inlined into the
  local, WASM, and remote model system prompts, so every generation is aware
  of the most recent ecosystem decisions.
- Re-scans the repo and re-seeds the repo-derived knowledge-base artifacts
  (project snapshot, knowledge graph, code graph, native configuration,
  learned patterns) — idempotent, so the knowledge base tracks code changes
  without any customer action

**Exit codes**

| Code | When |
|---|---|
| 0 | Refresh completed (or cache was fresh) |
| 1 | No `.vectalon/` directory found |

---

## `suggestions`

The **visible, actionable surface** for the improvement suggestions the
knowledge refresh produces — the "35 improvement suggestion(s) available"
count you see in `serve` now points somewhere. Lists the persisted
outdated-dependency suggestions, applies one with a single command, and can
render an HTML dashboard.

```bash
npx vectalon suggestions                       # severity-grouped list
npx vectalon suggestions --json                # raw store for CI/agents
npx vectalon suggestions --limit 5             # cap the listing
npx vectalon suggestions --apply lodash --yes  # npm install lodash@^<latest>
npx vectalon suggestions --apply <id>          # ... asks for confirmation in a TTY
npx vectalon suggestions --open                # write + open the HTML dashboard
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--json` | Print the full suggestions store as JSON (CI/agents) |
| `--limit <n>` | Cap the number of suggestions listed |
| `--apply <id>` | Apply one suggestion — runs the exact `npm install <library>@^<latest>`. Gated: asks for confirmation in a TTY, or pass `--yes`; in a non-TTY without `--yes` it only prints the command |
| `--yes` | Apply without prompting (with `--apply`) |
| `--open` | Write + open a self-contained HTML dashboard (`.vectalon/suggestions/report.html`, no network) — severity cards with current → latest versions, the install command, and an npm link |
| `--out <dir>` | Dashboard output directory (default `.vectalon/suggestions`) |

**What it does**

- Reads `.vectalon/knowledge/refresh/suggestions.json` (written by
  `vectalon refresh` and by `serve`'s hourly background loop) — read-only, no
  network
- Groups by severity (`❌ error` / `⚠️ warning` / `ℹ️ info`) with the
  `current → latest` version bump and the exact `--apply` command per row
- `--apply` matches a suggestion by its full id, its library name, or a
  `dep-<library>-` id prefix; the install runner is the same `runCommand`
  adapter used by the workflows
- The interactive menu's **"View suggestions (N)"** entry and `vectalon
  status`'s count line link here, and `serve`/`feature` refresh messages now
  end with `— run \`vectalon suggestions\``

**Exit codes**

| Code | When |
|---|---|
| 0 | Listed / JSON printed / applied / dashboard written |
| 1 | No `.vectalon/` directory, unknown `--apply` id, or the install failed |

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

## `team-policy`

**Org-wide guardrail policy** (Team brain v2): publish your project's policy +
shared bundle budgets through the sync remote, and pull the org policy into
`.vectalon/team/` — so one policy change gates every project that follows it.

```bash
npx vectalon team-policy --push                 # publish policy + budgets as the org policy
npx vectalon team-policy --pull                 # fetch the org policy into .vectalon/team
npx vectalon team-policy --show                 # print the effective policy + budget settings
npx vectalon team-policy --check src/App.tsx    # run the effective (org + local) policy
npx vectalon team-policy --budget '{"largeLibBytes":65536}'   # local budget override
npx vectalon team-policy --remove               # stop following the org policy
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--push` | Publish this project's policy + budgets as the org policy on the sync remote |
| `--pull` | Fetch the org policy into `.vectalon/team` — effective immediately for policy checks, code review, and bundle budgets |
| `--check <file>` | Run the effective (org + local) policy against a source file |
| `--show` | Print the effective policy and budget settings |
| `--budget <json>` | Set local budget overrides, e.g. `{"largeLibBytes":65536}` |
| `--remove` | Stop following the org policy (delete the cached copy) |
| `--remote <url>` | Git remote URL (default: `.vectalon/sync.json`) |
| `--branch <name>` | Remote branch (default: `.vectalon/sync.json`) |
| `--force` | Override a disabled sync config |

**Exit codes**

| Code | When |
|---|---|
| 0 | Published / pulled / shown / checked |
| 1 | No `.vectalon/`, no sync config, no org policy cached, or the operation failed |

---

## `pull`

Download a local model preset. Accepts a **usage tier** (`fast` \| `balanced` \| `quality`) or a model id; with no argument it downloads the tier auto-selected for this machine's RAM — the same model `init` picked.

```bash
npx vectalon pull              # download the auto-selected tier for this machine (~1–5 GB)
npx vectalon pull balanced     # the 3B tier (16 GB RAM class)
npx vectalon pull quality      # the 7B flagship tier (32 GB RAM class)
npx vectalon pull qwen2.5-coder-3b   # or a raw model id
```

**Exit codes**

| Code | When |
|---|---|
| 0 | Model downloaded (or already exists) |
| 1 | Unknown preset, or download failed |

---

## `support`

Collect and upload a **sanitized support bundle** so bug reports arrive
structured instead of as log dumps: the last log lines, the pending error
queue, the last crash report, a sanitized `package.json`, and a listing of
`.vectalon/`. Secrets (API keys, tokens, credentials) are redacted
recursively before upload; the bundle is stamped with a support token
(`RN-XXXXXXXX`) and also saved locally to `.vectalon/support-bundle.json`.

```bash
# Print usage / what the upload includes
npx vectalon support

# Upload the bundle (offline → bundle is saved locally, retry later)
npx vectalon support --upload
```

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--upload` | Upload the sanitized bundle and print the support token |
| `--out <path>` | Write the bundle to a custom path (default `.vectalon/support-bundle.json`) |

**Exit codes**

| Code | When |
|---|---|
| 0 | Bundle collected (upload success or offline fallback) |

---

## `models`

List the three usage tiers (`fast` → 1.5B / 8 GB RAM, `balanced` → 3B / 16 GB,
`quality` → 7B / 32 GB) with the one **auto-selected for this machine**, the
GGUF models actually downloaded, and the zero-config WASM tier (whether its
weights are cached).

```bash
npx vectalon models
```

**Exit codes**

| Code | When |
|---|---|
| 0 | Always (list printed) |

---

## `mode`

**The deployment-mode surface — where your source runs.** The commercial
differentiator: your source code stays inside your environment. Shows the
current mode (from `.vectalon/rn-vectalon.json`, default **air-gapped**),
verifies the configured model provider is inside it, and lays out the whole
privacy ladder.

```bash
npx vectalon mode                  # current mode + the full ladder
npx vectalon mode --json           # machine-readable: mode, provider, compliance
npx vectalon mode --set air-gapped # declare a mode (refuses an outside provider)
```

Three explicit modes, mapping the ModelRouter's providers (local / WASM /
remote with automatic fallback and circuit breaker) onto a privacy ladder:

| Mode | What runs | What leaves | Providers |
|---|---|---|---|
| **Cloud** | Vectalon Cloud / hosted model APIs (OpenAI, Anthropic, Azure, Groq) | Prompts and context go to the model provider you chose | `openai` \| `anthropic` \| `azure-openai` \| `groq` (and any) |
| **Private** | A company-controlled LLM (Ollama / vLLM on your own infrastructure) | Nothing to third parties — requests stay inside your network | `ollama` \| `vllm` \| `local` \| `wasm` |
| **Air-gapped** | A local GGUF model (Qwen2.5-Coder) or WASM on the developer machine | Nothing — inference runs entirely on the machine | `local` \| `wasm` |

Modes are **enforced, not labeled**: `vc init --mode private --model openai`
is refused with the allowed set, `vc mode --set air-gapped` refuses a
provider outside the mode, and `vc mode` (or `--json`) verifies the
configured provider against the declared mode with the dataflow line. The
deterministic agents (review, score, fix, sec, …) need no model at all, so
the entire control-plane surface works fully air-gapped.

**Options**

| Option | Description |
|---|---|
| `--set <mode>` | Declare the deployment mode: `cloud` \| `private` \| `air-gapped` (refuses a provider outside the mode) |
| `--json` | Print machine-readable output: mode, provider, compliance, dataflow, full ladder |

**Exit codes**

| Code | When |
|---|---|
| 0 | Mode shown / set successfully |
| 1 | Fatal error or refused mode/provider mismatch |

---

## `demo`

**The flagship demonstration — the feature workflow, live.** The most
impressive thing in the repo, as a hero surface: one command, "Build a Login
feature.", produces Requirement → Architecture decision → Affected files →
Implementation plan → Code → Tests → Review → Build verification → PR — and
the self-healing loop (build failed → diagnose → modify → rebuild → verify)
runs a failed gate back through implementation until it passes.

Deterministic and offline — zero model calls. When a prior workflow run
exists under `docs/vectalon/feature-development/`, its real phases, statuses,
and written files are shown; otherwise the canonical 14-stage pipeline and
the healing loop are rendered. To run the workflow for real, use
`vectalon feature "<prompt>"`.

```bash
npx vectalon demo          # the flagship workflow, from a real prior run when present
npx vectalon demo --json   # pipeline + healing loop + prior run as JSON
```

**Exit codes**

| Code | When |
|---|---|
| 0 | Demo rendered (prior run or canonical pipeline) |
| 1 | Fatal error |

---

## `auth`

Manage your license and trial: activate a license key, authenticate with
GitHub (to start a trial), log out, or show the current auth status.

```bash
npx vectalon auth                     # show current auth status (default)
npx vectalon auth --license <key>     # activate a license key
npx vectalon auth --github            # authenticate with GitHub (starts a 14-day trial)
npx vectalon auth --logout            # clear the license and revert to the free tier
```

**Options**

| Option | Description |
|---|---|
| `--license <key>` | Activate a license key (prints tier, expiry, and covered products) |
| `--github` | GitHub OAuth device flow — used to start a trial |
| `--status` | Show the current auth status (same as the default) |
| `--logout` | Clear the stored license and trial |

**Exit codes**

| Code | When |
|---|---|
| 0 | Success (license activated, logged out, or status printed) |
| 1 | The `--license` key was invalid |

---

## `team`

**Team Brain** (Roadmap 041-049): project glossary, coding standards,
expertise map, ADR/decision index, PR knowledge, and onboarding brief —
seeded into the knowledge base and written to `docs/vectalon/team/`.
`--search` queries the team knowledge base across projects.

```bash
npx vectalon team                          # build the team knowledge base
npx vectalon team --search "navigation patterns"  # semantic/lexical search
npx vectalon team --project my-app --type adr --search "codegen"
npx vectalon team --projects               # list registered projects
npx vectalon team --json                   # machine-readable output
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--search <query>` | Search the team knowledge base (semantic when embeddings configured, lexical otherwise) |
| `--project <name>` | Scope `--search` to one registered project |
| `--team <name>` | Scope `--search` to one team |
| `--type <type>` | Scope `--search` to one artifact type |
| `--limit <n>` | Search result cap (default 5) |
| `--projects` | List registered team projects |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Knowledge base built or search results printed |
| 1 | Fatal error |

---

## `review`

**PR Review Agent** (Roadmap 061): reviews the diff (uncommitted by default,
or `--base <ref>`) with deterministic rules plus the team-brain coding
standards, and an optional LLM pass. Report to `docs/vectalon/review/`.

```bash
npx vectalon review                        # review the uncommitted diff
npx vectalon review --base main            # review commits since main
npx vectalon review --model openai         # LLM pass override
npx vectalon review --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--base <ref>` | Git ref the diff is taken against (default: uncommitted changes) |
| `--model <provider>` | Model provider override for the LLM pass |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Review complete (verdict may still find issues) |
| 1 | Fatal error |

---

## `arch`

**Architecture Review Agent** (Roadmap 062): one deterministic pass over the
module graph — circular dependencies, layering violations (shared code
importing feature code), god modules, module over-coupling, wide fan-in,
orphans, and deep nesting — with a verdict and severity-ranked
recommendations. Report to `docs/vectalon/arch/`.

```bash
npx vectalon arch                          # analyze src/ by default
npx vectalon arch --src lib                # analyze a different source dir
npx vectalon arch --max-fanout 15 --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--src <dir>` | Source directory to analyze (default `src`) |
| `--max-fanout <n>` | Internal dependencies that make a file a god module (default 12) |
| `--max-module-fanout <n>` | Module fan-out that flags over-coupling (default 8) |
| `--max-depth <n>` | Directory levels under src that flag deep nesting (default 5) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Analysis complete |
| 1 | Fatal error |

---

## `sec`

**Security Review Agent** (Roadmap 063): one deterministic pass — hardcoded
secrets (redacted), unsafe code patterns (eval, shell injection, disabled
TLS, cleartext HTTP, SQL concatenation, weak crypto), and best-effort
`npm audit` dependency advisories — with a verdict and severity-ranked
recommendations. Report to `docs/vectalon/sec/`.

```bash
npx vectalon sec                           # full pass incl. npm audit
npx vectalon sec --no-audit                # skip the audit (fast, offline)
npx vectalon sec --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--no-audit` | Skip the npm audit dependency pass (fast, offline) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Scan complete |
| 1 | Fatal error |

---

## `build-fix`

**Build Fix Agent** (Roadmap 064): diagnoses a failing Metro, Gradle, or
Xcode build from its log — the kind is auto-detected (or forced with
`--metro`/`--gradle`/`--xcode`), the root cause is classified with the
standard fix, and corroborating failures are listed as a fix plan. Report to
`docs/vectalon/build-fix/`.

```bash
npx vectalon build-fix --log gradle.log    # auto-detect the build kind
npx vectalon build-fix --log build.log --metro   # force Metro
npx vectalon build-fix --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--log <path>` | Build log file to diagnose (Metro, Gradle, or Xcode) |
| `--metro` | Force the log kind to Metro bundler output |
| `--gradle` | Force the log kind to Gradle output |
| `--xcode` | Force the log kind to Xcode output |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Diagnosis complete |
| 1 | Fatal error |

---

## `fix`

**The killer workflow — "Fix my React Native issue"** (P0): one command that
understands the project, diagnoses the root cause, explains it, proposes a
fix, applies it in a sandbox, runs tests/build, verifies, and shows exactly
what changed — one structured verdict, zero model calls. Pass the issue in
your own words (or attach a failing build log with `--log`). Report to
`docs/vectalon/fix/`.

```bash
npx vectalon fix "Android build started failing after upgrading RN"
npx vectalon fix "Android build started failing after upgrading RN" --log gradle.log
npx vectalon fix "iOS build is failing after pod install" --log xcode.log
npx vectalon fix "..." --apply        # write the verified edits to your tree
npx vectalon fix "..." --json
```

The verdict is one structured block:

```
Root cause:        Kotlin 1.8.0 is below the 1.9.24 this project needs
Evidence:          android/build.gradle — kotlinVersion = 1.8.0 → requires >= 1.9.24
Impact:            3 packages (react-native, react-native-ble, @react-native-community/slider)
Recommended fix:   Upgrade the Kotlin plugin to 1.9.24 in android/build.gradle.
Applied:           ✓ android/build.gradle ×3 · ✓ android/gradle/wrapper/gradle-wrapper.properties
Verification:      ✓ TypeScript · ✓ Jest · ○ Gradle (not run — sandbox has no Android SDK)
Confidence:        94%
```

Diagnosis reuses the committed analyzers: the Gradle/Xcode/Metro log
classifiers, the project-side SDK/AGP/Kotlin checks against the RN-required
versions (compileSdk, Kotlin, Gradle wrapper, AGP, NDK per RN release), and
`requires Kotlin >= X` parsing from the log or issue text. Edits are literal
text replacements (`from` must exist verbatim or the edit is skipped) applied
in a throwaway sandbox copy by default — your tree is never touched without
`--apply`. Verification is bounded: `tsc --noEmit`, `jest --silent`, and
`./gradlew assembleDebug` (the last only with `--apply`, since a sandbox has
no Android SDK). Confidence is deterministic and explainable: evidence
strength, applied edits, and verification results.

**Options**

| Option | Description |
|---|---|
| `[issue]` | Natural-language issue, e.g. "Android build started failing after upgrading RN" |
| `--log <path>` | A failing Metro/Gradle/Xcode build log to classify |
| `--apply` | Write the verified edits to your tree (refuses a dirty git tree unless `--force`) |
| `--force` | Allow `--apply` on a dirty working tree |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Diagnosis complete (verdict is in the report) |
| 1 | Fatal error |

---

## `score`

**The Vectalon Engineering Health Score** (P0) — one 0-100 number an
engineering manager immediately understands, aggregated from eight
deterministic dimensions, each scored by a committed scanner consuming the
shared Project Intelligence model (`readProjectIntel`): Architecture
(arch-score), Dependencies (deps scan + dep-graph cycles), Build Health
(native config vs the RN-required table), Testing (test-file ratio + jest),
Performance (perf-scan), Security (secrets/unsafe/audit), Accessibility
(a11y scan), and RN Upgrade Risk (impact vs the latest known RN). Zero model
calls. Report + history to `docs/vectalon/score/`.

```bash
npx vectalon score                # the full scorecard — overall + 8 dimensions
npx vectalon score --json         # machine-readable report
```

The scorecard is the sellable number:

```
Overall  82/100  ████████████████████░░░░░░  grade B

Architecture     91 ██████████████████████░░  Clean module boundaries, no cycles
Dependencies     74 ██████████████████░░░░░░  3 findings (1 error, 2 warning)
Build Health     88 ██████████████████████░░  Native config aligned with RN-required versions
Testing          67 ████████████████░░░░░░░░  4 test files for 21 source files
Performance      81 ████████████████████░░░░  2 hazards (0 error, 2 warning)
Security         93 ██████████████████████░░  No secrets or unsafe patterns found
Accessibility    72 ██████████████████░░░░░░  5 findings (1 error, 4 warning)
RN Upgrade Risk  61 ██████████████░░░░░░░░░░  react-native 0.72.5 → 0.86.2 (0 majors behind)

↓ 8 points this week

New problems:
3 dependency risks · 2 performance regressions · 1 architecture violation

Recommended actions
P0  Fix Android dependency conflict
P1  Add E2E test for Checkout
P1  Remove circular dependency
P2  Upgrade deprecated RN API
```

The delta ("↓ 8 points this week") comes from `history.json` — the previous
run is always the baseline, and findings that newly appeared are reported as
"New problems". Every finding maps to a P0/P1/P2 recommended action (error →
P0, warning → P1, info → P2). A dimension whose scanner cannot run (missing
source, unreadable config) is skipped and the overall renormalizes over the
dimensions that scored — `vc score` never fails the run.

**Options**

| Option | Description |
|---|---|
| `--audit` | Run the npm audit pass inside deps/security (default: skipped — the score is offline) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Score computed (verdict is in the report) |
| 1 | Fatal error |

---

## `test-repair`

**Test Repair Agent** (Roadmap 065): diagnoses a failing Jest, Detox, or
Maestro test run from its output log — the kind is auto-detected (or forced
with `--jest`/`--detox`/`--maestro`), the root cause is classified with the
standard fix, and corroborating failures are listed as a fix plan. Report to
`docs/vectalon/test-repair/`.

```bash
npx vectalon test-repair --log jest.log     # auto-detect the runner
npx vectalon test-repair --log out.log --maestro  # force Maestro
npx vectalon test-repair --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--log <path>` | Test output log to diagnose (Jest, Detox, or Maestro) |
| `--jest` | Force the log kind to Jest output |
| `--detox` | Force the log kind to Detox output |
| `--maestro` | Force the log kind to Maestro output |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Diagnosis complete |
| 1 | Fatal error |

---

## `refactor`

**Refactoring Agent** (Roadmap 066): one deterministic pass over the project
source files that proposes concrete, safe refactors — dead code (unused
imports/variables, unreachable statements), duplication (repeated blocks and
strings), modernization (optional chaining, includes, strict equality,
const/let), type smells (any, ts-ignore), inline-style debt, console noise,
and complexity — line-pinned with suggestions. Report to
`docs/vectalon/refactor/`.

```bash
npx vectalon refactor                      # full refactor scan
npx vectalon refactor --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Scan complete |
| 1 | Fatal error |

---

## `deps`

**Dependency Upgrade Agent** (Roadmap 067): finds what to upgrade and the
safe path — RN ecosystem pairing violations against the curated matrix,
duplicate versions across workspace members, and vulnerable dependencies via
best-effort `npm audit` (critical → error, high → warning) with `npm audit
fix` guidance. Report to `docs/vectalon/deps/`.

```bash
npx vectalon deps                          # full pass incl. npm audit
npx vectalon deps --no-audit               # skip the audit (fast, offline)
npx vectalon deps --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--no-audit` | Skip the npm audit dependency pass (fast, offline) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Scan complete |
| 1 | Fatal error |

---

## `a11y`

**Accessibility Agent** (Roadmap 068): one deterministic pass over component
files — unlabeled images (error), touchables without roles, unlabeled
TextInputs, and undersized touch targets — line-pinned with fixes. Report to
`docs/vectalon/a11y/`.

```bash
npx vectalon a11y                          # accessibility scan
npx vectalon a11y --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Scan complete |
| 1 | Fatal error |

---

## `release-ready`

**Release Readiness Agent** (Roadmap 069): answers “can we ship?” — version
bumped past the last tag, CHANGELOG section present, clean tree, CI
workflows, lockfile, tests configured, secrets hygiene, and TODO/FIXME
triage. Read-only git. Report to `docs/vectalon/release-ready/`.

```bash
npx vectalon release-ready                 # ship / no-ship verdict
npx vectalon release-ready --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Check complete (verdict may be no-ship) |
| 1 | Fatal error |

---

## `bug-fix`

**Autonomous Bug Fix Agent** (Roadmap 070): proposes fixes for deterministic
defects and applies the provably-safe ones — whole-line unused-import
removal and var→const — with `--apply` (refusing a dirty git tree unless
`--force`). Dry-run by default. Report to `docs/vectalon/bug-fix/`.

```bash
npx vectalon bug-fix                       # dry-run: propose fixes only
npx vectalon bug-fix --apply               # apply the safe fixes (clean tree)
npx vectalon bug-fix --apply --force       # allow a dirty working tree
npx vectalon bug-fix --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--apply` | Execute the safe fixes (git working tree must be clean unless `--force`) |
| `--force` | Allow `--apply` on a dirty working tree |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Report printed, or fixes applied successfully |
| 1 | Fatal error |

---

## `crash`

**Crash Intelligence Agent** (Roadmap 071): classifies an iOS, Android, or JS
crash log into a root-cause bucket with the standard fix and investigation
steps. Platform is auto-detected or forced with
`--platform ios|android|javascript`. Report to `docs/vectalon/crash/`.

```bash
npx vectalon crash --log crash.log         # auto-detect the platform
npx vectalon crash --log crash.log --platform ios
npx vectalon crash --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--log <path>` | Path to the crash log to classify |
| `--platform <name>` | Force the crash platform (ios, android, javascript) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Classification complete |
| 1 | Fatal error |

---

## `arch-score`

**Mobile Architecture Scorecard** (Roadmap 072): a deterministic 0-100 score
across cycles, layer boundaries, coupling, module cohesion, testability, and
nesting depth — with a grade and top improvements. Report to
`docs/vectalon/arch-score/`.

```bash
npx vectalon arch-score                    # score src/ by default
npx vectalon arch-score --src lib --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--src <dir>` | Source directory to score (default: `src`) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Scorecard complete |
| 1 | Fatal error |

---

## `cicd`

**CI/CD Intelligence Agent** (Roadmap 073): scans CI workflows for
anti-patterns — unpinned third-party actions, missing concurrency/timeouts,
secrets in inline env, deploy steps without a test gate, missing
`workflow_dispatch`. Report to `docs/vectalon/cicd/`.

```bash
npx vectalon cicd                          # scan .github/workflows
npx vectalon cicd --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Scan complete |
| 1 | Fatal error |

---

## `app-store`

**App Store Readiness Agent** (Roadmap 074): iOS/Android store-readiness —
version/version-code consistency across Info.plist, build.gradle, and
package.json, app icons, iOS privacy manifest, Android permissions,
cleartext posture. Report to `docs/vectalon/app-store/`.

```bash
npx vectalon app-store                     # store-readiness checklist
npx vectalon app-store --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Check complete |
| 1 | Fatal error |

---

## `soc2`

**SOC2 Readiness Agent** (Roadmap 075): a repository-evidence checklist
mapped to the five trust-service criteria plus operational hygiene — access
control, audit logging, encryption, backups, incident response, vendor
management, privacy policy. Report to `docs/vectalon/soc2/`.

```bash
npx vectalon soc2                          # evidence checklist
npx vectalon soc2 --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Check complete |
| 1 | Fatal error |

---

## `tokens`

**Design Token Sync Agent** (Roadmap 076): parses the design-token file and
checks for drift — tokens never referenced in source (orphans), hardcoded
colors that should be tokens, and duplicate token values. Report to
`docs/vectalon/tokens/`.

```bash
npx vectalon tokens                        # token drift scan
npx vectalon tokens --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Scan complete |
| 1 | Fatal error |

---

## `team-stats`

**Team Productivity Analytics** (Roadmap 077): deterministic git-history
analytics — commit cadence, author distribution, bus factor, category mix,
change velocity. Read-only git. Report to `docs/vectalon/team-stats/`.

```bash
npx vectalon team-stats                    # git analytics
npx vectalon team-stats --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Analytics complete |
| 1 | Fatal error |

---

## `perms`

**Agent Permissions Audit** (Roadmap 078): scans agent/MCP configuration
(Claude Code settings, Cursor MCP, `.mcp.json`) for over-permissioned tool
grants and credentials in config. Report to `docs/vectalon/perms/`.

```bash
npx vectalon perms                         # permissions audit
npx vectalon perms --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Audit complete |
| 1 | Fatal error |

---

## `dashboard`

**Engineering Dashboard** (Roadmap 079): aggregates every agent report under
`docs/vectalon/*` into one executive view — per-agent health, overall
verdict, and a self-contained HTML dashboard with per-agent drill-down:
click any agent card to open its full findings list (severity, id, message,
suggestion) with links to that agent's markdown and JSON reports. `--run`
regenerates the fast Phase 9/10 core reports first. `--cron` keeps
regenerating them (and the HTML) on a schedule until Ctrl-C, so the
dashboard stays fresh while you work. Report to `docs/vectalon/dashboard/`.

```bash
npx vectalon dashboard                     # aggregate existing reports
npx vectalon dashboard --run               # regenerate fast reports first
npx vectalon dashboard --cron              # regenerate every 5 min until Ctrl-C
npx vectalon dashboard --cron --interval 60
npx vectalon dashboard --open              # open the HTML dashboard
npx vectalon dashboard --json
```

**Reading your reports** — reports never leave your project unless you share
them. Three ways to read them:

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

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--run` | Regenerate the fast Phase 9/10 core reports (release-ready, arch-score, soc2, figma, sentry, observability, governance, audit, repos, release-predict, play-store, dataset, lora) first |
| `--cron` | Keep regenerating the fast core reports + HTML on a schedule until Ctrl-C |
| `--interval <seconds>` | Cron regeneration interval in seconds (default 300) |
| `--open` | Open the HTML dashboard in the default browser |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Dashboard written |
| 1 | Fatal error |

---

## `figma`

**Figma-to-code Sync Agent** (Roadmap 080): parses a Figma design export
(figma.json / design-export.json) and checks design↔code drift — design
colors with no matching token or hardcoded value, component names with no
source component, text styles with no font usage. Report to
`docs/vectalon/figma/`.

```bash
npx vectalon figma                # check design↔code drift
npx vectalon figma --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Scan completed |
| 1 | Fatal error |

---

## `sentry`

**Sentry Intelligence Agent** (Roadmap 081): ingests Sentry/Crashlytics
telemetry exports (.vectalon/telemetry), groups crashes into classes by
exception type, ranks them by volume and user impact, attaches a
root-cause verdict per class, and flags release regressions. Report to
`docs/vectalon/sentry/`.

```bash
npx vectalon sentry               # rank crash classes from telemetry
npx vectalon sentry --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Scan completed |
| 1 | Fatal error |

---

## `observability`

**Mobile Observability Agent** (Roadmap 082): audits instrumentation
coverage in source (Sentry init, crash handlers, analytics SDK, network
breadcrumbs, performance tracing) and flags slow traces/spans from
telemetry exports. Report to `docs/vectalon/observability/`.

```bash
npx vectalon observability        # audit instrumentation + slow traces
npx vectalon observability --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Scan completed |
| 1 | Fatal error |

---

## `governance`

**Enterprise Governance Agent** (Roadmap 083): repository-evidence
checklist — license, security policy, contributing guide, CODEOWNERS, PR
template, lockfile/SBOM, Dependabot, CI. Report to
`docs/vectalon/governance/`.

```bash
npx vectalon governance           # governance evidence checklist
npx vectalon governance --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Scan completed |
| 1 | Fatal error |

---

## `audit`

**Org-wide Audit Trail Agent** (Roadmap 084): validates the
.vectalon/audit/*.jsonl trail — required fields, sequence continuity,
secret hygiene — and summarizes activity by actor and action. Report to
`docs/vectalon/audit/`.

```bash
npx vectalon audit                # validate the audit trail
npx vectalon audit --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Scan completed |
| 1 | Fatal error |

---

## `repos`

**Multi-repository Memory Agent** (Roadmap 085): verifies the
.vectalon/repos.json workspace manifest — each sibling repo reachable, a
git checkout, with a memory store. Report to `docs/vectalon/repos/`.

```bash
npx vectalon repos                # verify the workspace manifest
npx vectalon repos --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Scan completed |
| 1 | Fatal error |

---

## `release-predict`

**Release Prediction Agent** (Roadmap 086): deterministic release-risk
score (0-100) from read-only git history — fix density, refactor density,
staleness, breaking changes, author breadth in the release window. Report
to `docs/vectalon/release-predict/`.

```bash
npx vectalon release-predict      # predict release risk
npx vectalon release-predict --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Scan completed |
| 1 | Fatal error |

---

## `play-store`

**Deep Play Store Readiness Agent** (Roadmap 087): Play-specific checks
beyond the shared store surface — manifest permissions and the data-safety
form they imply, exported components, backup rules, SDK target/compile/min
levels, signing, and measured listing assets (icon, feature graphic,
screenshots, listing text). Report to `docs/vectalon/play-store/`.

```bash
npx vectalon play-store           # deep Play readiness checklist
npx vectalon play-store --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Scan completed |
| 1 | Fatal error |

---

## `dataset`

**Fine-tuning Dataset Agent** (Roadmap 088): validates
.vectalon/dataset/*.jsonl training data — schema consistency, duplicates,
label balance, length outliers, PII leakage. Report to
`docs/vectalon/dataset/`.

```bash
npx vectalon dataset              # validate training data
npx vectalon dataset --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Scan completed |
| 1 | Fatal error |

---

## `lora`

**LoRA Training Readiness Agent** (Roadmap 089): checks the
.vectalon/lora config — dataset path, base model with a VRAM estimate,
r/alpha/quantization, output dir. Report to `docs/vectalon/lora/`.

```bash
npx vectalon lora                 # LoRA training readiness
npx vectalon lora --config .vectalon/lora/config.yaml
npx vectalon lora --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--config <path>` | Path to the LoRA config (default .vectalon/lora/config.json) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Scan completed |
| 1 | Fatal error |

---

## `gh-pr`

**GitHub PR Triage Agent** (Roadmap 090): scores every open PR for
merge-readiness in one deterministic pass — age, draft state, size
(additions+deletions), review decision, CI check rollup, and
mergeability. Reads `gh pr list --json` when the GitHub CLI is available,
or a `--file` export with the same shape; degrades to an explicit
no-data verdict when neither exists. Report to `docs/vectalon/gh-pr/`.

```bash
npx vectalon gh-pr               # triage open PRs via the gh CLI
npx vectalon gh-pr --file prs.json
npx vectalon gh-pr --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--file <path>` | Read PR JSON from an export file instead of the gh CLI |
| `--max-prs <n>` | Maximum number of PRs to analyze (default 50) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Scan completed |
| 1 | Fatal error |

---

## `gh-issue`

**GitHub Issue Intelligence Agent** (Roadmap 091): triage signal from the
open-issue backlog in one deterministic pass — staleness, unassigned
triage gaps, and label hygiene. Reads `gh issue list` when the GitHub CLI
is available, or a `--file` export with the same shape; degrades to an
explicit no-data verdict when neither exists. Report to
`docs/vectalon/gh-issue/`.

```bash
npx vectalon gh-issue              # triage the open issue backlog
npx vectalon gh-issue --file issues.json
npx vectalon gh-issue --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--file <path>` | Read issue JSON from an export file instead of the gh CLI |
| `--max <n>` | Maximum number of issues to analyze (default 100) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Scan completed |
| 1 | Fatal error |

---

## `gh-ci`

**GitHub Workflow Reliability Agent** (Roadmap 092): flake + duration
intelligence from recent workflow runs — per-workflow failure rates,
flaky-run detection (passed on retry), and slow-CI duration outliers.
Reads `gh run list --json` when the GitHub CLI is available, or a `--file`
export with the same shape; degrades to an explicit no-data verdict when
neither exists. Report to `docs/vectalon/gh-ci/`.

```bash
npx vectalon gh-ci                 # analyze recent workflow runs
npx vectalon gh-ci --file runs.json
npx vectalon gh-ci --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--file <path>` | Read run JSON from an export file instead of the gh CLI |
| `--limit <n>` | Number of recent runs to fetch (default 100) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Scan completed |
| 1 | Fatal error |

---

## `gh-sec`

**GitHub Security Posture Agent** (Roadmap 093): repository security in one
deterministic pass — dependabot alerts, secret scanning, branch
protection, and review enforcement. Reads the `gh api` endpoints when the
GitHub CLI is available, or a `--file` export with the same shape;
degrades to an explicit no-data verdict when neither exists. Report to
`docs/vectalon/gh-sec/`.

```bash
npx vectalon gh-sec                # scan the security posture
npx vectalon gh-sec --file sec.json
npx vectalon gh-sec --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--file <path>` | Read security data from a JSON export instead of the gh API |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Scan completed |
| 1 | Fatal error |

---

## `monitor`

**Observability Dashboard Agent** (Roadmap 094): folds telemetry into one
executive view — crash classes (sentry), instrumentation + slow traces
(observability), crash intelligence, the engineering dashboard verdict,
and raw `.vectalon/telemetry` events. Report to `docs/vectalon/monitor/`.

```bash
npx vectalon monitor               # fold telemetry into one executive view
npx vectalon monitor --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Scan completed |
| 1 | Fatal error |

---

## `evals`

**Model Evaluation Harness** (Roadmap 095): scores golden eval cases
exactly (`exact` / `includes` / `regex` matchers) from
`.vectalon/evals/cases.json`, with a regression comparison against the
previous run when one exists. Report to `docs/vectalon/evals/`.

```bash
npx vectalon evals                  # score .vectalon/evals/cases.json
npx vectalon evals --cases my-cases.json
npx vectalon evals --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--cases <path>` | Path to the cases file (default .vectalon/evals/cases.json) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Scan completed |
| 1 | Fatal error |

---

## `search`

**Semantic Code Search Agent** (Roadmap 096): lexical project search with
line-pinned, ranked results across source files. Requires `--query`;
results are ranked by hit density and file relevance. Report to
`docs/vectalon/search/`.

```bash
npx vectalon search --query "memoized list"
npx vectalon search --query "perf" --limit 50
npx vectalon search --query "theme" --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--query <terms>` | Search terms to find in the project source (required) |
| `--limit <n>` | Maximum number of results (default 20) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Scan completed |
| 1 | Fatal error |

---

## `incident`

**Incident Commander Agent** (Roadmap 097): from a crash log (`--log`) or
the latest crash report to an incident brief — root cause, hot files with
recent commits, release risk, and next steps. Report to
`docs/vectalon/incident/`.

```bash
npx vectalon incident --log crash.log
npx vectalon incident               # uses the latest crash report
npx vectalon incident --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--log <path>` | Path to the crash log to analyze (default: latest crash report) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Scan completed |
| 1 | Fatal error |

---

## `train`

**Release Train Automation** (Roadmap 098): dry-run release planning across
every workspace repo — version vs the last tag, changelog section present,
clean tree, and a suggested semver bump. Read-only; nothing is modified.
Report to `docs/vectalon/train/`.

```bash
npx vectalon train                  # plan the release train
npx vectalon train --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Scan completed |
| 1 | Fatal error |

---

## `cost`

**Cost Governance Agent** (Roadmap 099): estimates cloud + model spend from
project config — LoRA training (VRAM × hours), eval inference, dataset
processing, model endpoints — with explicit rate assumptions. All figures
are labeled as estimates, never actuals. Report to `docs/vectalon/cost/`.

```bash
npx vectalon cost                   # estimate project spend
npx vectalon cost --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Scan completed |
| 1 | Fatal error |

---

## `dx`

**DX Scoring Agent** (Roadmap 100): one developer-experience score (0-100)
from local evidence — README, contributing guide, docs, CI, tests, lint,
strict types, changelog, onboarding, and source complexity — with a grade
and the top improvements. Report to `docs/vectalon/dx/`.

```bash
npx vectalon dx                     # score the developer experience
npx vectalon dx --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Scan completed |
| 1 | Fatal error |

---

## `archive`

**Build Archive Agent** (Archive & Share, Phase 1): builds (or ingests a
pre-built) IPA/APK/AAB, computes its SHA-256, writes a typed `BuildManifest`
with full provenance (git, flavor, environment, build number, platform), and
stores both under `.vectalon/builds/`. Zero-config flavor detection from
Gradle `productFlavors`, Xcode schemes, and `eas.json` build profiles.
Credentials are never stored. Reports to `docs/vectalon/archive/`.

```bash
npx vectalon archive                        # archive default flavor, current platform
npx vectalon archive --flavor staging       # archive the staging flavor
npx vectalon archive --list                 # list archived builds
npx vectalon archive --init                 # write flavors.json (auto-detected)
npx vectalon archive --no-build --artifact ./app.apk   # ingest a pre-built artifact
npx vectalon archive --dry-run              # plan without side effects
npx vectalon archive --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--flavor <name>` | Build flavor (auto-detected when omitted) |
| `--platform <ios\|android>` | Target platform |
| `--environment <name>` | Build environment label |
| `--env-file <path>` | Env file to load for the build |
| `--build-number <n>` | Override the auto-incremented build number |
| `--no-build` | Skip the build; ingest an existing artifact |
| `--artifact <path>` | Path to a pre-built artifact (with `--no-build`) |
| `--list` | List archived builds |
| `--init` | Write `flavors.json` from auto-detection |
| `--dry-run` | Plan the build + manifest without writing anything |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Archive (or dry-run) completed |
| 1 | Fatal error (no flavor, no artifact, build failure) |

---

## `distribute`

**Distribution Agent** (Archive & Share, Phase 2): deploys an archived build
to TestFlight, the Google Play Store, the SaaS portal (`builds.vectalon.in`),
or a generated white-label portal. Credentials are never stored — the
command detects Fastlane/EAS/Expo or the direct API env vars and delegates,
or prints actionable instructions. `--dry-run` produces the exact plan with
zero side effects. Reports to `docs/vectalon/distribute/`.

```bash
npx vectalon distribute --target testflight --dry-run   # plan a TestFlight upload
npx vectalon distribute --target play-store --track internal
npx vectalon distribute --target saas --latest           # push latest build to SaaS
npx vectalon distribute --target portal --deploy static  # generate + deploy a portal
npx vectalon distribute --list-targets                   # list distribution targets
npx vectalon distribute --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--build <id>` | Build ID to distribute |
| `--latest` | Use the latest archived build |
| `--flavor <name>` | Filter builds by flavor |
| `--platform <ios\|android>` | Filter builds by platform |
| `--target <id>` | `testflight` \| `play-store` \| `saas` \| `portal` |
| `--track <name>` | Play Store track (default `internal`) |
| `--domain <host>` | Custom domain for portal deploy |
| `--list-targets` | List targets with tiers |
| `--dry-run` | Plan only — no side effects, no credentials needed |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Distribution (or dry-run) completed |
| 1 | Fatal error (no build, unknown target, upload failure) |

---

## `share`

**Local Share Agent** (Archive & Share, Phase 3): spins up an ephemeral
static server for an archived build — a self-contained install page with a
download link, optional tunnel (ngrok/localtunnel), optional QR code, and
auto-shutdown after `--expires`. Free tier, nothing leaves your machine
unless you enable the tunnel. Reports to `docs/vectalon/share/`.

```bash
npx vectalon share                        # serve the latest build locally
npx vectalon share --tunnel --qr           # tunnel + QR code for phone installs
npx vectalon share --expires 2h            # auto-shutdown after 2 hours
npx vectalon share --port 8787 --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--build <id>` | Build ID to share (default: the latest archived build) |
| `--flavor <name>` | Filter builds by flavor |
| `--platform <ios\|android>` | Filter builds by platform |
| `--port <n>` | Local port (default: ephemeral) |
| `--host <host>` | Bind host (default `127.0.0.1`) |
| `--tunnel` | Expose via ngrok/localtunnel if installed |
| `--qr` | Print a QR code for the share URL |
| `--expires <dur>` | Auto-shutdown after e.g. `30m`, `2h`, `90s` |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Server started (and reported) |
| 1 | Fatal error (no build, port in use) |

---

## `portal`

**White-label Portal Agent** (Archive & Share, Phase 4): generates a
self-contained static build portal (SSG) from the archive store — a listing
page plus per-build detail pages with install instructions and an embedded
`builds.json`. `--deploy vercel|netlify` prints the deploy command;
`--deploy static` exports the site for hosting anywhere. Team tier. Reports
to `docs/vectalon/portal/`.

```bash
npx vectalon portal --generate --out ./portal   # build the static portal
npx vectalon portal --deploy static --domain builds.example.com
npx vectalon portal --deploy vercel --json
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root (default: cwd) |
| `--generate` | Generate the static portal from the archive store |
| `--out <dir>` | Output directory (default `portal-dist`) |
| `--domain <host>` | Custom domain for the portal |
| `--branding <name>` | Portal title/branding (default project name) |
| `--deploy <target>` | `static` \| `vercel` \| `netlify` |
| `--json` | Print machine-readable output |

**Exit codes**

| Code | When |
|---|---|
| 0 | Portal generated / deploy plan printed |
| 1 | Fatal error (no builds, generation failure) |

---

## Global `--diagnostics` flag

`--diagnostics` works on **every** command (before or after the subcommand):

```bash
npx vectalon init --diagnostics
npx vectalon serve --protocol http --diagnostics
```

It captures Node/OS versions, RN/Expo versions, the model provider used, the
full stack trace (when the command failed), the **last 5000 log lines**, and a
sanitized listing of `.vectalon/`, then writes
`.vectalon/diagnostics-bundle.json`. Paste that file into a support ticket or
auto-upload it with `vectalon support --upload`.

Error telemetry (errors-only, opt-out) and the 5-minute liveness heartbeats
from `serve`/`daemon` are disabled in dev mode (`--dev`) and test runs, and
can be turned off with `telemetry.enabled=false` or `telemetry.errors=false`
in `~/.config/rn-vectalon/config.json`. The deep `GET /health` endpoint on
`vectalon serve --protocol http` returns `healthy | degraded | critical`
plus `checks[]` (model provider, artifact store, sub-MCP clients, init
config).
