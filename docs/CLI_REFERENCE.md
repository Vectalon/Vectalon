# vectalon CLI Reference

Complete reference for the `vectalon` command-line interface. Every command is
available as `npx vectalon <command>` (or `vectalon <command>` when installed
globally or linked).

Running `npx vectalon` with no arguments opens an **interactive menu** covering
the most common actions (init, feature, refresh, ecosystem, doctor, bench,
bundle, leaderboard, sync, policy, serve, import, pull, models, help).

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
npx vectalon init --model openai   # remote OpenAI provider (reads OPENAI_API_KEY)
npx vectalon init --model anthropic  # remote Anthropic provider (ANTHROPIC_API_KEY)
```

**Options**

| Option | Description |
|---|---|
| `[directory]` | Project root to scan (default: cwd) |
| `--model <provider>` | Default model provider: `local` \| `openai` \| `anthropic` |

**What it does**

- Scans `package.json`, `src/`, metro config, TypeScript setup, navigation
  patterns → writes `snapshot.json`, `context.md`, `memory.json`
- Adds **`.vectalon/` to the project's `.gitignore`** (creating the file when
  missing) — the workspace is per-machine runtime state and stays untracked
- Detects **Expo-managed vs bare RN CLI** (`tooling` + Expo SDK version) and
  records it in `.vectalon/rn-vectalon.json`
- Sets up the **model provider**: local download (Qwen2.5-Coder, ~1.1 GB,
  offered interactively) or a remote provider with env-var API keys (keys are
  never written to disk)
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
| `--model <provider>` | Model provider: `local` \| `openai` \| `anthropic` |

**What it does**

- Exposes **44 built-in MCP tools** — 37 by default, plus the knowledge-base
  and team-brain tools when those services are present (project context, SDLC
  modules, devices & E2E, knowledge base, team brain)
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

## `feature`

Run the end-to-end feature-development SDLC workflow from a single prompt.

```bash
npx vectalon feature "create a login screen and integrate the auth API"
npx vectalon feature "remove unused imports" --dry-run     # safe preview
npx vectalon feature "remove unused imports" --push        # commit, push, open PR
npx vectalon feature "add login screen" --device           # include iOS/Android builds
npx vectalon feature "fix all lint issues" --heal-attempts 5
npx vectalon feature "fix all lint issues" --heal-interactive
npx vectalon feature "add login screen" --resume <state-id> --from implementation
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
| `--model <provider>` | Model provider: `local` \| `openai` \| `anthropic` |
| `--push` | Allow git push and PR creation (default: local branch/commit only) |
| `--device` | Run device/simulator build checks during verification |
| `--heal-interactive` | Prompt before applying each self-healing review fix |
| `--heal-attempts <n>` | Max review→fix→re-review cycles (default 3) |
| `--heal-severity <level>` | Lowest severity that heals: `error` \| `warning` \| `info` |

**What it does**

- Classifies the prompt with **LLM intent detection** (`add-feature` / `fix` /
  `refactor` / `remove-dependency` / `unknown`), surfacing e.g.
  `Detected intent: fix/lint — LLM, confidence 0.95`
- Runs 13 phases: PRD → scope → design → architecture → tasks → **TDD tests**
  → implementation → **self-healing code review** → verification →
  readiness → PR → documentation → close
- Writes each phase's document to **`docs/vectalon/<workflow>/<run>/`** (under
  the project's `docs/`, so the team sees them in version control — not in the
  gitignored `.vectalon/` workspace)
- Applies **guardrails** (25 rules + `.vectalon/policy.json`) before writing
  files, and streams **live diffs** for every code change
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

## `bench`

Score the harness — or any model — on the RN coding tests benchmark.

```bash
npx vectalon bench                          # deterministic baseline (offline)
npx vectalon bench --suite data-flow        # only the data-flow suite
npx vectalon bench --live                   # run real tests/typecheck/lint
npx vectalon bench --live --install         # ... installing deps in each temp project first
npx vectalon bench --model local            # real-model leaderboard (all 11)
npx vectalon bench --model openai --json    # JSON summary for tooling
npx vectalon bench -o report.md             # write the report to a file
npx vectalon bench --scenarios ./my-evals   # run your own custom eval pack
npx vectalon bench --scenarios ./my-evals --references ./my-refs  # + custom human baselines
npx vectalon bench --baseline bench/baseline.json  # CI regression gate (exit 1 on regression)
```

**Options**

| Option | Description |
|---|---|
| `--model <provider>` | `local` \| `openai` \| `anthropic` — run the real-model pass |
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
`vectalon bench --live --install --model` on a `[local, openai, anthropic]`
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

List available and downloaded local models.

```bash
npx vectalon models
```

**Exit codes**

| Code | When |
|---|---|
| 0 | Always (list printed) |
