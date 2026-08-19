# Changelog

All notable changes to rn-vectalon will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.15.0] - 2026-08-19

### Added

- **Versioned Core contracts.** The shipped RN artifact now includes Core's
  JSON Schema 2020-12 registry, compatibility fixtures, generated TypeScript
  projections, semantic validators, registry digest, and exact Core source
  revision. Package tests execute the validator from the bundled artifact.
- **Explicit Free plan.** Free is a first-class product entitlement with a
  zero-minor-unit price and bounded seat, scope, trial, and grace policy.

### Changed

- ProductDefinition now owns ISO currency/minor units, seat quantity, billing
  cadence, tax treatment, trial eligibility, grace policy, and product scope.
  RN and website presentation models are generated from that contract.
- Public lifecycle status is beta until checkout, issuance, support, and
  revocation pass their later release gates. Future SDK coverage and
  Enterprise controls are no longer advertised as unconditional entitlements.
- Core is synchronized to 0.3.0 and AJV 8.18.0 is declared in both the
  workspace wrapper and published RN runtime dependency graph.

### Fixed

- Unknown contract majors fail closed, additive v1 fields remain compatible,
  and malformed validation responses never echo sensitive payload values.

## [0.14.2] - 2026-08-18

### Added

- **Canonical product-truth release gate.** A versioned root manifest now
  owns package versions, availability, capability counts, pricing, and license
  facts. CI and the RN publish workflow fail before build or publication when
  packages, benchmark fixtures, generated pricing, license text, or marked
  public documentation drift from it.
- **Generated commercial plan projection.** The published RN package consumes
  a generated projection of the canonical plan catalog, while the website
  consumes the same manifest directly.

### Changed

- Public website, README, SDK, documentation, and benchmark claims now reflect
  RN 0.14.2, 43 benchmark scenarios, 44 deterministic commands, and 64 MCP
  tools from their authoritative sources.
- Jest no longer depends on Watchman, improving repeatability in CI and
  restricted development environments.

### Fixed

- The product-truth CI job disables setup-node's implicit package-manager
  cache so its dependency-free validator can run before pnpm is installed.

## [0.14.1] - 2026-08-18

### Changed

- **RN releases now build against the latest private core `main`.** The
  guarded release workflow requires `CORE_REPO_PAT`, checks out
  `Vectalon/core` at an explicit `main` ref before both the benchmark and
  publish jobs, records the resolved commit, and bundles that revision into
  the npm artifact. The committed core distribution was refreshed from
  `1d930df8b215cb45623159132c2e47db89d46a7a`, adding the model-provider,
  repair-loop, violation, and engineering-profile foundations.

### Fixed

- **Core refreshes now replace the runtime distribution instead of nesting it
  under `dist/dist`.** The public wrapper build clears and recreates
  `packages/core/dist`, ensuring the RN bundle actually resolves the newly
  compiled core entry point.

## [0.14.0] - 2026-08-17

### Added

- **The 30-minute sales demo that requires no explanation (P0).** `vc
  sales-demo` runs the five-act narrative LIVE against the real project —
  minute 0–5 `vectalon init` (the scan census: files, components, screens,
  native modules, dependencies + the Health Score), 5–10 `vc intel` (the
  application model: screens, navigation, state, dependency cycles), 10–20
  `vc fix` (diagnose → fix → verify, run live on a committed fix-bench
  failure by default, or your own via `--log`/`--issue`), 20–25 `vc brain`
  ("Why did we choose Zustand?" → the decision card from the real ADRs),
  25–30 `vc outcomes` ("This is what Vectalon saved your team" → the
  savings ledger). Nothing is canned; the fix act touches only a sandbox;
  internal command logs are silenced so the meeting stays clean; the
  narration script is written to `docs/vectalon/sales-demo/SCRIPT.md`.
- **Vectalon GitHub App — install once, every PR reviewed (P0 distribution
  mechanism).** `vc gh-app` runs a small webhook server (Node ≥ 20, zero new
  deps — built-in `crypto`/`fetch`/`http`) that turns every `pull_request`
  event (opened / synchronize / reopened / ready_for_review) into a
  deterministic `vc pr` review: constant-time `X-Hub-Signature-256`
  verification, an RS256 app JWT exchanged for the installation token, the
  PR head fetched into a local mirror, the five-check review run over the
  added lines, and the 🤖 comment marker-upserted back on the PR by the app
  itself — no `gh` CLI, no PAT, no model calls. `--process` replays one
  webhook payload for CI/one-shot use. Config via `GITHUB_APP_ID` /
  `GITHUB_APP_PRIVATE_KEY` / `GITHUB_WEBHOOK_SECRET`.
- **Vectalon RN Engineering Benchmark — a benchmark competitors can't
  easily copy (P0).** `vc rnbench` computes the published, auditable
  leaderboard across eight engineering dimensions (architecture, native
  integration, dependency management, testing, performance, security,
  upgrades, debugging) from the committed artifacts — 43 scenarios, 43
  human references, and the RN-specific rubric (correctness / adherence /
  guardrails) — compared row by row: Vectalon (deterministic seams),
  Generic LLM 7B/3B/1.5B (scored live), Human (the references, same
  rubric, not 100%), and Claude Code / Cursor / Cline / Windsurf / Aider
  (pending until run). No cherry-picking: the scenario→dimension mapping
  is published and fixed, every cell is computed — never hand-edited —
  and pending rows render as pending. `--export` writes the exact
  competitor bundle (scenarios + fixtures + references + rubric protocol)
  anyone can run; a committed competitor result renders in the
  leaderboard. Report + methodology to `docs/vectalon/rnbench/`.
- **Upgrade-breakage + debugging scenarios score their own dimensions
  from real pack tasks (P0).** The pack grew 35 → 43 with 4
  upgrade-breakage repairs (rn-36..39 — compileSdk 34→35, Kotlin/AGP/
  wrapper pair, New Architecture flag, deprecated StatusBar props) and 4
  debugging repairs (rn-40..43 — Metro module resolution, Hermes crash,
  TS7006 regression, native-module linking). Each ships a broken fixture
  project + a human reference repair, and a new deterministic **fix seam**
  (`src/bench/fix.ts`, mirroring the removal seam) applies the declared
  `fixEdits` to the fixtures and emits the changed files — scored by the
  same rubric via a new **fix-applied** adherence check (replace present,
  broken text gone). The upgrades and debugging dimensions now aggregate
  real tasks: the Vectalon row reads the committed baseline fix-seam runs
  (100/100 both), the Human row reads the reference composites (100/100),
  and the 7B quality tier scored the new scenarios live across the full
  4/4 coverage on both dimensions (upgrades 80%, debugging 59% — a
  coverage guard renders a dimension pending unless ≥ half its scenarios
  were scored, so a lucky single scenario can't masquerade as a full
  score). Baseline gate extends to 17 deterministic runs; 8 new hermetic
  fix-seam tests.
- **Local model reliability — multi-scenario runs no longer fail after
  the first generation.** The shared inference engine leaked a fresh VRAM
  context per generation, so the 7B tier failed every scenario after the
  first with "context size … too large for the available VRAM" (the 1.5B
  just hid it by fitting several leaked contexts). Each inference now
  disposes its context on the way out; anti-repetition sampling (minP +
  a wide repeat-penalty window) stops Qwen2.5-Coder's broken-record
  loops on long fixture-injected replies; and the model-output parser
  salvages complete file objects from a corrupt envelope — a stray code
  fragment appended to an otherwise-valid repair no longer loses the
  whole run. This is what made the 7B full-coverage upgrades/debugging
  scores possible.

## [0.13.0] - 2026-08-16

### Added

- **PR Review Agent — GitHub → Vectalon → developer (P0).** `vc pr`
  reviews one pull request deterministically over the added lines only:
  five checks (Architecture shared→feature imports, Dependencies added+
  installed + manifest/lockfile sync, Security secrets + plain-HTTP,
  Performance re-render/startup/bridge hazards attributed to changed
  lines, Testing coverage per changed source file) with P0/P1/P2
  priorities, a ✓/⚠/✗ scorecard, the **health impact** (last known
  Health Score → projected after the PR's findings), and
  `--comment` to post (or marker-upsert) the 🤖 review as a bot comment.
  Zero model calls; report to `docs/vectalon/pr/`.
- **Dependency-removal scenarios are now benchmarked, not skipped.** The
  removal seam applies a scenario's `removedDependencies` to the fixtures and
  emits the changed files — JSON-aware package.json stripping (including
  `${name}-*` companion packages), comment-aware line stripping for
  Podfile/gradle/plist/pbxproj/xcconfig, and element-aware XML stripping that
  drops whole multi-line manifest providers/services. Three removal scenarios
  (rn-11 appcenter, rn-34 @sentry/react-native with pbxproj + Info.plist
  traces, rn-35 @react-native-firebase/app + messaging) score **99% composite
  (adherence 100%, guardrails 98%)** in the baseline gate, which now covers
  nine scenarios; the leaderboard gains a deterministic `baseline` column.
- **Scoped packages derive identity tokens from their scope.**
  `@sentry/react-native` and `@react-native-firebase/app` previously yielded
  only the last segment (`react-native` — deliberately dropped), so native
  traces like `RNSentry`, `io.sentry.android`, `:react-native-sentry`, and
  `com.google.firebase.provider` went undetected. Tokens now include the
  scope (`sentry`, `firebase`, `react-native-firebase`) — fixing the removal
  seam, the rubric's `no-removed-native-traces` check, and the `vectalon deps`
  native scan for scoped packages.
- **The model seam speaks removals.** `bench --model local` routes removal
  scenarios through a `remove-dependency` intent with the fixture files in
  the prompt, so the next model pass can score rn-11/34/35 in the
  fast/balanced/quality leaderboard columns; output parsing now accepts
  `.kts` and extensionless `Podfile`/`Podfile.lock`.
- **LoRA fine-tuning dataset export.** `scripts/export-bench-dataset.js`
  turns the 43 scenario + human-reference pairs into a chat-format JSONL
  under `.vectalon/dataset/` (validated `approved` by `vectalon dataset`).
- **Benchmark pack grew 13 → 35.** Twenty real-world app scenarios
  (rn-14..rn-33: checkout, chat, booking, health, media, security,
  productivity, travel) each with a typechecking human reference, plus the
  two removal scenarios — the pack now feeds the leaderboard, the CI gate,
  and the LoRA fine-tuning set.
- **`vc fix-bench` — the reliability wedge, measured** (P0). Runs the real
  `fix` pipeline (diagnose → plan → sandbox-apply, hermetically — no build
  ever runs) against **100 real React Native failures** across the ten
  families the roadmap names (Gradle conflicts, Kotlin/AGP/Gradle,
  CocoaPods, Xcode, Metro, Hermes, RN upgrade breakages, linking,
  TypeScript), each materialized as broken files over a healthy RN base, and
  scores the six axes the directive names: diagnosis accuracy (target ≥
  80%), fix accuracy without human modification (target ≥ 50%), build
  success, false-positive rate, time saved, human intervention. Current:
  **100/100 diagnosis, 70/100 auto-fix, 0 false positives** — both
  product-milestone targets met. Deterministic edit seams in
  `src/fix/planner.ts` (version pins, Podfile pod-insert + deployment
  target, settings.gradle include + JitPack, new-arch flag, daemon heap,
  duplicate-class resolutionStrategy, import rewrite, babel-preset add,
  Metro heap script, hermes align/flag, TS import-resolve / drop-property /
  unquote / dedupe / JSX→createElement / strip-prop) with the seam params
  parsed from the log in `src/fix/diagnose.ts`. Scenarios committed under
  `bench/fix/` (regenerate with `scripts/generate-fix-bench.js`); hermetic
  tests in `__tests__/fixBench/seams.test.ts` re-run the full pack and fail
  if either target slips.

### Changed

- **Quality tier live-scored across the full 33-scenario pack: 97% composite,
  114% of the 86% human reference**, perfect on 29 of 32 scored scenarios
  including every one of the 20 new real-world scenarios at 100%. Honest
  caveats published: rn-01 login dipped to 59% this pass (model variance),
  and rn-11-style removals were n/a until this release.
- **Local model tiers ship** — `fast` (1.5B/8 GB), `balanced` (3B/16 GB),
  `quality` (7B/32 GB) — auto-selected from RAM on `vectalon init`, with
  `--preset` overrides on `init`/`bench`/`pull` and a `vectalon models`
  command showing the tier + auto-selected marker.

### Fixed

- **`vectalon render` follows whole-relative import graphs** (curated
  Expo/navigation stubs, extensionless + index resolution) so a real Expo
  app renders headlessly with zero model calls.

### Added

- **The AI engineering control plane for React Native (P0 repositioning).**
  Vectalon is not an AI coding assistant: give it a repository and it
  continuously understands, reviews, diagnoses, upgrades, and validates the
  application. `vc fix` — the "Fix my React Native issue" killer workflow:
  one command that understands the project, diagnoses the root cause (from
  your words or a `--log`), explains it, proposes a fix, applies it in a
  sandbox (or `--apply` to your tree), runs tests/build, verifies, and shows
  exactly what changed — one structured verdict (root cause / evidence /
  impact / recommended fix / applied / verification / confidence), zero
  model calls. And **Project Intelligence as the shared foundation**: every
  agent consumes the same intel model (`vc intel` — manifest, workspace
  discovery, dependency graph, circular-dependency analysis, AST stats,
  repository index, component graph, navigation graph, native module
  registry, knowledge retrieval) rather than rediscovering the repo, with
  `fix` and `upgrade` now consuming it for their impact analysis.
- **The Vectalon Engineering Health Score — `vc score`** (P0): one 0-100
  number an EM immediately understands, aggregated from eight deterministic
  dimensions (Architecture, Dependencies, Build Health, Testing,
  Performance, Security, Accessibility, RN Upgrade Risk), each scored by a
  committed scanner consuming the shared Project Intelligence model. Shows
  the overall + per-dimension bars, the delta vs the previous run ("↓ 8
  points this week", from `docs/vectalon/score/history.json`), newly
  arrived problems, and P0/P1/P2 recommended actions (error → P0, warning →
  P1, info → P2). Offline by default, zero model calls, and a dimension
  whose scanner cannot run is skipped with the overall renormalized.
- **`vc init` is the 15-minute proof of value** (P0): the commercial
  experience is one command. It scans, seeds the knowledge base, and
  configures the model router silently underneath — no LLM configuration is
  ever asked — then ends with the payoff window: the scan summary (files,
  components, screens, native modules, dependencies, navigation stacks,
  tests, architecture risks), the Health Score, and the Top 5 problems with
  P0/P1/P2 severity dots. Zero model calls; seeds the intel + score-history
  caches so the next `vc score` is instant with a delta baseline.
- **`vc mode` — the deployment-mode surface (Cloud / Private /
  Air-gapped)** (P0): the local/self-hosted AI differentiator. Three
  explicit modes map the ModelRouter's providers onto a privacy ladder and
  are **enforced, not labeled** — `vc init --mode private --model openai` is
  refused, `vc mode --set <mode>` refuses an outside provider, and
  `vc mode`/`--json` verify the configured provider against the declared
  mode with its dataflow line. The deterministic agents need no model at
  all, so the entire control plane works fully air-gapped.
- **`vc demo` — the feature workflow as the flagship hero demonstration**
  (P0): "Build a Login feature." → Requirement → Architecture decision →
  Affected files → Implementation plan → Code → Tests → Review → Build
  verification → PR, plus the **self-healing loop** (build failed →
  diagnose → modify → rebuild → verify). Deterministic and offline — shows a
  real prior workflow run when one exists under
  `docs/vectalon/feature-development/`.
- **`vc brain` — the productized Team Brain** (P1): the move from developer
  tool to organizational infrastructure. Ask "Why are we using Zustand
  instead of Redux?" and get the decision card (Decision: adr-017 · Reason:
  performance + simplicity · Approved by: Architecture Team · Related:
  Checkout, Payments, Profile · Reviewed: March 2026); ask "Who understands
  our authentication architecture?" and get the expertise tree (Owner,
  Experts, ADRs, Services, Recent changes). Decision cards parse from the
  ADR files the brain indexes (the files remain the source of truth);
  expertise derives from git history grouped by area. Deterministic,
  offline, hermetic-testable.
