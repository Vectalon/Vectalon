# Vectalon Onboarding Guide

**Welcome to Vectalon** — a project-aware AI harness for React Native and Expo.
This guide teaches you how to use the package to its fullest: from first
install to shipping features, with every feature tour'd along the way.

> Looking for a command reference? See
> [`CLI_REFERENCE.md`](CLI_REFERENCE.md) for every command and option.

---

## What this is in one line

A project-aware AI harness for React Native/Expo — CLI, MCP server for any AI
coding agent, VS Code extension, benchmark suite, and a knowledge base — that
plans, writes, reviews, tests, and ships features for you, with guardrails on
everything it generates.

**What it is not:** a toy prompt wrapper. The guardrails, knowledge base,
benchmark suite, and SDLC pipeline are deterministic, offline-capable, and
tested (`vectalon selftest` runs every feature live).

---

## Part 1 — First 10 minutes (setup)

**Next action:** open your RN/Expo project and run:

```bash
npm install -D @vectalon-dev/rn
npx vectalon init
```

That's it. `init` (~2 min) scans your project and creates a `.vectalon/`
workspace (auto-gitignored): it detects **Expo vs bare RN-CLI**, snapshots your
codebase into a context snapshot, sets up a model provider, and enables the
right ecosystem tools for your flavor.

Pick your model during init:

| Provider | `--model` | Notes |
|---|---|---|
| Local GGUF | `local` | Qwen2.5-Coder presets, fully offline (~1.1 GB download) |
| Zero-config WASM | `wasm` | ONNX quantized model, downloads on first use, no API key |
| OpenAI | `openai` | `OPENAI_API_KEY`, default `gpt-4o` |
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY`, default `claude-sonnet-4-20250514` |
| Azure OpenAI | `azure-openai` | `AZURE_OPENAI_API_KEY` + endpoint in `modelConfig` |
| Groq | `groq` | `GROQ_API_KEY`, fast inference |
| Ollama | `ollama` | Local server, no API key (`http://localhost:11434`) |
| vLLM | `vllm` | Local server, no API key (`http://localhost:8000`) |

You can override the provider per command with `--model <provider>`; remote
API keys are read from the environment and never written to disk.

**Verify it works** — this is your "am I set up" test:

```bash
npx vectalon doctor      # toolchain + ecosystem health; --fix auto-repairs
npx vectalon selftest    # tests EVERY feature live, with progress + real model inference
```

`selftest` is the killer onboarding tool: it runs real checks for every module
(CLI, SDLC, guardrails, knowledge, MCP tools, workflows, bench, sandbox…) with
live progress, and writes `report.json` / `report.log` / `report.html` under
`.vectalon/selftest/`. Run `npx vectalon selftest --list` to see everycheck ID. If selftest passes, the whole package works.

**Want to see it all working before you touch your own project?** Clone the
[**demo app the onboarding video builds**](../demo/login-app/) — a login-screen
feature on Expo SDK 53 with the full workflow already run end-to-end
(`docs/vectalon/` inside it shows every phase doc + a green workflow state).
`cd apps/website/demo/login-app && npm ci`, then run `vectalon doctor`,
`vectalon selftest`, and `vectalon bundle --static` against it to watch the
tools work on a real project.

---

## Part 2 — Your daily loop (the core workflow)

**Next action:** type your first feature prompt:

```bash
npx vectalon feature "create a login screen with email + password and hook it to the auth API"
```

That single command runs a **13-phase SDLC pipeline** and writes the docs to
`docs/vectalon/<workflow>/<run>/`:

```
PRD → Scope → Design → Architecture → Tasks → TDD tests
→ Implementation → Self-healing code review → Verification
→ Readiness → PR → Documentation → Close
```

What makes it worth using daily:

1. **Self-healing review loop** — after writing code, it reviews it, fixes
   findings, re-reviews (default 3 attempts). Use `--heal-attempts 5` to push
   harder or `--heal-interactive` to approve each fix.
2. **Ticket-to-PR** — `npx vectalon feature --ticket MOB-123 --push` reads the
   Jira/GitHub/Monday ticket, runs the whole workflow from it, and opens a
   **real PR with the code review posted as a comment**.
3. **Guardrails on every write** — 35+ rules (no `console.log`, no inline
   styles, accessibility labels, New Architecture + React 19 rules) block bad
   code before it hits disk. Project overrides live in `.vectalon/policy.json`.
4. **Live diffs** — every file change streams to your terminal as it happens.

Other flags you'll want: `--dry-run` (preview only), `--device` (iOS/Android
build checks), `--from <phase>` + `--resume <state>` (resume mid-workflow),
and `--push` (commit, push, and open a PR).