- **`vc plan` — start charging earlier than you think** (P1): the three
  commercial plans on top of the deterministic engine gating — **Individual**
  $19/dev/mo (Local AI + project intelligence + diagnostics), **Team**
  $49/dev/mo (Team Brain, shared policies, PR review, CI, shared knowledge,
  dashboards), **Enterprise** custom (self-hosted, SSO, audit, private
  models, org-wide policies, multi-repo intel). Shows your current plan
  from the active license or trial and the full ladder — pricing
  deliberately simple, aimed at the first 5 paying teams, not pricing-page
  psychology.
- **`vc outcomes` — engineering outcomes, not feature counts** (P1): the
  sales material. Aggregates every committed deterministic report into the
  ledger an EM reads — issues detected, automatically fixed or prevented,
  PR issues caught, build failures diagnosed and resolved, RN upgrades
  completed, tests generated, performance regressions detected — and
  estimates the developer hours + dollars saved (hours × blended rate,
  $75/hr default, `--rate` override). Every number derives from real
  `report.json` artifacts (build-fix, fix/bug-fix, review, score, sec/arch/
  a11y/soc2, `.vectalon/upgrades/` provenance dirs, feature-run test files)
  — zero model calls; if no reports exist it says so.

## [0.12.0] - 2026-08-15

### Added

- **`vectalon render` now renders whole apps — Expo packages resolve via
  curated stubs, and the entry's relative import graph is followed like
  Metro.** `vectalon render --entry App.tsx` on a real Expo app previously
  died on the first bare import it could not resolve (`expo-status-bar`),
  because the sandbox denies network and has no node_modules. The render
  harness now aliases the curated Expo/navigation set (`expo-status-bar`,
  `react-native-safe-area-context`, `@react-navigation/native`,
  `@react-navigation/native-stack`) to built-in headless stubs —
  `StatusBar` + no-op style setters, `SafeAreaProvider`/insets passthrough,
  `NavigationContainer` passthrough, and a `createNativeStackNavigator`
  whose `Screen`s render their components with a safe navigation/route pair
  — and `renderInSandbox` follows relative `require()`s from the compiled
  output (extensionless + `index.*` resolution) to compile the entry's whole
  module graph. Rendering the demo's 19-screen `App.tsx` now compiles 36
  files and prints the full screen tree with zero model calls. Six new unit
  tests (require extraction, file resolution, expo/safe-area stub render,
  native-stack screen render, relative-graph render) plus a new
  `render-expo-stubs` selftest check.

### Fixed

- **Demo app cart is now a real end-to-end flow.** Every screen previously
  called `useCart()` independently, so each mounted its own fresh empty cart
  — adding items in the catalog did nothing for the cart screen. `useCart`
  is now a context-backed shared store (`CartProvider` mounted at the app
  root), and a new integration test drives the real navigator from
  onboarding → login → catalog (add items) → cart → checkout → order
  confirmation, asserting the orders service recorded the order and the
  shared cart cleared. RNTL v14 note: every `fireEvent` call is async and
  must be awaited.

## [0.11.0] - 2026-08-15

### Added

- **Archive & Share (Roadmap 101-104)** — four new deterministic agents:
  `vectalon archive` (build or ingest an IPA/APK/AAB, SHA-256 checksum,
  typed `BuildManifest` with git/flavor/environment provenance under
  `.vectalon/builds/`; zero-config flavor detection from Gradle
  `productFlavors`, Xcode schemes, and `eas.json`), `vectalon distribute`
  (TestFlight, Play Store, SaaS, and portal targets as dry-run-first plans
  that never store credentials — delegates to fastlane/EAS/Expo or direct
  API env vars), `vectalon share` (an ephemeral install page with download
  link, optional tunnel, QR code, and auto-shutdown via `--expires`), and
  `vectalon portal` (a self-contained static install portal with per-build
  detail pages and embedded `builds.json`, deployable to static hosting,
  Vercel, or Netlify).
- **Archive & Share wired everywhere** — six new MCP tools under `vectalon
  serve` (`archive_build`, `list_builds`, `detect_flavors`,
  `distribute_build`, `share_build_locally`, `generate_portal`), four new
  VS Code command-palette entries (`vectalon.archiveBuild`,
  `vectalon.distributeBuild`, `vectalon.shareBuild`,
  `vectalon.generatePortal`), and `vectalon ci --with-archive` emits a
  build → archive → SaaS-distribute job (gated on `VECTALON_API_KEY`,
  uploading `.vectalon/builds/` as an artifact) into GitHub Actions and
  EAS workflows.
- **Markdown + JSON reports for all four Archive & Share agents** — the
  site's promise that every agent ends in a `report.md` + `report.json`
  holds for archive, distribute, share, and portal, with verdicts mapped
  to the approved / needs-attention / changes-requested vocabulary.

## [0.10.0] - 2026-08-15

### Added

- **Carbon report windows** — every agent terminal verdict now renders as a
  box-drawing window with traffic-light dots, the agent title, a colored
  verdict chip, and a wrapped bordered body; truecolor detection drives
  24-bit fills on iTerm/WezTerm/Ghostty/Kitty/Alacritty/JetBrains, degrades
  to standard ANSI, and is fully clean under `NO_COLOR` or piped output
  (ANSI-aware wrapping keeps styled findings intact across line breaks).
  The same aesthetic now styles the website docs man page and all
  report-adjacent surfaces.
- **Live-scored benchmark correctness** — the `--live --install` path was
  dead on arrival: fixtures pinned `react@18.3.1` against
  `react-native@0.74.0`'s `react@18.2.0` peer (npm `ERESOLVE`) and
  `typescript@5.5.0`, which npm unpublished — every temp install failed, so
  jest/tsc/eslint never ran against real deps and correctness was
  structurally 0. The fixture template is now a real checkable RN project
  (peer-correct react, `@types/react`, babel config, eslint +
  typescript-eslint, jest smoke test), and the deterministic scaffold
  generates a unit test per feature — the gate holds 100% with tests in the
  loop.
- **Model pass re-run with `--live --install`** — overall composite 28% →
  **68%** across all 13 scenarios, relative-to-human 30% → **76%** (of the
  89% human reference), correctness genuinely scored (tests pass on 12 of 13
  scenarios; rn-03 and rn-09 at 100% across install + jest + tsc + eslint),
  guardrails 91% → 92%. Published to `bench/results/local.json`,
  `BENCHMARK_RESULTS.md`, and the /benchmarks page with its data-drift
  guard.
- **Benchmark suite expanded** — /benchmarks now presents one harness, four
  benchmarks (axes, leaderboard, suite breakdown, relative-to-human,
  regression gate); two new scaffoldable scenarios (rn-12 notifications,
  rn-13 account deletion) bring the CI gate to six scenarios at 100%.
- **Website report showcase + deep links** — the agents catalog links every
  card to its report on /reports; docs documents the three local
  report-viewing paths (terminal, markdown in repo, dashboard HTML),
  mirrored in CLI_REFERENCE.md and the RN package README.

### Fixed

- **Dropdown alignment** — full-size product dropdown and mobile menu
  dropdown realigned flush to their triggers; mobile menu no longer sticks
  open on touch devices (outside-close now listens to `pointerdown`, which
  fires on touch before scroll cancels mouse events, with
  `touch-action: manipulation` killing the iOS tap delay).
- **Benchmark fixture installs** — `react@18.2.0` peer pin and
  `typescript@5.5.4` (5.5.0 is unpublished) make every temp-project install
  succeed.

## [0.9.0] - 2026-08-15

### Added

- **GitHub PR Triage Agent — `vectalon gh-pr`** (Roadmap Phase 11, item
  090): scores every open PR for merge-readiness in one deterministic pass
  — age (stale > 30d), draft state, size (additions+deletions, huge >
  1500 lines), review decision, CI check rollup (passing/failing/pending),
  and mergeability — with a per-PR verdict, an overall verdict, and
  findings with suggestions; reads `gh pr list --json` when the GitHub CLI
  is available or a `--file` export, and degrades to an explicit no-data
  verdict (never a guess) when neither exists; `--max-prs <n>`;
  `--json`; reports to `docs/vectalon/gh-pr/` (gitignored).
- **GitHub Issue Intelligence Agent — `vectalon gh-issue`** (Roadmap Phase
  11, item 091): turns the open-issue backlog into a triage queue —
  staleness ranking, unassigned gaps (nobody owns the issue), label
  hygiene (unlabeled issues, fragmented single-use labels, label-less
  backlogs) — with a prioritized queue and an overall verdict; reads `gh
  issue list` or a `--file` export; `--max <n>`; `--json`; reports to
  `docs/vectalon/gh-issue/` (gitignored).
- **GitHub Workflow Reliability Agent — `vectalon gh-ci`** (Roadmap Phase
  11, item 092): flake + duration intelligence from `gh run list` —
  per-workflow failure rates, flaky-job detection (the same workflow both
  passing and failing across ≥ 5 completed runs at ≥ 20% failure), and
  slow-CI outliers (> 30min average) — with a reliability verdict; reads
  `gh run list` or a `--file` export; `--limit <n>`; `--json`; reports to
  `docs/vectalon/gh-ci/` (gitignored).
- **GitHub Security Posture Agent — `vectalon gh-sec`** (Roadmap Phase
  11, item 093): one deterministic security snapshot — open dependabot
  alerts (critical/high → blocker), secret-scanning findings, and branch
  protection with review enforcement — each with remediation steps; reads
  the `gh api` endpoints or a `--file` export; `--json`; reports to
  `docs/vectalon/gh-sec/` (gitignored).
- **Observability Dashboard Agent — `vectalon monitor`** (Roadmap Phase
  11, item 094): folds the telemetry surfaces into one executive view —
  crash classes (sentry), instrumentation + slow traces (observability),
  crash intelligence, the engineering-dashboard verdict, and raw
  `.vectalon/telemetry` event counts — with an overall verdict;
  `--json`; reports to `docs/vectalon/monitor/` (gitignored).
- **Model Evaluation Harness — `vectalon evals`** (Roadmap Phase 11, item
  095): scores golden eval cases (`.vectalon/evals/cases.json` or
  `--cases`) deterministically — exact / includes / regex matchers — with
  a per-case pass/fail note and a regression comparison against the
  previous run (any drop > 5pt is flagged); same inputs → same scores on
  any machine; `--json`; reports to `docs/vectalon/evals/` (gitignored).
- **Semantic Code Search Agent — `vectalon search`** (Roadmap Phase 11,
  item 096): lexical project search over the source tree with line-pinned,
  density-ranked results (files mostly about the topic surface first),
  sub-second on mid-size repos; requires `--query <terms>`; `--limit <n>`;
  `--json`; reports to `docs/vectalon/search/` (gitignored).
- **Incident Commander Agent — `vectalon incident`** (Roadmap Phase 11,
  item 097): from a crash log (`--log`) or the latest crash report to an
  incident brief — root-cause bucket via the shared RootCauseAnalyzer,
  hot files with their recent commits (git blame-lite), release risk from
  the release-predict agent, and next steps; `--json`; reports to
  `docs/vectalon/incident/` (gitignored).
- **Release Train Automation — `vectalon train`** (Roadmap Phase 11, item
  098): dry-run release planning across every workspace repo — version vs
  the last tag, changelog section present, clean tree, and a suggested
  semver bump from recent commit types; read-only — the plan is the
  deliverable, nothing is modified; `--json`; reports to
  `docs/vectalon/train/` (gitignored).
- **Cost Governance Agent — `vectalon cost`** (Roadmap Phase 11, item
  099): auditable cloud + model spend estimates from project config —
  LoRA training (VRAM class × GPU-hours), eval inference (case count ×
  tokens), dataset preprocessing (bytes) — with the rate assumptions
  printed so every figure can be checked; all amounts are labeled as
  estimates; `--json`; reports to `docs/vectalon/cost/` (gitignored).
- **DX Scoring Agent — `vectalon dx`** (Roadmap Phase 11, item 100): one
  0-100 developer-experience score from local evidence — README,
  contributing guide, docs, CI, tests, lint, strict types, changelog,
  onboarding assets, and source complexity — across twelve weighted axes
  with a letter grade and the top improvements ranked by gain; `--json`;
  reports to `docs/vectalon/dx/` (gitignored).
- **CLI smoke catalog** now covers all 40 deterministic agents (Phase
  8-11); the smoke sweep runs the real commands against a project and
  fails the release on any non-pass.

## [0.8.0] - 2026-08-15

### Added

- **Figma-to-code Sync Agent — `vectalon figma`** (Roadmap Phase 10, item
  080): parses a Figma design export (figma.json / design-export.json) and
  checks design↔code drift — design colors with no matching token or
  hardcoded source value (warning), component names with no source
  component (info, PascalCase + kebab lookups), and text styles with no
  font usage; `--json`; reports to `docs/vectalon/figma/` (gitignored).
- **Sentry Intelligence Agent — `vectalon sentry`** (Roadmap Phase 10,
  item 081): ingests Sentry/Crashlytics telemetry exports
  (.vectalon/telemetry) through the shared parsers, groups crashes into
  classes by exception type, ranks them by volume and distinct-user impact
  (critical/warning/info), attaches a RootCauseAnalyzer verdict per class,
  and flags release regressions (a crash class appearing in a new release);
  `--json`; reports to `docs/vectalon/sentry/` (gitignored).
- **Mobile Observability Agent — `vectalon observability`** (Roadmap Phase
  10, item 082): audits instrumentation coverage in source (Sentry init,
  crash handlers, analytics SDK, network breadcrumbs, performance tracing)
  and flags slow traces/spans from telemetry exports above 1s/500ms
  thresholds; `--json`; reports to `docs/vectalon/observability/`
  (gitignored).
- **Enterprise Governance Agent — `vectalon governance`** (Roadmap Phase
  10, item 083): repository-evidence checklist — license, security policy,
  contributing guide, CODEOWNERS, PR template, lockfile, SBOM, Dependabot,
  CI — with pass/warn/fail statuses; `--json`; reports to
  `docs/vectalon/governance/` (gitignored).