---

## Part 3 — Feature-by-feature tour

### 3.1 Quality gates (run these before you merge anything)

| Command | What it catches | Cost |
|---|---|---|
| `npx vectalon doctor` | Broken toolchain, missing ecosystem deps; `--fix` auto-installs them | ~30s |
| `npx vectalon bundle` | Metro bundle bloat: libraries >100 KB, missing `sideEffects: false`, oversized images; snapshots growth over time | ~1 min |
| `npx vectalon profile --profile app.cpuprofile` | **Hermes runtime** problems: JS-thread blocking, retained heap, leak candidates — with baselines and regression flags | ~30s |
| `npx vectalon ci` | Generates EAS/GitHub Actions CI that runs your real lint/typecheck/test scripts | instant |

### 3.2 Performance & runtime intelligence

- **`vectalon profile`** — the "measured" layer: *"this `useEffect` blocks the
  JS thread for 500 ms — move to a worklet."* `--save-baseline` stores a
  baseline; later runs flag regressions (blocking time up >25% or retained
  heap up >30%). Also available as the MCP tool `analyze_hermes_profile`.
- **`vectalon daemon`** — background companion that watches Metro builds live:
  bundle deltas, build failures, Hermes JS-thread health every 30 s, proactive
  tips (*"your last Metro build added lodash — +80 KB"*). `--status` / `--stop`
  control it; `--wire-metro` auto-patches `metro.config.js` to feed it events.

### 3.3 The agent interface (MCP server + VS Code)

**Next action:** run `npx vectalon serve`, then point Claude Code / Cursor /
Windsurf / Codex at it. It exposes **58 project-aware MCP tools** in 4
categories:

- **CoreTools** — project context, learned patterns, `generate_component`,
  `review_code`, `analyze_error`, `check_guardrails`, `write_test`,
  cross-package impact
- **SdlcTools** — every SDLC module on demand: `write_prd`, `triage_bugs`,
  `analyze_root_cause`, `threat_model`, `check_accessibility`,
  `plan_release`, `derive_from_git_history`, `generate_maestro_flow`,
  Figma-to-component tools
- **KnowledgeTools** — search the knowledge base ranked by confidence, ingest
  telemetry, team brain
- **EcosystemTools** — device control (boot simulators, tap, swipe,
  screenshots, accessibility trees), sandboxed execution, headless component
  rendering

Use `--protocol http --port 8931` for Codex CLI/browsers:
`curl localhost:8931/tools` to discover tools, `POST /call` to invoke them.

The **VS Code extension** (search "Vectalon" in the Marketplace, id
`vectalon-dev.vectalon`) gives you a knowledge tree sidebar, guardrail checks
on save (Problems panel), a status-bar server indicator, and 9 command-palette
workflows (Run Feature Workflow, Review Code, Check Guardrails, Generate
Component, Show Project Context, Search Knowledge Base, Refresh Knowledge,
Start/Stop MCP Server) with a webview preview for results.

### 3.4 The knowledge base (your team's memory)

Everything Vectalon learns lands in a searchable store with **provenance +
confidence scores** (recent, high-confidence context wins). Knowledge
maintenance is Vectalon's job — no manual import step:

- `npx vectalon init` — scans the repo and seeds the knowledge base with a
  project snapshot, knowledge graph, code graph, native configuration, and
  learned patterns automatically
- `npx vectalon refresh` — pull best practices + dependency suggestions from
  the web and re-seed the repo-derived artifacts (idempotent); `serve` runs
  this maintenance hourly in the background
- `npx vectalon sync --push` / `--pull` — team brain across projects via a git remote
- `npx vectalon telemetry --path exports/` — ingest Sentry/Crashlytics and get
  data-driven crash analysis
- **Git-history derivation** — MCP tool `derive_from_git_history` writes your
  changelog, release notes, and ADR drafts automatically from `git log`
- **Traceability** — artifacts link to code, tests, and PRs, so context is
  never orphaned

### 3.5 Upgrade copilot (the "oh no, RN 0.77" button)

```bash
npx vectalon upgrade --to 0.76              # dry-run plan + impact analysis
npx vectalon upgrade --to 0.76 --apply      # run codemods + verify
```

Deterministic (no LLM guesswork): detects version, consults a curated
migration catalog, scans your code with AST-grade impact analysis (native
modules, bridge usage, Fabric-hostile patterns), applies codemods with backups
+ provenance manifest, then verifies with doctor / typecheck / bundle budget.

### 3.6 Security & trust (sandbox + render)