- **Org-wide Audit Trail Agent — `vectalon audit`** (Roadmap Phase 10,
  item 084): validates the .vectalon/audit/*.jsonl trail — required fields,
  sequence continuity (gaps), malformed lines, secret-shaped values — and
  summarizes activity by actor and action; `--json`; reports to
  `docs/vectalon/audit/` (gitignored).
- **Multi-repository Memory Agent — `vectalon repos`** (Roadmap Phase 10,
  item 085): verifies the .vectalon/repos.json workspace manifest — each
  sibling repo reachable, a git checkout, with a .vectalon/ memory store —
  and flags missing/non-git/memory-less entries; `--json`; reports to
  `docs/vectalon/repos/` (gitignored).
- **Release Prediction Agent — `vectalon release-predict`** (Roadmap Phase
  10, item 086): a deterministic 0-100 release-risk score from read-only git
  history — fix density, refactor density, hours since last commit, breaking
  changes, author breadth in a configurable release window (default 14
  days) — with a low/moderate/high/critical verdict and per-factor
  breakdown; `--json`; reports to `docs/vectalon/release-predict/`
  (gitignored).
- **Deep Play Store Readiness Agent — `vectalon play-store`** (Roadmap
  Phase 10, item 087): Play-specific checks beyond the shared store surface
  — manifest permissions and the data-safety form they imply, exported
  components, backup rules, cleartext posture, SDK target/compile/min
  levels, signing config, and measured store-listing assets (512×512 icon,
  1024×500 feature graphic, screenshots, listing text); `--json`; reports
  to `docs/vectalon/play-store/` (gitignored).
- **Fine-tuning Dataset Agent — `vectalon dataset`** (Roadmap Phase 10,
  item 088): validates .vectalon/dataset/*.jsonl training data — schema
  consistency (chat vs instruction), duplicates, label balance, length
  outliers, and PII leakage (emails, phones, API keys, private keys, SSNs);
  `--json`; reports to `docs/vectalon/dataset/` (gitignored).
- **LoRA Training Readiness Agent — `vectalon lora`** (Roadmap Phase 10,
  item 089): checks the .vectalon/lora config — dataset path, base model
  with a VRAM estimate (param count × quantization + adapter/overhead),
  r/alpha hyperparams, output dir, wandb — and flags what's missing before
  training starts;  `--config <path>`; `--json`; reports to
  `docs/vectalon/lora/` (gitignored). Starts Phase 10 (Enterprise
  Intelligence).
- **Engineering Dashboard v2 — `vectalon dashboard` evolves in this
  release.** `--run` now regenerates **and writes** all 13 fast agent
  reports (release-ready, arch-score, soc2, plus the ten Phase 10
  agents) instead of computing them and throwing them away — a fresh
  dashboard covers every agent under `docs/vectalon/*`. New `--cron`
  mode (default 300s, `--interval <seconds>`) regenerates the core
  reports and rewrites the HTML on a schedule until Ctrl-C/SIGTERM,
  with a per-tick status line and graceful failure. The self-contained
  HTML dashboard gains per-agent drill-down — clicking a card opens the
  agent's full findings list (shape-aware across `findings[]`,
  `checks[]`, `controls[]`, and `dimensions[]` reports) with severity
  filtering, full-text search across id/message/suggestion, a live
  showing-N-of-M counter, and links to the markdown/JSON reports.
  Severity aliases (`critical` → error, `warn` → warning) roll up
  correctly so a sentry report's critical findings can never zero out
  the dashboard error count.

## [0.7.0] - 2026-08-14

### Added

- **Autonomous Bug Fix Agent — `vectalon bug-fix`** (Roadmap Phase 8,
  item 070): proposes fixes for deterministic defects and executes the
  provably-safe ones — whole-line unused-import removal and var→const
  (assignment-count proven) — with `--apply` refusing a dirty git working
  tree unless `--force`, so `git checkout` always restores the pre-fix
  state; dry-run by default with a per-finding diff patch plan; `--json`;
  reports to `docs/vectalon/bug-fix/` (gitignored). Completes Phase 8
  (Autonomous Engineering): the agent can propose and execute changes
  safely.
- **Crash Intelligence Agent — `vectalon crash`** (Roadmap Phase 9, item
  071): classifies an iOS, Android, or JavaScript crash log into a
  root-cause bucket (null-reference, module-resolution, resource, network,
  state-mutation, concurrency) with the standard fix and investigation
  steps — platform auto-detected from strong signatures (or forced with
  `--platform`), reusing the shared RootCauseAnalyzer; `--log <path>`;
  `--json`; reports to `docs/vectalon/crash/` (gitignored).
- **Mobile Architecture Scorecard — `vectalon arch-score`** (Roadmap Phase
  9, item 072): a deterministic 0-100 score across six dimensions computed
  from the module graph — circular dependencies (hard per-cycle penalty),
  layer boundaries, module coupling (avg fan-out), module cohesion (files
  per module dir), testability (test siblings), and nesting depth — with a
  letter grade and top improvements; `--src <dir>`; `--json`; reports to
  `docs/vectalon/arch-score/` (gitignored).
- **CI/CD Intelligence Agent — `vectalon cicd`** (Roadmap Phase 9, item
  073): scans CI workflow files for anti-patterns — third-party actions
  pinned to tags instead of commit SHAs, missing concurrency groups and
  timeouts, secrets in inline env values, deploy steps without a test gate,
  missing `on:` triggers, and empty workflows — with other CI systems
  (GitLab, Travis, Jenkins, CircleCI, Azure, Bitrise, Codemagic) detected
  and named; `--json`; reports to `docs/vectalon/cicd/` (gitignored).
- **App Store Readiness Agent — `vectalon app-store`** (Roadmap Phase 9,
  item 074): iOS/Android store-submission checks — version/version-code
  consistency across Info.plist, build.gradle, and package.json (error),
  app icons, iOS privacy manifest (PrivacyInfo.xcprivacy), launch screen,
  ATS/cleartext posture, Android applicationId and permissions; `--json`;
  reports to `docs/vectalon/app-store/` (gitignored).
- **SOC2 Readiness Agent — `vectalon soc2`** (Roadmap Phase 9, item 075):
  a repository-evidence checklist mapped to the five trust-service criteria
  plus operational hygiene — authentication/authorization libraries,
  secrets hygiene, lockfiles, CI, test coverage, TLS, privacy policy,
  structured audit logging, backups, incident-response runbook, and vendor
  vulnerability scanning — with a score and per-control next steps
  (self-assessment, not an audit); `--json`; reports to
  `docs/vectalon/soc2/` (gitignored).
- **Design Token Sync Agent — `vectalon tokens`** (Roadmap Phase 9, item
  076): flattens a style-dictionary-style token JSON and checks source for
  drift — tokens never referenced (orphans), hardcoded colors that should
  be tokens, and token pairs with identical values; `--json`; reports to
  `docs/vectalon/tokens/` (gitignored).
- **Team Productivity Analytics — `vectalon team-stats`** (Roadmap Phase
  9, item 077): one read-only `git log` (no shell — execFile) derives
  commit cadence, author distribution, bus factor, category mix, and
  change velocity, warning on single-owner risk and low cadence; `--json`;
  reports to `docs/vectalon/team-stats/` (gitignored).
- **Agent Permissions Audit — `vectalon perms`** (Roadmap Phase 9, item
  078): scans agent/MCP configuration (Claude Code settings, Cursor MCP,
  `.mcp.json`, `.agents`) for auto-approved shell/file-mutation tool
  grants, local-exec MCP servers, and credential-shaped values in config
  (errors, redacted); `--json`; reports to `docs/vectalon/perms/`
  (gitignored).
- **Engineering Dashboard — `vectalon dashboard`** (Roadmap Phase 9, item
  079): aggregates every agent report under `docs/vectalon/*/report.json`
  into one executive view — per-agent health cards, an overall verdict,
  and a self-contained HTML dashboard (no network) — with `--run` to
  regenerate the fast core reports (release-ready, arch-score, soc2) and
  `--open` to launch it; `--json`; reports to `docs/vectalon/dashboard/`
  (gitignored). Starts Phase 9 (Release Engineering).

## [0.6.0] - 2026-08-14

### Added

- **Dependency Upgrade Agent — `vectalon deps`** (Roadmap Phase 8, item
  067): finds what to upgrade and the safe path — RN ecosystem pairing
  violations against the curated matrix (react ↔ react-native ↔ Expo SDK),
  duplicate versions across workspace members, and vulnerable dependencies
  via best-effort `npm audit` (critical → error, high → warning) with
  `npm audit fix` guidance; the audit degrades to a skip when it cannot
  run. Verdict approved / needs-attention / changes-requested; `--json`;
  `--no-audit`; reports to `docs/vectalon/deps/` (gitignored).

- **Accessibility Agent — `vectalon a11y`** (Roadmap Phase 8, item 068):
  one deterministic pass over component files that flags accessibility
  debt — unlabeled images (error), touchables without accessibilityRole,
  unlabeled TextInputs, and undersized touch targets below the 44×44pt
  guideline — every finding line-pinned with a concrete fix. `--json`;
  reports to `docs/vectalon/a11y/` (gitignored).

- **Release Readiness Agent — `vectalon release-ready`** (Roadmap Phase 8,
  item 069): answers “can we ship?” with a deterministic checklist —
  version bumped past the last git tag, a CHANGELOG section for that
  version, a clean working tree, CI workflows present, a committed
  lockfile, tests configured, secrets hygiene (no committed .env), and
  TODO/FIXME triage — using only read-only git commands that degrade
  gracefully. `--json`; reports to `docs/vectalon/release-ready/`
  (gitignored).

- **Refactoring Agent — `vectalon refactor`** (Roadmap Phase 8, item 066):
  one deterministic pass over the project's source files that proposes
  concrete, safe refactors — dead code (AST-backed unused imports, unused
  variables, unreachable statements after return/throw), duplication
  (repeated 4-line blocks, repeated long strings), modernization (optional
  chaining, `.includes` over `indexOf`, strict equality, const/let), type
  smells (`any`, `@ts-ignore` vs `@ts-expect-error`), inline-style debt,
  console noise, and complexity (long functions and oversized files via the
  shared RefactorSuggester) — every finding line-pinned with a specific
  suggestion, severity-ranked, with top opportunities and a verdict.
  `--json`; reports to `docs/vectalon/refactor/` (gitignored).

- **Test Repair Agent — `vectalon test-repair`** (Roadmap Phase 8, item
  065): one deterministic diagnosis of a failing Jest, Detox, or Maestro
  test run from its output log — the test kind is auto-detected from
  content (or forced with `--jest`/`--detox`/`--maestro`), and a pattern
  classifier returns the root cause with the standard fix plus
  corroborating symptoms as a fix plan. Ships three pattern databases —
  Jest (assertion and snapshot mismatches, open handles, suite-collection
  errors, test module resolution, transform errors, missing globals,
  worker crashes, async timeouts), Detox (app launch failures,
  element-not-found / waitFor timeouts, TOCTOU flakiness, build failures,
  permissions dialogs, test-runner config), and Maestro (assertions,
  element visibility, app state, device connection, CLI version) — each
  with the standard fix. `--json`; `--log <path>`; reports to
  `docs/vectalon/test-repair/` (gitignored).

- **Build Fix Agent — `vectalon build-fix`** (Roadmap Phase 8, item 064):
  one deterministic diagnosis of a failing Metro, Gradle, or Xcode build
  from its log — the build kind is auto-detected from content (or forced
  with `--metro`/`--gradle`/`--xcode`), and a pattern classifier returns the
  root cause with the standard fix plus corroborating symptoms as a fix
  plan. Ships the Metro bundler-failure database (module resolution, syntax/
  transform errors, haste collisions, Metro port conflicts, cache
  corruption, asset resolution, bundler OOM, file-watching, monorepo
  package entry points) and reuses the Gradle (013) and Xcode (014) log
  analyzers from project diagnostics. `--json`; `--log <path>`; reports to
  `docs/vectalon/build-fix/` (gitignored).

- **Security Review Agent — `vectalon sec`** (Roadmap Phase 8, item 063):
  one deterministic pass over the project's security posture — hardcoded
  secrets (provider tokens like AWS/GitHub/Slack/Stripe/Google and private
  keys as errors, generic key/secret/password assignments as warnings, with
  every captured value redacted in reports), unsafe code patterns (dynamic
  code execution, shell command interpolation, disabled TLS verification,
  cleartext HTTP, Math.random used for security material, SQL string
  concatenation, XSS sinks, unhardened WebViews, weak MD5/SHA-1 hashes), and
  best-effort dependency advisories via `npm audit --json` (critical →
  error, high → warning, moderate/low → info, with direct/transitive
  labeling; the audit degrades to a skip when it cannot run, and an
  unpinned-dependencies check flags missing lockfiles) — with a verdict
  approved / needs-attention / changes-requested. `--json`; `--no-audit` to
  skip the subprocess pass; reports to `docs/vectalon/sec/` (gitignored).

- **Architecture Review Agent — `vectalon arch`** (Roadmap Phase 8, item
  062): one deterministic pass over the project's module graph that reviews
  its architecture — circular dependencies (error), layering violations
  (shared code like utils/components importing feature code, warning), god
  modules (high fan-out or oversized files, warning), module over-coupling
  (a module importing from many siblings, warning), wide fan-in blast
  radius, unreachable orphans, and over-deep nesting (info) — with per-module
  coupling metrics (files, fan-in, fan-out, external packages) and a verdict
  approved / needs-attention / changes-requested. `--json`; `--src <dir>`
  and threshold overrides (`--max-fanout`, `--max-module-fanout`,
  `--max-depth`); reports to `docs/vectalon/arch/` (gitignored).

- **PR Review Agent — `vectalon review`** (Roadmap Phase 8, item 061): one
  pass over the git diff (uncommitted changes by default, or `--base <ref>`
  for a branch vs its base) that flags what a PR introduces — the
  deterministic CodeReviewAnalyzer runs on each changed file's added lines,
  pinned to their real new-file line numbers, and the team-brain coding
  standards (043) are cross-checked as line-level probes (strict TypeScript,
  StyleSheet, ESLint, testing notes) so a diff is checked against the
  project's own derived conventions, not just generic rules. An optional LLM
  pass reviews against the standards context when a model is configured;
  model failures degrade to the deterministic pass. Verdict:
  approved / needs-attention / changes-requested; `--json`; reports to
  `docs/vectalon/review/` (gitignored). Starts Phase 8 (Autonomous
  Engineering).

- **Team Brain — `vectalon team`** (Roadmap Phase 6, items 041-049): one
  deterministic pass that generates the team-brain artifacts and seeds them
  into the knowledge base (idempotent upserts, own marker): the project
  glossary (044 — frequency-ranked identifiers filtered against code/RN
  vocabulary, classified as component/type/constant/identifier), coding
  standards (043 — derived from tsconfig strictness, styling, testing,
  linting, navigation, state, package manager, and the guardrail policy),
  a git-derived expertise map (046 — author → commits → files → owned
  components), an ADR/decision index (042 + 048 — scans docs/adr,
  docs/decisions, adr/, decisions/, *.adr.md, DECISIONS.md and indexes each
  as a searchable architecture artifact), PR knowledge (045 — merge and
  squash-merged `(#N)` PRs from git history), and an onboarding brief
  (049 — composed from all the above). `--search <query>` queries the team
  knowledge base across registered projects (`.vectalon/team.json`) — the
  Phase 6 acceptance — with real embedding APIs when configured and a
  timeout-bounded fallback to the deterministic lexical/hash path.
  `--projects`, `--json`; docs to `docs/vectalon/team/` (gitignored).
  Also wired into `vectalon serve`'s hourly background refresh (Team tier):
  the team brain regenerates on the same cadence as the web-intel refresh,
  so glossary/standards/decisions track code changes without manual runs
  (free tier keeps the manual command; a team-brain failure never blocks the
  web/repo refresh). Agents can drive the brain through the serve MCP server
  too: `generate_team_brain` runs the pass on demand (excluded from safe
  mode — it writes project docs) and `search_team_knowledge` queries it
  semantically across every registered project, scoped by project, team,
  and artifact type (search re-reads stores from disk so newly generated
  artifacts are immediately searchable, with team metadata from
  `.vectalon/team.json` — fixing `--team` scoping on every search surface).
  Completes Phase 6 alongside the existing team-policy (050) and sync
  commands.

- **Static performance scan — `vectalon perf`** (Roadmap Phase 4,
  items 021-023, 027, 029): one deterministic pass over source with no
  build/device/model calls. Render profiler + re-render detector (021-022:
  render-phase setState as error; 2+ inline arrow handlers, inline
  object/array literal props, and unmemoized context provider values that
  defeat React.memo as warnings), startup analyzer (023: heavyweight
  module-scope imports — moment, lodash, rxjs, d3, three, Skia, tfjs — and
  top-level side effects in entry files), bridge traffic analyzer (027:
  direct NativeModules calls, requireNativeComponent, TurboModuleRegistry
  access — warning in JSX/TSX render paths, info elsewhere), and a
  severity-ranked, deduped recommendation engine (029). `--json`; reports
  to `docs/vectalon/perf/` (gitignored). Completes Phase 4 alongside the
  existing profile/bundle/bench commands.

## [0.5.0] - 2026-08-13

### Added

- **Project Diagnostics — `vectalon diagnostics`** (Roadmap Phase 2,
  items 011-015): one deterministic pass validating the build/toolchain
  surface with a suggested fix for every finding. Metro config validation
  (config shape, alias targets, watchFolders in monorepos, cache advice),
  Hermes compatibility checks against a known-issue database
  (hermesEnabled/newArchEnabled states, New-Arch-without-Hermes, legacy RN),
  Android/Gradle project checks plus a build-log parser classifying the top
  RN build errors (SDK, AGP, dependency resolution, AAPT, NDK, Java, network,
  OOM) with the standard fix, iOS/Xcode Podfile + deployment-target checks
  plus a log parser for CocoaPods/signing/linker/plist/Xcode-version
  failures, and dependency conflict detection against an RN ecosystem matrix
  with duplicate-version detection across monorepo members. `--json`,
  `--gradle-log <path>`, `--xcode-log <path>`; reports to
  `docs/vectalon/diagnostics/` (gitignored).
- **Code generation — `vectalon generate`** (Roadmap Phase 2, items 016-020):
  deterministic templates written into the project or previewed with
  `--dry-run`. Component (functional TS + StyleSheet), screen (component with
  React Navigation hooks), test (Jest @testing-library/react-native or
  Detox), native module (iOS ObjC++ + Android Kotlin scaffold via
  `--api rn-cli|expo` from a JSON spec), and API client (typed service class
  + `apiBase.ts` with ApiError from an **OpenAPI spec** — path params,
  request bodies, response types, error handling).
- The interactive menu gains "Run project diagnostics" and "Generate code".

## [0.4.0] - 2026-08-13

### Added

- **Project Intelligence Core — `vectalon intel`** (Roadmap Phase 1,
  items 001-010): one deterministic pass that produces the versioned project
  manifest + validation, workspace/monorepo discovery (pnpm, yarn, npm,
  turbo, lerna, **nx**), a file→file dependency graph with circular-import
  cycles (Tarjan SCC), AST parse-rate statistics, an incremental repository
  index (content fingerprints — re-index only changed files), component +
  navigation graphs (navigators, Expo Router routes, deep-link map), a native
  module registry (JS refs, Podfile pods, podspecs, Gradle includes,
  TurboModule specs), and ranked knowledge retrieval over hash-embedded,
  chunked source with a **sub-second** benchmark. Repository-wide in
  monorepos; `--json`, `--graph deps|components|navigation|native|manifest`,
  `--search <q>`, `--bench`; reports to `docs/vectalon/intel/` (gitignored).
  The interactive menu gains "Run project intelligence".

## [0.3.0] - 2026-08-13

### Added

- **`vectalon smoke` — post-release verification.** Runs **every CLI command**
  against the project (Expo or bare RN CLI), captures the full output of each,
  and reports pass / warn / skip / fail — exit non-zero on any failure, so a
  release can be verified end-to-end before it ships. 33 checks cover the
  whole surface (version/help, init, status, models, auth, policy, refresh,
  suggestions, ecosystem, doctor, impact, coverage, telemetry, bundle,
  profile, sandbox, render, ci, release, leaderboard, visual-ci,
  visual-baseline, ci-incident, serve, daemon, sync, team-policy, support),
  and `--full` adds the feature workflow, benchmark, full self-test, and model
  pull. Each command's full stdout/stderr lands in `report.json` (CI),
  `report.log` (readable), and an HTML dashboard; the terminal streams every
  check live and prints a summary table. License-gated commands and commands
  that need inputs a project lacks are reported as **skips with reasons**
  (never failures); doctor's exit-1-with-report is a pass; non-zero exits and
  timeouts are fails. `--list`, `--only`, `--skip`, `--json`, `--out`,
  `--timeout`.
- **Smoke runs after every release.** The generated release workflows
  (`.github/workflows/vectalon-release.yml` and
  `.eas/workflows/vectalon-release.yml`) now include a **`verify` job** that
  runs `vectalon smoke --full --json` after quality checks — a broken command
  surface blocks store submission.
- **Interactive menu entry** — `vectalon` (no args) gains "Run post-release
  smoke" right after "Show coverage dashboard".
- **CLI shortcut `vc`** — the package now installs three bin names
  (`vectalon`, `vc`, `rn-vectalon`), all pointing at the same CLI, so clients
  can run `vc status` or `npx vc smoke --full` instead of typing
  `npx vectalon` every time. In an installed project `npx` resolves the local
  binary first.

### Fixed

- **Selftest `diagnostics-support` was environment-dependent.**
  `buildSupportBundle` merges the project queue with the user-config queue
  (where `reportError` captures land when no project root is known), so the
  check's exact-count assertion ("expected 1 queued error") failed whenever
  the ambient queue held an older error. It now asserts the sandbox-captured
  error is present in the bundle instead of demanding a specific total.

## [0.2.0] - 2026-08-13

### Added

- **Impact regression flows.** The test stage now writes `.maestro/<slug>-impact.yaml`
  for every screen an impact analysis flags as affected by the changed files —
  AST-driven (no model calls), one regression flow per affected screen with a
  deterministic route (deep link or initial route), screenshots collected for
  the PR visual diff. `impact` reports the affected screens, navigation
  stacks, and the exact `.maestro/` flows that must run.
- **Accessibility variants for covered screens.** When an affected screen is
  already covered by accessibility criteria (an existing `*-accessibility.yaml`
  flow references it, or the request/acceptance criteria call out
  VoiceOver / TalkBack / screen readers), the test stage writes
  `.maestro/<slug>-impact-accessibility.yaml` alongside the plain flow: an
  "Accessibility variant" header with screen-reader guidance, assertions as
  explicit accessibility-tree `text:` selector blocks (the labels VoiceOver /
  TalkBack announce), and a namespaced screenshot still tracked by the
  `impact-*` screenshot collector.
- **Uncovered-screen reporting.** Screens with no deterministic route are no
  longer silently dropped: the verification report's E2E block names them
  ("Impact E2E coverage: N affected screen(s) still uncovered …"), and the
  close phase opens a `coverage`-labeled follow-up task per uncovered screen
  (`Follow-up: E2E coverage for <Screen>`) — deduplicated against already-open
  tasks via the PM adapter's `findTasks` (closed tasks never block a new one).
- **Coverage dashboard.** `docs/vectalon/coverage/coverage-gaps.md` records
  every E2E and accessibility gap per feature run (date, run id, feature
  prompt, follow-up task ids, a11y gaps) — append-only, best-effort writes.
  The new **`vectalon coverage`** CLI command renders it as a per-screen
  summary table (E2E runs / a11y runs / latest follow-up, with open-task
  links), `--json` for CI, `--limit` to cap rows.
- **Interactive menu entry.** `vectalon` (no args) gains "Show coverage
  dashboard" right after "Analyze impact".

### Changed

- `ProjectManagementAdapter` gains an optional `findTasks` for best-effort
  dedup; the console adapter now keeps an in-memory task store with monotonic
  ids and implements it. Providers without a query API keep create-always
  behavior.

## [0.1.31] - 2026-08-11

### Added

- **Telemetry ingestion is no longer a dead-end.** `vectalon telemetry` no
  longer prints "Telemetry ingested" when nothing was ingested: the command
  returns a real outcome, scripts/CI exit 1 on an empty run, and the
  interactive menu guides you with **Specify a path / Generate sample
  exports / Supported formats** instead of a dead end.
- **`vectalon telemetry --fixtures`** — writes realistic Sentry crash, Sentry
  transaction, Crashlytics report, and Firebase analytics JSONL exports into
  `.vectalon/telemetry` and ingests them on the spot, running the full crash
  → incident → KPI analysis so the pipeline demos end-to-end in seconds.
- **`--formats` and `--format`** — a printable accepted-formats guide and a
  per-run format force for unusual exports; the `ingest_telemetry` MCP tool
  gained the same optional `format` argument.
- **Telemetry documentation** — a new `TELEMETRY.md` with per-format schemas
  and real export examples, linked from the website docs and the CLI
  reference.

### Fixed

- **Whole-document JSON exports are parsed correctly.** A pretty-printed
  Sentry `events[]` array or multi-line object export was misdetected as
  JSONL and silently ingested **0 events**; `parseTelemetryContent` now
  attempts whole-document JSON first (arrays and objects) with a tolerant
  JSONL fallback.

## [0.1.30] - 2026-08-11

### Added

- **Live model streaming.** `vectalon bench --model local` now shows the
  model generating instead of a frozen "generating…" line: a TTY-only token
  preview on stderr ticks a character count with a truncated text preview as
  each chunk decodes (auto-disabled for `--json`/pipes so structured/CI
  output stays clean). `onTextChunk` is plumbed through `ModelRequest` →
  `LocalProvider` → `runInference` → `session.prompt`, and MCP/agent paths
  never set it, so their behavior is unchanged.
- **Incremental benchmark reports.** `vectalon bench` streams each scenario
  section to stdout the moment it finishes (title, composite, axes,
  correctness details, relative-to-human) with `## suite` headers switching
  live, then closes with the Overall block. `--json` stays a pure JSON doc;
  `--output` keeps the full grouped report in the file.

### Fixed

- **llama.cpp noise is gone.** The `load: control-looking token` spam and the
  `MaxListenersExceededWarning` no longer appear on local-model runs. A
  shared log filter (`createLlamaLogFilter`) is now plumbed into every
  node-llama-cpp entry point (`getLlama` plus the Llama instance's logger,
  which derived components inherit) with a C-level `logLevel: warn` gate;
  the stderr write-filter stays as a safety net. Exit listeners merge into
  one `beforeExit` drain and the process listener cap is raised (64, with
  justification) so the warning can never fire for a healthy engine.

## [0.1.29] - 2026-08-11

### Added

- **Bundle size visualizer.** `vectalon bundle` now prints ASCII bars for the
  top packages in the terminal and `--open` renders a self-contained HTML
  dashboard: an interactive treemap of the whole bundle, per-package
  drill-down, budget violations highlighted, and replacement-suggestion
  cards (maintainedness: last publish, weekly downloads, GitHub stars) — the
  same report pattern as `selftest`.
- **Actionable improvement suggestions — `vectalon suggestions`.** The
  knowledge-refresh suggestions that only existed as a count are now a
  first-class command: severity-grouped list (title, current → latest),
  `--json` for CI/agents, `--limit`, `--apply <ref>` (prints the exact
  `npm install` command and runs it behind a confirmation gate, `--yes` to
  skip the prompt), and `--open` for an HTML dashboard. The interactive menu
  gains a "View suggestions (N)" entry, and serve/feature/status now point
  at the command instead of a dead count.
- **MCP catalog health.** The ecosystem catalog's npm package names are now
  validated against the registry (cache-backed, offline-safe, 24h TTL):
  `vectalon ecosystem enable <mcp>` fail-fasts with the corrected install
  command when the package doesn't resolve, `vectalon doctor` gains a
  `catalog-<id>` health check per enabled MCP, and sub-MCP spawn failures
  collapse to one compact warning line (full npm stderr only under
  `VECTALON_DEBUG=1`) instead of a wall of `npm error E404` noise.
- **Staleness-aware refresh hint.** The interactive menu's "Force refresh
  knowledge" entry shows how stale the knowledge base is, so refresh only
  runs when it's worth it.

### Fixed

- `vectalon bench` default results directory now resolves to the project
  cwd instead of the CLI's install location.

## [0.1.28] - 2026-08-10

### Added

- **Structured workflow output — the terminal explains itself.** `vectalon
  feature` no longer dumps raw walls of text. During a run, the spinner shows
  exactly where you are in the SDLC (`[9/13] Verification…`) and every command
  that executes surfaces live (`[9/13] Verification ▸ yarn test`) with a
  ✓/✖ + exit code + duration written to a command feed. On failure, the
  13k-char verification dump is replaced by a parsed failure card: which
  checks failed (with exit codes), the first failing check's output excerpt,
  and pointers to the **full report file**, the rotating **command log**, and
  the **resume command**. The final summary lists numbered SDLC stages with
  durations, files created/modified, every document artifact plus a generated
  `index.md` (one link previews all of a run's docs), commands run, and a
  context block (model, intent, skills inlined).
- **Doctor failure card.** `vectalon doctor` renders its missing checks as a
  numbered fix list with `[auto]`/`[manual]` tags resolved through the real
  auto-fix commands, an auto-fix count (`N auto-fixable with vectalon doctor
  --fix`), and the rotating log pointer — clear steps to fix each error.
- **`run_agent` markdown report.** serve/MCP tool results now render as a
  structured report: the answer, a tool-call table with ✅ executed / ⚠️
  skipped marks, and iteration counts. `AgentLoopCall` gains a `skipped` flag
  (set on repeat-skip paths) that is never serialized into the model-visible
  history, so agent behavior is unchanged.
- **Failed verification checks become project memory.** After each workflow
  run, failed verification checks are distilled into the L0→L3 memory as
  error facts (`lint failed (exit 1): .vectalon/metro/vectalon-reporter.js`)
  so future runs know the project's recurring failures and surface them in
  the model prompt. Extraction is noise-filtered (jest banners, coverage
  tables, console.debug/log/warn blocks are dropped; `console.error` content
  is kept as a failure signal) and absolute paths are relativized against the
  project root so facts survive checkout moves.

### Changed

- Failed-workflow output now points at `docs/vectalon/feature-development/
  <id>/verification.md` and `.vectalon/logs/vectalon.log` instead of flooding
  the terminal with the raw report.

## [0.1.27] - 2026-08-10

### Added

- **L0→L3 agent memory (MemoryDistiller)** — Vectalon now distills what each
  project teaches it. Agent sessions (every `vectalon feature` workflow run)
  are captured as raw memory (L0), distilled deterministically into atomic
  facts (L1), occurrence-weighted scenario lessons (L2), and a stable project
  persona — stack, conventions, known issues (L3) — persisted under
  `.vectalon/knowledge/memory/distilled.json`. The distilled memory is
  inlined into every model system prompt exactly like web intel, so local,
  remote, and WASM providers all generate from what this project has already
  learned. Fully offline and deterministic — no model calls, no new
  infrastructure.
- **Professional `vectalon ecosystem` UX** — the catalog is now grouped by
  category (MCP servers / Agent skills / Tools / Hooks) with ✓/— status marks
  and full IDs that are never truncated (no more `react-native-upgrad…` you
  can't copy). The 38-item capabilities dump is gone from the list; new
  `vectalon ecosystem --info <id>` shows a single-item card (description,
  install command, capabilities, enable/disable hint). The interactive menu's
  Enable / View-details actions pick from the catalog via type-to-filter
  select instead of typing an id blind.

### Fixed

- Scenario occurrences now count the sessions that produced a fact (dedup no
  longer collapses repeated lessons), `lastSeen` advances correctly, and
  code-review findings survive the L0 entry cap (extracted from full phase
  outputs).

## [0.1.26] - 2026-08-10

### Fixed

- **run_agent loop works with small local models** — the agent loop no longer
dies with an opaque "reached the iteration cap" message when a 1.5B/3B model
keeps re-calling tools. When the tool-call budget (maxIterations) or per-run
tool cap (maxToolCalls, default 8) is exhausted, one extra generation runs
with a system prompt that forbids tool calls and synthesizes an answer from
the history. Read-only tools (`get_project_context`, `list_artifacts`,
knowledge reads, analysis tools) are skipped on repeat — their result is
already in the history — and exact-argument-repeat calls on any tool are
detected as loops. The tool-calling prompt tells the model to answer as
soon as it has what it needs.

### Removed

- **`vectalon train` and the fine-tune dataset feature** — the command, the
  `build_training_dataset` MCP tool, `src/training/` (dataset builder + LoRA
  plan), the interactive-menu entry, the `FINE_TUNING.md` guide, and the
  public training exports are gone. Model/knowledge quality is Vectalon's
  job to own end-to-end (web intel + knowledge base + prompt engineering),
  not something users curate. `bench/references` and the relative-to-human
  scoring it feeds are **kept** — that pack is a live part of the benchmark
  pipeline (per-scenario "Relative to human reference", the leaderboard
  vs-human column, and the M6 CI gate), not train-only data. MCP tool count
  is now 58.

## [0.1.25] - 2026-08-10

### Added

- **Web intel pipeline — the model stays current with the RN ecosystem.**
  `vectalon refresh` now fetches React Native release announcements, Expo
  changelog entries, and community newsletter headlines from GitHub releases /
  blog RSS / Atom feeds, extracts the top headlines, and persists them to
  `.vectalon/knowledge/refresh/intel.json`. The local, WASM, and remote model
  system prompts inline these headlines, so every generation knows the latest
  RN releases, breaking changes, and ecosystem news — not stale training data.
  Eight news sources are included: RN releases (GitHub Atom), RN blog, Expo
  changelog, Expo releases, React Native Weekly, **Hacker News React Native
  stories** (Algolia API), **GitHub's most-starred React Native repos**
  (search API), and the **Callstack monthly Open Source Report** (blog RSS) —
  the extractor now also parses JSON APIs (`hits` / `items` shapes) in
  addition to RSS/Atom/HTML.

- **`vectalon serve` auto-refreshes everything — zero user action.** The
  background loop (immediately when stale, then hourly) fetches web intel +
  dependency suggestions, re-seeds the repo-derived knowledge base, and keeps
  the model prompt current. Serve startup now prints the web-intel status so
  it's obvious the model is fed live ecosystem news.

- **Doctor future vision.** The doctor now detects the project flavor (Expo vs
  bare RN-CLI) from package.json and shows it in the header, renders a
  "Recommended but not enabled" section with quick enable commands, and
  prints numbered fix steps for every missing check with auto/manual labels.
  The `--enable <id>`, `--disable <id>`, and `--enable-recommended` flags on
  `vectalon doctor` let you toggle ecosystem items without leaving the doctor.

- **Table rendering — no more truncation.** The doctor and ecosystem commands
  now use a new ANSI-aware, word-wrapping table renderer (`renderTable`).
  Long hints and descriptions are never elided with "…" — every Detail and
  Hint column wraps cleanly and is fully visible. The ecosystem listing also
  gains an "Enabled" column showing which items are already on.

### Changed

- **Benchmark UX — no more silent hangs or leaked noise.** Model-backed bench
  runs now print live per-scenario progress (`[n/total]` start + composite on
  completion) and announce the first-scenario model warm-up, so a leaderboard
  pass shows movement instead of staring at a blank terminal.

### Fixed

- **Shared inference engine** — the first model load now creates one
  llama.cpp engine and reuses it for every inference in the process (previously
  each call re-loaded the GGUF and registered a new `beforeExit` cleanup
  listener, which surfaced as `MaxListenersExceededWarning` on long runs like
  the 11-scenario benchmark and re-paid the multi-second model load per
  scenario).
- **llama.cpp tokenizer noise can never corrupt CLI output** — the
  `load: control-looking token ...` warnings (dispatched asynchronously by the
  native addon, so the old per-inference suppression could be raced past) are
  now filtered by a permanent process-wide stderr filter installed at CLI
  startup.

### Removed

- **`vectalon train` and the fine-tune dataset feature** — the command, the
  `build_training_dataset` MCP tool, the `src/training/` dataset-builder and
  LoRA-plan modules, the interactive-menu entry, and the
  `FINE_TUNING.md` guide are removed. Model/knowledge quality is Vectalon's
  responsibility to own end-to-end (web intel + knowledge base + prompt
  engineering), not something users curate themselves. Public exports
  (`buildFineTuningDataset`, `buildTrainingPlan`, …) are gone too; MCP tool
  count is 58.

## [0.1.24] - 2026-08-10

### Added

- **rn-diff-purge upgrade diffs (native + JS/TS)** — Vectalon now consumes the
  community-maintained template diffs from
  `react-native-community/rn-diff-purge` — the exact data the Upgrade Helper
  shows — so CLI-app upgrades always surface **both** the native
  (`android/`, `ios/`, Gemfile) and JS/TS (`App.tsx`, `index.js`,
  babel/metro/ts configs, `package.json`) template changes to apply, even for
  releases newer than the local catalog. Every bare RN CLI plan includes an
  `rn-diff-purge` manual step; `vectalon upgrade --diff` fetches and
  categorizes the diff live (soft-degrades on network failure); agents get the
  `get_rn_upgrade_diff` MCP tool (live fetch or offline diff parse).
- **Current React Native / Expo catalog** — upgrade knowledge extended to RN
  0.82–0.86 (`LATEST_KNOWN_RN 0.86.2`) and Expo SDK 55–57, with
  `latestKnownExpoSdk()` / `latestKnownRnMinor()` helpers so `--to latest`
  can never go stale again. Also fixed four ecosystem MCP entries pointing at
  nonexistent npm packages, and rn-diff-purge is now a built-in data source
  the doctor reports as OK (nothing to install).
- **Self-maintaining knowledge base** — `vectalon init` scans the repo and
  seeds the artifact knowledge base automatically (project snapshot,
  knowledge graph, code graph, native configuration, learned patterns),
  `vectalon serve` re-seeds it hourly in the background, and
  `vectalon refresh` on demand — knowledge maintenance is Vectalon's job, no
  manual import step. The `vectalon import` command has been removed.

### Fixed

- **`--json` exit codes in render/sandbox** — failing runs now exit 1 in JSON
  mode too (previously a script consuming `--json` saw exit 0 on
  `"ok": false`).
- **NaN timeout / memory limits** — `--timeout abc` no longer instantly
  SIGTERMs the sandbox process group (commander's Number processor turned it
  into NaN); `--memory <mb>` actually applies now (both commands lacked the
  Number processor, so the value arrived as a string and was silently
  dropped). The guards are shared at the choke point across render, the
  sandbox CLI, and `sandbox_run`.

## [0.1.23] - 2026-08-10

### Added

- **Scripted terminal demo recording** — 8 deterministic VHS tapes walk every
  CLI feature (init, status, doctor, selftest, feature workflow, sandbox,
  render, profile, bundle, release, ecosystem, models, upgrade) against the
  CLI demo in dev mode, rendered to `apps/website/demo/recording/clips/*.mp4`
  plus a concatenated `full-demo.mp4`. No model downloads, re-recordable
  anytime via the recording guide; linked from the README next to the
  Onboarding Guide.

### Fixed

- **`render --file` comma-list bug** — the flag spread the comma-separated
  value into characters (`...'a,b'` → `'a'`, `','`, `'b'`), so passing
  multiple files failed with `File not found: .../s`. The value is now
  normalized (string or array, split on commas, trimmed) and covered by unit
  tests; the demo clip shows the broken → fixed before/after.

## [0.1.22] - 2026-08-09

### Added

- **Compile-checked self-healing** — the code-review fix loop now typechecks
  every LLM fix (`tsc`) before accepting it: a fix that doesn't reduce the
  error count is reverted, and heals are capped per file. Agents can no longer
  "fix" code into a worse state. Backed by an end-to-end golden test that runs
  the real TypeScript compiler.
- **Golden test harness + CLI demo** — `runGoldenFeatureWorkflow` replays the
  full 13-phase feature workflow against a scaffold with a scripted model
  router (no model download, deterministic), turning the demo into a
  CI-detectable regression harness. Ships a non-Expo CLI demo
  (`apps/website/demo/cli-app`) proving the toolchain isn't Expo-only, and a
  deterministic generator for the Expo login demo
  (`scripts/generate-expo-demo.js`) so both demos are regenerable.
- **RN best-practices in generated code** — generated screens now use
  `Pressable` over `TouchableOpacity`, ternaries over `{x && <…>}` leaked
  renders, and `borderCurve: "continuous"` with `borderRadius`. Templates
  typecheck on Expo SDK 53 / React 19. Both demo projects were regenerated to
  ship the new patterns.
- **New guardrail rules** — `use-pressable` + `no-leaked-render` added to the
  on-save guardrails (36 total), matching the analyzer exactly (same regex and
  message), so the editor flags them on save too.
- **New code-review analyzer rules** — `animation-layout-props`,
  `animation-press-gesture`, `navigation-native-stack`, and
  `list-scrollview-map` from the Vercel RN skills audit. All six RN
  best-practices rules carry `LLM_RULE_SIGNALS` entries, so LLM findings on
  them are hallucination-verified against the actual code (33 rules total).
- **Docs & diagrams** — README and CLI reference refreshed with every command
  and feature (including `vectalon status` and `serve --safe-mode`), and
  Excalidraw diagrams of the 13-phase feature workflow and the
  compile-checked healing loop.

## [0.1.21] - 2026-08-09

### Fixed

- **`feature --resume` actually resumes** — the CLI now passes `resume: true`
  to the workflow engine, so completed phases (PRD → implementation, tests)
  are skipped instead of silently re-running. Previously a resume re-ran
  implementation and regenerated files the model had already written.
- **LLM review hallucination filter** — review findings are now verified
  against the actual code before they count. A small local model can
  pattern-match rule names from the prompt and report a `missing-key-prop` on
  a file with no `.map()`, or `no-http-url` on a file with no URL; those
  findings are dropped deterministically, so clean code passes the review
  gate instead of failing it.
- **Local model preset selection** — `LocalProvider`/`ModelRouter`/`setup`
  honor the manifest `modelName` (e.g. `qwen2.5-coder-3b`) instead of
  hardcoding the 1.5B default, so the larger, more reliable preset can be
  selected per project for generation and review.
- **React 19 + RNTL v14 template fixes** — generated screens no longer emit
  the `JSX.Element` annotation (removed in React 19 types) and generated tests
  `await render()`/`renderHook()` (the RNTL v14 async API); screen tests with
  JSX are written as `.tsx`/`.jsx`. Generated code now typechecks on
  Expo SDK 53 / RN 0.79 / React 19 projects.

### Added

- **Onboarding & video docs** — `ONBOARDING.md` (a full feature tour for new
  users), `VIDEO_SCRIPT.md` (13-min daily-loop walkthrough) and
  `VIDEO_BROLL.md` (shot list for all 6 clips), linked from the README.
- **Demo project** — `apps/website/demo/login-app`: an Expo SDK 53 app with a
  login-screen feature generated by a full green workflow run (13/13 phases),
  its committed paper trail, Hermes profile + telemetry fixtures, and a
  `REPLAY.md` shoot guide. Excluded from the pnpm/npm workspace so CI never
  installs or tests it.
- **Benchmark leaderboard improvements** — local model output now parses into
  files (leaderboard scoring 0% → 87%); the leaderboard CLI positional
  directory is wired through.

## [0.1.20] - 2026-08-08

### Added — P2: operational excellence for a paid product

- **`vectalon status` (P2-15)** — the first command you ask a customer to run.
  One read-only report: daemon running? (pid, port, health), MCP server
  reachable? (tool count), model provider status (ready/degraded with the
  missing-key hint), last background refresh time, license/trial days
  remaining, and `.vectalon/` disk usage. Every probe is wrapped so one
  broken source degrades to a line instead of killing the report.
- **Graceful shutdown & stale-state cleanup (P2-16)** — serve and daemon now
  handle uncaught exceptions: close the server, remove the daemon.json state
  file, exit non-zero. On startup the daemon always verifies the recorded PID
  is alive and the port responds; a stale/crashed state is wiped instead of
  being trusted.
- **MCP safe mode (P2-17)** — `vectalon serve --safe-mode` disables model
  generation (every call returns a stub), file-writing tools, and device
  control. Run Vectalon in CI or on customer machines with zero side effects
  — and the escape hatch if a model provider goes haywire. Safe mode is
  reported in the tool list and health checks.
- **Tool input validation (P2-18)** — every `@mcpTool` handler now validates
  its declared `inputSchema` `required` fields before running. A missing or
  wrong-typed required field returns a structured 400-style MCP error naming
  the field, instead of a `TypeError: Cannot read property` deep in a
  handler. Empty strings are allowed where schemas permit them.
- **Admin alert webhook (P2-19)** — when error telemetry sees ≥5 errors with
  the same stack signature within an hour, or a serve/daemon heartbeat goes
  silent for >30 min from an active license, a structured alert (stack
  fingerprint, affected versions, OS counts, commands) is POSTed to a
  Discord/Slack webhook (`VECTALON_ALERT_WEBHOOK`). Per-signature dedupe
  state in the user config dir; off by default; best-effort sends.
- **SUPPORT_RUNBOOK.md (P2-20)** — customer-facing support runbook: exact
  commands to ask for (`vectalon status`, `vectalon doctor --json`,
  `vectalon support --upload`), how to read `.vectalon/logs/`, what error
  codes mean, and the three most common root causes with fixes.

## [0.1.19] - 2026-08-08

### Added — P1: proactive monitoring (you know before clients do)

- **Release regression gate in CI (P1-11)** — the publish workflow now runs a
  `bench-gate` job (same release trigger as the publish job) that blocks the
  release when the benchmark degrades: overall relative-to-human composite
  below 0.95, the overall guardrail failed rate increased vs baseline, or
  overall adherence dropped more than 5 points. Runs on top of the existing
  per-axis `--baseline` comparison; the PR workflow's bench job gets the same
  stricter gate automatically.
- **Rotating file logger (P1-12)** — every `logger.info/warn/error/debug`
  call is mirrored to `.vectalon/logs/vectalon.log` with ISO timestamps,
  capped at 5 files × 10 MB (`.1` … `.4` rotation). `vectalon …
  --diagnostics` sets `VECTALON_DEBUG=1` so debug lines are captured too.
  Best-effort I/O: a read-only project never breaks a command.
- **Nightly smoke test against real templates (P1-13)** — a new
  `nightly-smoke` workflow runs `vectalon init`, `doctor`, `selftest`, and a
  real `serve` boot (HTTP `/health` poll) every night against three real
  project templates: Expo SDK 51, RN CLI 0.74, and RN 0.72 — catching
  ecosystem drift (Metro changes, version-detection regressions, init/serve
  crashes on fresh projects) before users do. Run it on demand via
  `workflow_dispatch`.
- **RN version drift warning (P1-14)** — `vectalon init` and `vectalon
  serve` now emit a loud warning when the project's React Native version is
  newer than the newest version the rule set knows (`0.81.0`): “Some
  guardrails, codemods, and upgrade steps may be inaccurate.”

## [0.1.18] - 2026-08-08

### Added — P0 hardening: existing features must never break

- **Model router resilience (P0-7)** — `generate()` never throws: a primary
  failure is retried once, then walks a fallback chain (remote → local native
  → WASM → a deterministic stub carrying the clear, aggregated error). New
  per-provider **circuit breaker** (`model/circuitBreaker.ts`): 3 failures
  inside a 60s window short-circuit a provider for 5 minutes (half-open trial
  after cooldown — a failed trial re-opens immediately). Circuit state is
  exposed via `getCircuitSnapshots()` for health/diagnostics.
- **Hardened `vectalon init` (P0-6)** — full rollback + idempotency via a
  durable transaction record (`.vectalon/.init-state.json`): a failed init
  leaves the project recoverable. Next run detects the dirty state and offers
  `--resume` (continue from the last completed phase) or `--clean-restart`
  (restore originals + delete init-created files). A completed init is a
  no-op unless `--force`. Invalid `--model` values now throw instead of
  killing the host process.
- **Self-healing doctor (P0-10)** — every probe runs through a defensive
  wrapper (`defensiveCheckers`), so one broken checker (missing
  better-sqlite3, node-llama-cpp load failure) can never kill the whole
  report. New `vectalon doctor --selftest` verifies doctor's own probes work.
- **Guardrail parse protection (P0-9)** — AST analysis runs through a guarded
  analyzer (`guardrails/analyze.ts`) with a deterministic node budget in
  `AstScanner`; every rule degrades per-file via `safe()`. A corrupted or
  experimental-syntax file emits exactly one "Vectalon: could not parse file"
  diagnostic instead of crashing the run (or the extension host on save).
- **Resilient VS Code extension (P0-8)** — server spawn retries 3× with
  exponential backoff; a failed connect offers **Retry** / **Restart Server**
  (which actually work — the connecting lock is released before the prompt);
  a background reconnect loop re-probes every 30s (re-reading `url`/
  `autoStart` settings) so the extension recovers after sleep/wake; guardrail
  checks on save are non-blocking and silently skip when the server is down.
- **Selftest honesty fix** — the `model-inference` check now detects the
  router's aggregate fallback stub and reports the underlying reason: a
  server answering with an error (bad key/model) fails; an unreachable
  server warns — never a dishonest pass.

## [0.1.17] - 2026-08-08

### Added

- **Telemetry backend** (`apps/telemetry`) — a zero-runtime-dependency
  TypeScript service that backs the client's diagnostics pipeline: `POST
  /v1/errors`, `POST /v1/heartbeat`, and `POST /v1/support` (gzipped support
  bundles forwarded to the support address with a delivery token), plus
  `GET /v1/health`, recent-event list endpoints, and a self-contained health
  dashboard. Storage auto-selects Upstash KV (Vercel) → JSON files → memory;
  support email via Resend. Hardened against gzip bombs, oversized bodies,
  and untrusted recipients. Deployable on Vercel or any Node server — point
  the client at it with `RN_VECTALON_TELEMETRY_URL`.

### Fixed

- **VS Code Marketplace publish path** — both `publish.yml` and
  `vsce-publish.yml` now invoke `scripts/publish-vsce.js` from its real path
  (`packages/rn/scripts/`); the previous repo-root path silently failed
  under `continue-on-error`, so the extension upload never ran. Marketplace
  distribution is parked as a future priority (see the enhancement plan)
  pending the `VSCE_PAT` secret and publisher registration — the extension
  upload stays non-blocking.

## [0.1.16] - 2026-08-08

### Added — Diagnostics & error telemetry (P0: client visibility)

- **Structured error telemetry pipeline** (`diagnostics/errorReporter.ts`) —
  replaces anonymous usage tracking with errors-only, opt-out reporting:
  crash dumps, stack traces, and CLI command context are queued to a local
  JSON file (deduped by message, capped at 50) and POSTed to the Vectalon
  error endpoint. Disabled via `telemetry.enabled=false` /
  `telemetry.errors=false` in the user config, and always off in dev/test
  mode. `reportError(…, 'warn')` and uncaught exceptions/unhandled rejections
  feed it automatically.
- **`--diagnostics` flag on every command** — `vectalon <command>
  --diagnostics` writes `.vectalon/diagnostics-bundle.json` with Node/OS
  versions, RN/Expo versions, model provider, the full stack trace (on
  failure), the last 5000 log lines, and a sanitized listing of `.vectalon/`.
  The CLI logger now keeps an in-memory ring buffer of the last 5000 lines.
- **Liveness heartbeats** — `vectalon serve` and `vectalon daemon` POST a
  lightweight ping (version, uptime, active model provider, OS, project
  type) every 5 minutes (`diagnostics/heartbeat.ts`). Not usage tracking —
  broken releases become visible within one interval.
- **Deep `/health` endpoint** — the MCP HTTP server's `GET /health` now
  returns `healthy | degraded | critical` + `checks[]` covering the model
  provider (key present + reachable), artifact store writability, sub-MCP
  client responsiveness, and `vectalon init` config validity
  (`diagnostics/health.ts`). The daemon's `/health` carries checks too, and
  `vectalon daemon --status` prints them.
- **`vectalon support --upload`** — collects a sanitized support bundle
  (logs, pending error queue, last crash report, sanitized package.json,
  `.vectalon` state), stamps it with a support token (`RN-XXXXXXXX`), and
  uploads it gzipped to the support pipeline, which routes it to the support
  address. Secrets (API keys, tokens, credentials) are redacted recursively
  before upload; the bundle is also saved to
  `.vectalon/support-bundle.json`.
- **VS Code extension** — the status-bar tooltip now surfaces the server's
  deep health (healthy / degraded / critical + failing checks) via a new
  `GET /health` client method.
- **Selftest** — new `diagnostics` category with 5 checks (error queue
  round-trip, bundle emission, deep health aggregation, heartbeat POST,
  sanitized support upload), all verified against a local HTTP server.

## [0.1.15] - 2026-08-08

### Added — Knowledge provenance & confidence scoring (III-3)

- **Provenance module** (`knowledge/provenance.ts`) — every artifact gets a
  deterministic 0..1 confidence (source trust × status × recency decay), a
  staleness date (last updated + 90-day TTL), and a source. Learned patterns
  carry provenance too (`source: learner | manual | web` with staleness
  decay on `lastSeen`).
- **Confidence-ranked retrieval** — `KnowledgeIndex.search` / `searchRemote`
  now sort by relevance × `confidenceFactor`, so recent, high-confidence
  context ranks above stale or speculative docs; every result carries
  `confidence`, `provenance`, and `rankedScore`. `TeamStore` and the
  `search_knowledge` MCP tool surface them to agents.
- **Helpers** — `computeConfidence`, `artifactProvenance`, `stalenessDate`,
  `recencyFactor`, `confidenceFactor`, `rankByConfidence`, and
  `patternProvenance` are exported from the package (deterministic, no model
  calls; `now` injectable for tests).
- **Selftest** — new `knowledge-provenance` check verifies scoring, staleness
  decay, confidence ranking, and pattern provenance end-to-end.

## [0.1.14] - 2026-08-08

### Added — Crash-rate anomaly detection & auto-rollout gates (M18)

- **Z-score anomaly detector** (`sdlc/CrashAnomalyDetector.ts`) — buckets
  timestamped crashes into hourly windows, derives a mean + stdDev baseline
  from the historical buckets, and flags a window whose rate exceeds
  **baseline + n·stdDev** (default 3σ) as an anomaly — the auto-rollout gate.
- **Knowledge-base baselines** — after each healthy window the baseline is
  persisted as a `telemetry` artifact (`recordCrashBaseline` /
  `getLatestCrashBaseline`, capped at 10 per project), so the next release is
  compared against accumulated history. A spike window never overwrites the
  baseline — the gate stays strict until rollback or fix.
- **Auto-filed incidents** — `monitorReleaseAnomaly` files an incident (via
  the existing `IncidentAnalyzer`) with a rollback suggestion when the z-score
  threshold is breached; healthy windows persist the refreshed baseline.
- **`vectalon release --monitor` integration** — timestamped telemetry exports
  now run the z-score analysis automatically (new `--zscore <n>` option);
  untimestamped exports or an explicit `--baseline` keep the classic ratio
  check. The MCP `check_crash_rate` tool does the same when the crash JSON
  carries timestamps.
- **Selftest** — new `sdlc-crash-anomaly` check exercises bucketing,
  baseline derivation, spike detection (z ≥ 3σ → rollback), incident filing,
  and the KB baseline round-trip.

## [0.1.13] - 2026-08-08

### Added — Custom model provider support (M19)

- **Provider registry** (`model/setup.ts`) — a single source of truth for every
  remote provider: `openai`, `anthropic`, and the new **`azure-openai`**,
  **`groq`**, **`ollama`**, and **`vllm`**, each with a default model, API-key
  env var (or none), base URL, and wire kind. `MODEL_PROVIDERS`,
  `REMOTE_MODEL_DEFAULTS`, `apiKeyEnvFor`, `detectModelAvailability`,
  `buildModelConfig`, `activeModelLabel`, and `isRemoteKeyMissing` are all
  registry-driven now — keyless local servers (Ollama/vLLM) are never flagged
  as key-missing.
- **`RemoteProvider`** (`model/providers/RemoteProvider.ts`) — dispatches on
  the registry's wire kind: `openai` (Chat Completions + Bearer — also Groq
  and the OpenAI-compatible endpoints of local Ollama/vLLM), `anthropic`
  (Messages + `x-api-key`), and a new `azure` format (deployments path +
  `api-key` header + `api-version` query). An `endpoint` override (per
  project in `modelConfig.endpoint` or via global config) points custom
  servers anywhere; empty bearer headers are skipped for keyless servers.
- **`ModelRouter`** — threads `endpoint` through to the provider and reports
  the new providers in `getProviderStatus()`.
- **Embedding seam** (`knowledge/remoteEmbeddings.ts`) — a new
  `AzureOpenAIEmbeddingProvider` (deployments path + `api-key` +
  `api-version`) and resolution for `azure-openai` (`AZURE_OPENAI_API_KEY`),
  `ollama` (`http://localhost:11434/v1`, `nomic-embed-text`), and `vllm`
  (`http://localhost:8000/v1`, `BAAI/bge-m3`) alongside the existing
  OpenAI / OpenAI-compatible providers — exported from the knowledge barrel.
- **CLI** — `vectalon init` offers the new providers in the interactive
  picker (with key/label hints), `--model` validation and key-missing
  warnings are registry-driven across `serve`, `feature`, `bench`, and
  `doctor` (doctor's `ma-model` check now reports keyless providers as ready).
- **Self-test** — a new `model-provider-registry` check validates that every
  remote provider is registered with a default model, key env, base URL, and
  correct wire kind (labels render, keyless flags are honest).
- **Tests** — 30+ new/updated tests covering the registry, the Azure / Groq /
  Ollama / vLLM wire calls, router routing + status, and the embedding seam.

## [0.1.12] - 2026-08-08

### Added — VS Code extension marketplace publish (M12)

- **Marketplace metadata** (`extension/package.json`): `galleryBanner` (dark
  `#1E1E2E`), CI + release badges, `homepage`, `bugs`, explicit
  `extensionKind: ["workspace"]`, and a `vscode:prepublish` hook so a bare
  `vsce package` always compiles fresh. `extension/CHANGELOG.md` feeds the
  Marketplace **Changelog** tab.
- **Release-flow publish** — every `[publish-rn]` release now publishes the
  `.vsix` to the VS Code Marketplace right after the npm publish
  (`scripts/publish-vsce.js` with the released version), so the README's
  promised auto-publish finally runs. `@vscode/vsce` is a devDependency, so
  packaging is deterministic in CI.
- **CI packaging gate** (`pr.yml`) — PRs now `vsce package` the extension and
  list the shipped files, so a broken icon / metadata / `.vscodeignore` fails
  the PR, and a stale compiled `out/` trips the uncommitted-artifacts check.
- **Manual workflow fixed** (`vsce-publish.yml`) — the manual publish / retry
  workflow previously ran `npm ci` in a pnpm workspace and could not install;
  it now uses the repo's pnpm install (with the private-core checkout).

## [0.1.11] - 2026-08-07

### Added — Metro-aware execution sandbox (I-4)

- **`src/render/`** — the flagship "compile + render before the diff" loop:
  generated TS/TSX is transpiled, executed headlessly inside the V-1 sandbox,
  and the console logs, render tree, and runtime errors are returned to the
  caller — so agents self-correct on JSX/TS errors instead of only being
  lint-aware.
  - **Transpile** (`compile.ts`): project Babel with TS/React presets (the
    exact Metro transform chain when the project ships them) → offline
    TypeScript `transpileModule` → a parser-only syntax check. A bundled
    `@babel/parser` backstop catches syntax errors that `transpileModule`
    silently recovers from (e.g. unclosed JSX), so nothing invalid ever
    reaches the render step.
  - **Headless shim** (`shim.ts`): a self-contained zero-dependency React +
    react-native shim (written into the sandbox root, aliased as `react` /
    `react-native`) implementing `createElement`, function components,
    `useState` / `useEffect` / `useMemo` / `useCallback` / `useRef` /
    `useContext` / `createContext`, host components (View, Text, FlatList, …),
    and a depth/node-capped tree walker that serializes the element tree to
    JSON — with the render tree carrying real component names and the
    returned-element shape (no collapsed host nodes).
  - **Harness** (`harness.ts`): runs inside the sandbox — realpaths the shim
    once (macOS `/var` → `/private/var` symlink must not create a second
    module instance with fresh hook state), captures bounded console logs,
    loads the compiled entry, renders its default export, and prints a single
    `VECTALON_RENDER:` JSON marker for the parent to parse.
  - **Orchestrator** (`run.ts`): validates sandbox-relative paths (rejects
    absolute paths and `..` traversal), writes compiled modules + shim +
    harness into an isolated temp root, executes under `runSandboxed`
    (scrubbed env, network denied, timeout/memory bounded), and returns a
    structured `RenderResult` (`ok`, `transpiler`, `renderer`, `compiled`,
    `logs`, `tree`, `loadError`, `runtimeError`, `isolation`, `droppedEnv`).
- **CLI** — `vectalon render [dir] --entry <file> [--file <file> ...]` with
  `--timeout`, `--memory`, `--json`. Pro tier gated. Prints the transpiler
  used, renderer, console logs, the render tree, and any errors.
- **MCP tool** — `render_component` (accepts a map of sandbox-relative
  path → source content plus an `entry`; returns the structured render
  result — perfect for an agent verifying its own generated code).
- **Self-test** — five new `render` category checks (transpile, multi-file
  imports, console capture, runtime-error surfacing, render-tree shape).
- **Tests** — 20+ new tests covering the transpile pipeline, the sandbox
  renderer (with real render-tree assertions), MCP tools, and the CLI.

## [0.1.10] - 2026-08-07

### Added — Sandboxed code execution (V-1)

- **`src/sandbox/`** — the trust foundation for running generated code, tests,
  and scripts in isolated processes with **no ambient authority**:
  - **Environment scrubbing** (`env.ts`): deny-by-default — only a small base
    allowlist survives (PATH, HOME, TMPDIR, locale, …) plus explicit
    `allowEnv` / `env` opt-ins; credential-shaped ambient variables
    (tokens, keys, passwords, SSH agents, CI secrets) are always dropped.
    Every run reports the dropped variable *names* so callers see exactly
    what was stripped.
  - **Isolation backends** (`backend.ts`): `sandbox-exec` (macOS seatbelt
    profile — file writes confined to the sandbox root, outbound network
    denied by default), `bwrap` (bubblewrap on Linux — read-only root bind +
    network namespace), and an honest `process` fallback (scrubbed env +
    rlimits + sandbox-root cwd) when no OS backend exists.
  - **POSIX rlimits** (`limits.ts`): CPU seconds, virtual memory, file size,
    open files, and process-count caps applied via a `ulimit` wrapper before
    the command execs.
  - **Bounded execution** (`run.ts`): wall-clock timeout with SIGTERM →
    SIGKILL to the process group (a runaway never hangs the caller), output
    capture caps per stream, and a structured result (`ok`, `exitCode`,
    `signal`, `timedOut`, `isolation`, `droppedEnv`, `durationMs`).
- **CLI** — `vectalon sandbox [dir] -- <command> [args...]` with
  `--timeout`, `--cpu`, `--memory`, `--network`, `--allow-env`, `--json`.
  Pro tier gated. Prints the backend used, dropped env vars, and the output.
- **MCP tools** — `sandbox_run` (requires an explicit `root` + `command` —
  never defaults to cwd, so agents can't execute against the wrong directory)
  and `sandbox_backend` (reports the isolation available on the machine).
- **Self-test** — six new `sandbox` category checks (env scrub, backend
  detection, command execution, wall-clock timeout, CPU rlimit, write
  confinement — the last warns honestly on process-level backends).
- **Tests** — 20+ new tests covering the scrubber, limit wrapper, backends,
  executor, MCP tools, and the CLI command.

## [0.1.9] - 2026-08-07

### Added — Hermes performance profiling & runtime regression detection (I-7 / M17)

- **`src/perf/`** — parse Hermes `.cpuprofile` and heap snapshots and turn
  measured runtime data into actionable findings:
  - **JS-thread blocking detection** (`cpuprofile.ts`): contiguous sample runs
    where the JS thread stayed in one frame become blocking events
    ("useEffect blocks the JS thread for 500ms — move to a worklet"); hot
    functions are ranked by self time. Supports the flat nodes/samples/
    timeDeltas layout and the older head-tree layout (hitCount fallback).
  - **Heap analysis** (`heapsnapshot.ts`): first-reach retained-size
    approximation per top-level object held by the GC roots (imageCache
    retains 20 MB), plus largest self-size allocations as leak candidates.
  - **Baselines in the knowledge base** (`baseline.ts`): each run can be
    persisted as an `analytics` artifact (same pattern as bundle snapshots)
    and later runs are compared against it — blocking time up >25% or
    retained heap up >30% flags a **regression** finding.
- **Code review integration** — `CodeReviewAnalyzer.review(code, lang, runtime)`
  accepts Hermes metrics and cites them with concrete numbers, e.g. "useEffect
  blocks the JS thread for 500ms — move to a worklet or defer off the JS
  thread." Backward compatible — the static-only path is unchanged.
- **CLI** — `vectalon profile [dir]` with `--profile <file>`, `--heap <file>`,
  `--baseline <label>`, `--save-baseline`, `--threshold-ms`, `--json`. Pro tier
  gated; baselines are stored in and read from the knowledge base.
- **MCP tool** — `analyze_hermes_profile` (paste `.cpuprofile` / heap JSON,
  get deterministic findings).
- **Self-test** — four new `perf` category checks (CPU blocking, heap
  retained, baseline regression, code-review runtime evidence).
- **Tests** — 40+ new tests covering both parsers, the analyzer, baseline
  storage/regressions, the review integration, the CLI, and the MCP tool.

## [0.1.8] - 2026-08-07

### Added — Upgrade Copilot (`vectalon upgrade`)

Automated React Native / Expo version upgrades with codemods, AST-grade
breaking-change impact analysis, and New Architecture migration awareness
(Pro tier):

- **`src/upgrade/`** — the six-stage pipeline (Detect → Catalog → Impact →
  Plan → Codemods → Verify):
  - **Detect** (`detect.ts`): reads `package.json`, `android/build.gradle`,
    `android/gradle.properties`, `ios/Podfile` for react-native / expo
    versions, Hermes, New Architecture, Kotlin and SDK levels —
    deterministic, no network, no subprocesses.
  - **Catalog** (`catalog.ts`): curated migration catalog of the top
    breaking changes per release — Hermes flag relocation (0.70), New
    Architecture opt-in (0.71), `requireNativeComponent` →
    `codegenNativeComponent` (0.70), ReactTestRenderer import fix (0.73),
    Android SDK levels (0.74+), Kotlin / AGP requirements (0.77+), React
    pairing, Expo SDK targets.
  - **Impact** (`impact.ts`): walks the project's own source for native
    modules, bridge usage (`NativeModules` / `requireNativeComponent`) and
    Fabric-hostile patterns, flagging per-file blast radius.
  - **Plan** (`planner.ts`): step-by-step migration plan with per-step risk
    and a total risk label; steps are `auto` (safe codemods), `review`
    (need `--force`) or `manual` (documented instructions).
  - **Codemods** (`codemods.ts`): applies only with `--apply`; backs up
    every edited file under `.vectalon/upgrades/backups/` and writes a
    provenance manifest (`.vectalon/upgrades/<timestamp>-upgrade.json`)
    recording every edit as an artifact.
  - **Verify** (`verify.ts`): doctor, typecheck and the bundle-budget
    regression gate against a pre-upgrade Metro snapshot.
- **CLI** — `vectalon upgrade [dir]` with `--to <version>`, `--dry-run`
  (default), `--apply`, `--force` and `--json`. Refuses to run outside an
  RN/Expo project; `--apply` never targets cwd by accident.
- **MCP tools** — `plan_upgrade`, `apply_upgrade`, `detect_upgrade_state`
  (`UpgradeTools` registry). `apply_upgrade` requires an explicit
  `directory` argument — it never writes to the current working directory.
- **Self-test** — three new `upgrade` category checks (detect, plan,
  codemods + provenance) in the `vectalon selftest` suite.
- **Tests** — 40+ new tests covering detection, catalog, impact, planner,
  codemods, CLI and MCP tools.

## [0.1.7] - 2026-08-07

### Added — Phase K: Feature self-test suite (`vectalon selftest`)

- **`src/selftest/`** — a sandboxed, deterministic, offline suite that tests
every feature of the package and makes the package's behavior visible to
clients:
  - **`FEATURE_CATALOG`** (`catalog.ts`): 41 checks across 12 categories —
    CLI (version, command actions, logger, `init` scaffolding), SDLC
    (release planner, release-note writer, git-history derivation, ADR,
    stories, test cases, code review, SWOT, tradeoffs, threat model),
    guardrails (rule catalog, engine, policy), knowledge (artifact store,
    knowledge index, embeddings), harness (scanner, workspace detection),
    model (router, tool-calling protocol, WASM presets), MCP (server tool
    surface, subprocess parsing), workflows (catalog, state persistence),
    ecosystem (catalog, config, recommendations), bench (scoring, rubric,
    scenario pack), adapters (runCommand, git round-trip, CI templates,
    registry), and memory (project memory, pattern learner).
  - **`ActivityTracer`** (`trace.ts`): records every step, shell command, and
    file write per check — the “what is this package doing” log; the
    `Sandbox` gives each check an isolated temp dir whose writes are traced
    automatically (never touches the user's project).
  - **Live progress streaming** (`progress.ts`): results stream to stderr as
    each check finishes — a clack-style spinner + progress bar in a TTY,
    plain `✔`/`✖`/`⚠` lines (no ANSI) when piped/CI — via optional
    `onStart`/`onDone` hooks on `runSelfTest`; `--json` keeps stderr quiet.
  - **Real model inference** (`model-inference`): the model check runs an
    actual inference through the configured provider (local GGUF via
    `vectalon pull`, cached WASM weights, or a remote API key) and verifies
    the model-generated output — it never passes on the deterministic
    fallback stub. No model/API key → warns with the exact command to enable
    real inference, or fails under `--require-model`; `--model <provider>`
    forces the provider.
  - **`runSelfTest`** (`runner.ts`): runs checks with `--category`/`--only`
    filters, aggregates per-check durations, statuses, and activity counts.
  - **Reporters** (`reporters.ts`): terminal table summary, a human-readable
    `report.log` activity trace, raw `report.json`, and a **self-contained
    HTML dashboard** (no network) with per-check cards, status/category
    filters, and expandable activity traces.
- **CLI command**: `vectalon selftest [dir]` (`--list`, `--category <cat>`,
  `--only <id>`, `--json`, `--open`, `--out <dir>`, `--no-html`, `--verbose`)
  — writes `report.json`/`report.log`/`report.html` to `.vectalon/selftest/`
  and exits non-zero when any check fails. Also exposed in the interactive
  menu. `createProgram()` is now exported from the CLI module so command
  registration is testable.
- 23 new tests (1,359 total, 151 suites).

## [Unreleased]

### Added — Phase K: Living knowledge brain (III-2) — git-history derivation

- **`GitHistoryDeriver`** (`src/sdlc/GitHistoryDeriver.ts`): deterministic
derivation of SDLC artifacts from `git log` output — “knowledge that writes
itself.” Parses both `--oneline` and extended `%h|%an|%ai|%s` formats,
classifies commits into the release-note taxonomy (shared with
`ReleaseNoteWriter` via the new exported `categorizeChange`), flags breaking
changes, and produces a **changelog** grouped by category (commit refs +
BREAKING badges), **release notes** via `ReleaseNoteWriter` (with the detected
semver bump when a current version is given, reusing the ReleasePlanner bump
detection), and **ADR drafts** from decision-worthy commits (architecture /
migration / redesign keywords) rendered through `ADRWriter` as proposed ADRs.
- **MCP tool**: `derive_from_git_history` — accepts `gitLog` output or a repo
  `path` (auto-runs `git log --format=%h|%an|%ai|%s -50`); persists the
  changelog + release notes as a `devops` artifact and each ADR draft as an
  `architecture` artifact (`includeAdrs: false` skips the ADRs).
- Exported the module, parser, renderer, and types from the package entry point.
- 22 new tests (1,336 total, 146 suites).

### Added — Phase G: Model-backed retrieval

- **`KnowledgeIndex`** (`src/knowledge/KnowledgeIndex.ts`): artifact index with
  TF-based lexical scoring (title terms weigh 3× content), team/project/type
  scoping, limits, and an optional semantic cosine merge via an `EmbeddingProvider`.
- **`embeddings`** (`src/knowledge/embeddings.ts`): `EmbeddingProvider` interface,
  `cosineSimilarity`, and a deterministic offline `HashEmbeddingProvider`
  (character-bigram hashing) so retrieval stays hermetic; real providers plug into
  the same seam.
- **`TeamStore` now delegates search to `KnowledgeIndex`** and `search_knowledge`
  surfaces `lexicalScore` and `semanticScore` alongside the combined `score` —
  enabling model-backed retrieval over the team brain.
- **`serve` attaches the deterministic embedding provider by default** so semantic
  retrieval works offline out of the box.
- Exported the index, embedding helpers, and their types from the package entry point.
- 16 new tests (264 total, 49 suites).

### Added — Phase F: Team brain

- **`TeamStore`** (`src/knowledge/TeamStore.ts`): multi-project artifact registry with
  keyword-ranked cross-project search (title matches weigh higher than content),
  team/project/type scoping, a limit, and aggregated role-scoped context that groups
  artifacts by project and reuses the role→type map.
- **MCP team tools**: `get_team_context` (aggregated context across team projects,
  scoped by team, project, and role) and `search_knowledge` (ranked cross-project
  results scoped by team, project, and type). Advertised only when a `TeamStore` is
  attached to the server.
- **`serve` reads `.vectalon/team.json`**: register sibling projects (path, name,
  optional team) so the harness serves a git-backed team brain; the local project is
  registered automatically. Invalid/missing project stores are skipped with a warning.
- Exported `TeamStore` and its types from the package entry point.
- 20 new tests (248 total, 47 suites).

### Added — Phase E: DevOps, ops, analytics

- **Deterministic devops/ops/analytics modules** (`src/sdlc/`): `ReleaseNoteWriter`
  (auto-categorized Added/Fixed/Changed/Removed/Security/Performance sections with
  an explicit release date), `IncidentAnalyzer` (sev1/sev2/sev3 detection with
  override, root-cause reuse, timeline, and severity-appropriate actions),
  `RunbookWriter` (symptoms, numbered steps, escalation, verification, default
  owner), `KpiReportAnalyzer` (change/change-percent vs baseline, on-track /
  below-target / no-target / no-baseline statuses).
- **MCP devops/ops/analytics tools**: `write_release_notes`, `analyze_incident`,
  `write_runbook`, `analyze_kpis`. Deterministic-first, persisted as `devops`,
  `operations`, and `analytics` artifacts.
- Exported the new modules and types from the package entry point.
- 22 new tests (228 total, 45 suites).

### Added — Phase D: Architecture, security, UX

- **Deterministic architecture/security/UX modules** (`src/sdlc/`): `ADRWriter`
  (ADR scaffold with options/decision/status), `TradeoffAnalyzer` (scored-attribute
  ranking with best-option), `ThreatModeler` (STRIDE six-category model with
  mitigations), `AccessibilityChecker` (unlabelled images, touchable roles,
  text-input labels), `DesignSystemExtractor` (colors/spacing/fonts/radius tokens
  with occurrence counts), `WireframeGenerator` (ASCII wireframes from typed
  sections, `type:label` syntax).
- **MCP architecture/security/UX tools**: `write_adr`, `analyze_tradeoffs`,
  `threat_model`, `check_accessibility`, `extract_design_system`,
  `generate_wireframe`. Deterministic-first, persisted as `architecture`,
  `security`, and `design` artifacts.
- Exported the new modules and types from the package entry point.
- 32 new tests (206 total, 40 suites).

### Added — Phase C: QA & engineering depth

- **Deterministic QA/engineering modules** (`src/sdlc/`): `TestPlanWriter` (plan
  scaffold with scope, environments, entry/exit criteria), `TestCaseWriter`
  (Given/When/Then acceptance criteria → Jest test file), `BugTriageAnalyzer`
  (severity + p0–p3 priority triage), `RootCauseAnalyzer` (8 root-cause buckets
  with investigation steps), `CodeReviewAnalyzer` (console.log, `any`, empty
  catches, TODOs, inline styles, `@ts-ignore` with line numbers), `RefactorSuggester`
  (oversized files/functions, magic numbers, `any`, console output).
- **MCP QA tools**: `write_test_plan`, `triage_bugs`, `analyze_root_cause`,
  `review_code`, `suggest_refactors`. Deterministic-first, persisted to the
  knowledge base as `qa` / `engineering` artifacts.
- **`write_test` now accepts `acceptanceCriteria`**: when provided, it emits
  deterministic Jest test cases derived from the criteria (persisted as a `qa`
  artifact); without it, it continues to proxy to the model layer.
- Exported the new modules and types from the package entry point.
- 34 new tests (174 total, 33 suites).

### Added — Phase B: Requirements & BA

- **Deterministic BA modules** (`src/sdlc/`): `RequirementWriter` (PRD scaffold),
  `StoryWriter` (user story cards, one per persona), `AcceptanceCriteriaWriter`
  (Given/When/Then from a story), `GapAnalyzer` (missing/partial/met with
  recommendations), `SWOTAnalyzer` (four quadrants + SO/WO/ST/WT strategies),
  `SupportTicketAnalyzer` (keyword-themed grouping with top-issue + recommendations).
- **MCP BA tools**: `write_prd`, `write_user_stories`, `define_acceptance_criteria`,
  `analyze_support_tickets`, `run_gap_analysis`. All deterministic-first; generated
  documents are persisted to the knowledge base as `generated` artifacts, and
  `write_user_stories` / `define_acceptance_criteria` accept `parentId` to link
  into the traceability chain. `write_prd` / `write_user_stories` support an
  `enhance: true` flag to expand the scaffold through the configured model.
- Exported the new modules and types from the package entry point.
- 33 new tests (140 total, 26 suites).

### Added — Phase A: Knowledge base (Company Brain)

- **Artifact taxonomy** (`src/knowledge/artifactTypes.ts`): 13 SDLC artifact types,
  sources, statuses, and an 8-role → artifact-type map.
- **`ArtifactStore`**: typed, versioned document store persisted to
  `.vectalon/knowledge/artifacts.json`; content checksums, history, links, and dedup.
- **`Traceability`**: forward/backward graph traversal over artifact links.
- **`RoleEngine`**: role-scoped knowledge context assembly (pm, ba, architect,
  engineer, qa, devops, support, analyst).
- **`rn-vectalon import <file|dir>`** command: imports markdown/JSON artifacts with
  frontmatter + keyword type detection, `--type`/`--title` overrides, and
  checksum-based dedup.
- **MCP knowledge tools**: `list_artifacts`, `get_artifact`, `get_knowledge_context`,
  `link_artifacts` (available when a knowledge store is present).
- `docs/ENHANCEMENT_PLAN.md`: roadmap from project harness to multi-role SDLC harness.
- 30 new tests (107 total, 19 suites).

## [0.1.0] - 2026-07-31

First real release of rn-vectalon. This release hardens the v0.1 API surface
with a full test suite, fixes several defects found during requirement-driven
testing, and removes a dependency that was incompatible with the CommonJS build.

### Added

- Test infrastructure: Jest + ts-jest, 77 tests across 14 suites covering the
  scanner, context engine, model layer, MCP protocol, SDLC modules, memory, and CLI.
- ESLint + TypeScript strict validation wired into `npm run lint` / `npm run typecheck`.
- `MCPServer.handleToolCall()` — public, testable tool dispatch used by the stdio protocol.
- `ContextEngine.getPatternStore()` — exposes the attached pattern store.
- `suggest_dependency_update` tool handler: reports update status against a curated
  catalog (`react-native`, `react`, `typescript`, `jest`, `@react-navigation/native`).
- Pattern persistence: learned patterns are now written to the memory store via
  `PatternStore.addPattern`, so `get_learned_patterns` returns real learned data.
- `CHANGELOG.md` and a project `.eslintrc.json`.

### Changed

- Replaced the `conf` dependency (ESM-only, broke the CommonJS build) with a small
  internal JSON config store. Runtime config lives in `~/.config/rn-vectalon/config.json`
  (override with `RN_VECTALON_CONFIG_DIR`); `.vectalon/rn-vectalon.json` is now a
  project *manifest* written by `init`.
- `ModelRouter` now remembers the provider chosen at `initialize()`, so
  `serve --model` actually takes effect for tool calls.
- `get_learned_patterns` returns learned patterns instead of a component dump.
- The `generate_component` tool schema only advertises `functional` components;
  class components remain unsupported (documented limitation).
- `ProjectMemory` persists its store file on construction.

### Fixed

- `suggest_dependency_update` was advertised in `getToolList()` but had no handler.
- `serve --model` was inert: `generate()` re-read global config instead of the router's provider.
- `init` wrote a config file that was never read; the written file is now an accurate manifest.
- Remote provider responses were untyped (`unknown`); added `OpenAIResponse` /
  `AnthropicResponse` shapes and extended `ModelResponse.usage` with input/output tokens.
- `PatternLearner` learned patterns but never persisted them.
- `LocalProvider` is marked ready when the router initializes it.

### Removed

- `conf` runtime dependency.