- `npx vectalon sandbox -- node tests.js` — runs code in an isolated process:
  env scrubbed to deny-by-default, network denied, CPU/memory/time bounds.
  "Run my generated tests safely" is solved.
- `npx vectalon render --entry src/App.tsx` — compiles + **headlessly renders**
  your TSX before you see the diff: console logs, render tree, runtime errors.
  Self-correcting agents fix JSX/TS before you ever see it.

### 3.7 Shipping (release pipeline)

```bash
npx vectalon release                  # detect bump + write changelog
npx vectalon release --submit         # generate E2E + store-submission workflow
npx vectalon release --monitor        # z-score crash anomaly detection + rollback gate
```

`--monitor` ingests Sentry/Crashlytics exports, buckets crashes hourly, and
flags windows exceeding baseline + n·stdDev (default 3σ) — auto-filing an
incident and suggesting rollback.

### 3.8 Benchmark (for the curious)

- `npx vectalon bench --live` — 11 coding scenarios scored for
  correctness/adherence/guardrails; `npx vectalon leaderboard` merges results
  into `BENCHMARK_RESULTS.md`. CI regression gate via `--baseline`.

### 3.9 Ecosystem catalog (plug in the world)

`npx vectalon ecosystem` lists 30+ curated items for RN/Expo:

- **MCP servers** — metro-mcp, expo-mcp, react-native-mcp, react-native-guide-mcp, react-native-upgrader-mcp
- **Skills** — expo-router, expo-ui, expo-tailwind-setup, expo-upgrade, react-native-expert, android-e2e-testing, …
- **Tools** — Reactotron, Flipper, RN DevTools, Zustand, MMKV, SecureStore, Reanimated, Gesture Handler, EAS CLI, Maestro, Detox, FlashList, expo-doctor, …
- **Hooks** — Husky, lint-staged, Lefthook

Enable items with `npx vectalon ecosystem --enable <id>`, filter by
`--category` / `--flavor`, and export an MCP client config fragment with
`--export`.

### 3.9.5 Impact regression coverage

Every `vectalon feature` run now treats **regression risk on affected screens**
as a first-class deliverable:

- The impact stage maps changed files → affected screens (AST-driven, no model
  calls) and writes `.maestro/<slug>-impact.yaml` regression flows for each one
  that has a deterministic route (deep link or initial route)
- Screens covered by accessibility criteria get an **accessibility variant**
  that walks the accessibility tree with explicit text selectors (the labels
  VoiceOver/TalkBack announce) and a namespaced screenshot for the PR diff
- Screens with no deterministic route are **reported, not silently dropped**:
  the verification phase names them in the E2E block, the close phase opens a
  `coverage`-labeled follow-up task (deduplicated against open tasks in the PM
  provider), and `vectalon coverage` renders the accumulated dashboard

### 3.10 Ops & support

- `npx vectalon status` — one command: daemon health, MCP reachability, model
  provider state, license/trial days, `.vectalon/` disk usage
- `npx vectalon <cmd> --diagnostics` — writes a full diagnostics bundle
  (works on every command)
- `npx vectalon support --upload` — sanitized support bundle + token for the
  maintainers
- `npx vectalon coverage` — per-screen E2E + accessibility gap dashboard
  (`docs/vectalon/coverage/coverage-gaps.md`), with links to the open
  follow-up tasks the close phase opened for uncovered screens
- `npx vectalon` (no args) — interactive menu of every command
- `--dev` unlocks every tier locally (contributors only; never in production)

---

## Part 4 — Where to go deeper

1. `npx vectalon selftest --list` — every checkable feature, by ID
2. `npx vectalon selftest --only <id> --verbose` — watch one feature work end-to-end
3. `npx vectalon ecosystem --category mcp` — browse the 30+ MCP servers/skills/tools/hooks you can enable
4. [`CLI_REFERENCE.md`](CLI_REFERENCE.md) — the full command reference
5. `packages/rn/src/sdlc/` — read any analyzer to understand exactly how it decides

**Golden rule:** when stuck, `npx vectalon doctor --fix` first, then
`npx vectalon selftest --only <feature>` to isolate.

---

## Tiers at a glance

| Tier | Price | Features |
|---|---|---|
| **Free** | $0 | Project scanning, 40+ MCP tools, component generation, test writing, ecosystem doctor, benchmark suite |
| **Pro** | $19/mo | + Upgrade Copilot, Self-healing CI, Bundle Budgets, Advanced Guardrails (New Architecture, React Compiler), Hermes profiling, sandbox, render |
| **Team** | $99/seat/mo | + Team Brain, Cloud Sync, Custom Models (Azure/Ollama/vLLM), Priority Inference |

Start a 14-day free trial: `npx vectalon auth --github`
