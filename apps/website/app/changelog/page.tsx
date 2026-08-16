import Link from 'next/link'

const RELEASES = [
  {
    version: 'v0.13.0',
    date: '2026-08-16',
    tag: 'latest',
    highlights: [
      'Benchmark pack expanded 13 → 33 scenarios — twenty new real-world app scenarios (rn-14..rn-33) span e-commerce (multi-step checkout, debounced catalog search, order tracking), social & chat (optimistic-send threads, social feed), booking & payments (availability slots, card formatting, live tracking), health & fitness (activity rings, interval timer), media (player with seek bar, video detail), profile & onboarding, security (biometric gate with PIN fallback), productivity, subscriptions, travel & weather, and settings — each with a scenario spec and a full human reference solution that typechecks, feeding the LoRA fine-tuning dataset',
      'Every new reference follows the proven quality bar — useCallback + try/catch fetch pattern, design-token colors, KeyboardAvoidingView on input screens, typed states, and accessibility labels; all 20 compile clean under tsc, and the rubric scores the pack at 75% average adherence (up from a raw 59% before the pass)',
      'Quality tier now live-scored across the full 33-scenario pack — the 7B scored **97% composite, 114% of the 86% human reference**, perfect on 29 of 32 scored scenarios including **every one of the 20 new real-world scenarios at 100%**. Published on /benchmarks with the regenerated leaderboard (BENCHMARK_RESULTS.md, 33 scenarios × 3 models); the honest caveat: rn-01 login dipped to 59% this pass (typecheck + lint failed — model variance; it scored 78% last release). fast (1.5B) and balanced (3B) keep their 13-scenario rows; the new pack is 7B-only until those passes rerun',
      'Dependency-removal scenarios are now deterministic — the removal seam applies `removedDependencies` to the fixtures (package.json + Podfile/gradle/manifest traces, pbxproj + Info.plist for scoped SDKs) and emits the changed files. Three removal scenarios (rn-11 appcenter, rn-34 @sentry/react-native, rn-35 @react-native-firebase) score **99% composite (adherence 100%, guardrails 98%)** in the baseline gate instead of n/a — scoped packages derive identity tokens from their scope (sentry, firebase) and multi-line manifest elements are dropped whole; the leaderboard gains a `baseline` column and the CI gate now covers all nine scenarios. The model seam routes removals through a remove-dependency intent with the fixture files in the prompt, so the next `--model local` pass scores them in the model leaderboard columns too',
      'Nightly leaderboard refresh — CI re-scored the fast (1.5B) pass overnight and the committed leaderboard moved: overall composite **79%** (was 68%), guardrails **94%**, relative-to-human **90%** of the 89% human reference, with rn-04/05/06/08 now at 100% correctness. rn-01 stays the honest dip (78% → 59% this pass, typecheck + lint — model variance) and rn-07/rn-12 correctness scored 0 this pass; /benchmarks was regenerated from the committed results, never edited by hand',
      '`vc score` — the **Vectalon Engineering Health Score**: one 0-100 number an engineering manager immediately understands, aggregated from eight deterministic dimensions (Architecture, Dependencies, Build Health, Testing, Performance, Security, Accessibility, RN Upgrade Risk), each scored by a committed scanner consuming the shared Project Intelligence model. Shows the overall + per-dimension bars, the delta vs the previous run ("↓ 8 points this week", from `docs/vectalon/score/history.json`), the newly-arrived problems, and P0/P1/P2 recommended actions (error → P0, warning → P1, info → P2). Offline by default, zero model calls, and a dimension whose scanner cannot run is skipped with the overall renormalized — the score never fails',
      '`vc init` is now the **15-minute proof of value**: the commercial experience is one command. It scans the project, seeds the knowledge base, and configures the model router silently underneath — no LLM configuration is ever asked (local auto-select for your RAM, WASM/remote with fallback) — then ends with the proof-of-value window: the scan summary (files, components, screens, native modules, dependencies, navigation stacks, tests, architecture risks), the **Vectalon Health Score**, and the **Top 5 problems** with P0/P1/P2 severity dots. Zero model calls; the run seeds the intel + score-history caches so the next `vc score` is instant with a delta baseline',
      '`vc mode` — the **deployment-mode surface (Cloud / Private / Air-gapped)**: the local/self-hosted AI differentiator. Three explicit modes map the ModelRouter\'s providers (local, WASM, remote with fallback + circuit breaker) onto a privacy ladder: **Cloud** (hosted models — source goes to the provider you choose), **Private** (company-controlled Ollama/vLLM — nothing leaves your network), **Air-gapped** (local GGUF/WASM — nothing leaves the machine). Modes are **enforced, not labeled**: `vc init --mode private --model openai` is refused with the allowed set, `vc mode --set <mode>` refuses an outside provider, and `vc mode`/`--json` verify the configured provider against the declared mode with its dataflow line. The deterministic agents need no model at all, so the entire control plane works fully air-gapped — the answer for companies that cannot install a generic AI tool',
      '`vc demo` + the **/demo page** — the feature workflow as the **flagship hero demonstration**: "Build a Login feature." → Requirement → Architecture decision → Affected files → Implementation plan → Code → Tests → Review → Build verification → PR, plus the **self-healing loop** (build failed → diagnose → modify → rebuild → verify) that runs a failed gate back through implementation until it passes. `vc demo` is deterministic and offline — it shows a real prior workflow run when one exists under `docs/vectalon/feature-development/`, and the /demo page renders that same story with real artifacts (a completed 13/13 login-screen run: PRD, ADR, tests, implementation, verification). The workflow itself was already the most impressive thing in the repo — now it\'s the hero',
    ],
  },
  {
    version: 'v0.12.0',
    date: '2026-08-15',
    tag: 'latest',
    highlights: [
      '`vectalon render` now renders whole apps — `vectalon render --entry App.tsx` on a real Expo app previously died on the first bare import the sandbox could not resolve (`expo-status-bar`, since the sandbox denies network and has no node_modules). The render harness now aliases the curated Expo/navigation set (expo-status-bar, react-native-safe-area-context, @react-navigation/native, @react-navigation/native-stack) to built-in headless stubs — StatusBar + no-op setters, SafeAreaProvider passthrough, NavigationContainer passthrough, and a native-stack navigator whose screens render their components — and follows the entry\'s relative import graph like Metro (extensionless + index.* resolution), so rendering the demo\'s 19-screen App.tsx compiles 36 files and prints the full screen tree with zero model calls',
      'Demo app cart is now a real end-to-end flow — `useCart` is a context-backed shared store (CartProvider mounted at the app root) so adding in the catalog appears in the cart, checkout places the order through the orders service, and the shared cart clears; a new integration test drives the real navigator from onboarding through order confirmation',
    ],
  },
  {
    version: 'v0.11.0',
    date: '2026-08-15',
    highlights: [
      'Archive & Share — four new deterministic agents (Roadmap 101-104), every one report-driven and free: `vectalon archive` (build or ingest an IPA/APK/AAB, SHA-256 checksum, typed BuildManifest with git/flavor/environment provenance under .vectalon/builds/ — with zero-config flavor detection from Gradle productFlavors, Xcode schemes, and eas.json), `vectalon distribute` (TestFlight, Play Store, SaaS, and portal targets as dry-run-first plans that never store credentials — delegates to fastlane/EAS/Expo or direct API env vars), `vectalon share` (an ephemeral install page with download link, optional tunnel, QR code, and auto-shutdown via --expires — free tier), and `vectalon portal` (a self-contained static install portal with per-build detail pages and embedded builds.json, deployable to static hosting, Vercel, or Netlify)',
      'Archive & Share is wired through everything — six new MCP tools under `vectalon serve` (archive_build, list_builds, detect_flavors, distribute_build, share_build_locally, generate_portal), four new VS Code command-palette entries (vectalon.archiveBuild, distributeBuild, shareBuild, generatePortal), and `vectalon ci --with-archive` now emits a build → archive → SaaS-distribute job (gated on VECTALON_API_KEY, uploading .vectalon/builds/ as an artifact) into GitHub Actions and EAS workflows',
      'The agents catalog is now **44 commands across five phases** — Phase 12 (Archive & Share, items 101-104) is live on /agents with per-command docs, real verdicts, and deep links to the /reports documents; every Archive & Share command writes a markdown + JSON report like the other 40',
      'Demo video regenerated end-to-end — the website demo now runs against a real 19-screen Expo 53 / React Native 0.79 app (auth flow, catalog with cart and checkout, orders, profile, security with 2FA and sessions, billing, activity, support — each screen with its own hook, service, and test, 32/32 green). The 85-second recording walks the real CLI through init, the arch module graph, security review, the captured feature paper trail, the benchmark, and archive — shot on the same codebase visitors can clone',
      'Site motion layer — scroll-triggered reveals replace the invisible below-fold entrance choreography on /agents, /reports, and the homepage (no-JS-safe, reduced-motion-safe, watchdog-safe), FAQ answers rise in when opened, and the copy buttons pop on success; plus a token cleanup that replaced 26 raw hex colors in terminal surfaces with terminal-scoped design tokens',
    ],
  },
  {
    version: 'v0.10.0',
    date: '2026-08-15',
    highlights: [
      'Carbon report windows everywhere — every one of the 40 agent verdicts now prints as a box-drawing terminal window with traffic-light dots, a colored verdict chip, and a wrapped bordered body: truecolor fills on iTerm/WezTerm/Ghostty/Kitty/Alacritty/JetBrains, standard ANSI elsewhere, and zero escape codes under NO_COLOR. The docs man page and report surfaces on this site share the same aesthetic',
      'Benchmark correctness is now scored for real — `vectalon bench --live --install` was dead on arrival (fixtures pinned react 18.3.1 against react-native 0.74.0’s 18.2.0 peer, and typescript 5.5.0 doesn’t exist on npm — every temp install failed, so jest/tsc/eslint never ran against real deps). The fixture template is now a real checkable RN project, the deterministic scaffold generates a unit test per feature, and the live model pass re-run jumped the overall composite from 28% to **68%** and relative-to-human from 30% to **76%** — with tests passing on 12 of 13 scenarios and rn-03 + rn-09 at 100% correctness',
      'Benchmark suite expanded — the /benchmarks page now presents one harness, four benchmarks (axes, model leaderboard, suite breakdown, relative-to-human, CI regression gate) across 13 scenarios; two new scenarios (rn-12 notifications, rn-13 account deletion) extend the every-PR gate to six at a 100% floor',
      'Website report showcase — the agents catalog deep-links every card to its live report on /reports, and the docs page documents the three local report-viewing paths (terminal verdict, markdown in the repo, dashboard HTML) — mirrored in CLI_REFERENCE.md and the package README',
      'Fixed: product and mobile dropdowns realigned flush to their triggers, and the mobile menu no longer sticks open on touch devices (outside-close now listens to pointerdown, which fires on touch before a scroll cancels mouse events)',
    ],
  },
  {
    version: 'v0.9.0',
    date: '2026-08-15',
    highlights: [
      'Phase 11 — Platform & GitHub Intelligence (Roadmap 090-100): eleven new deterministic agents, every one free and report-driven — `vectalon gh-pr` (merge-readiness triage on every open PR: age, draft state, size, review decision, CI rollup, mergeability), `vectalon gh-issue` (the open-issue backlog as a triage queue: staleness, unassigned gaps, label hygiene), `vectalon gh-ci` (workflow reliability: flaky-job detection, failure rates, slow-CI duration outliers), `vectalon gh-sec` (security posture: dependabot alerts, secret scanning, branch protection), `vectalon monitor` (telemetry folded into one executive view — crash classes, instrumentation findings, telemetry events, the dashboard verdict), `vectalon evals` (golden eval cases scored deterministically with a regression comparison), `vectalon search` (sub-second line-pinned project search, density-ranked), `vectalon incident` (a crash log to an incident brief: root cause, hot files, release risk, next steps), `vectalon train` (read-only release-train dry-run across every workspace repo), `vectalon cost` (auditable spend estimates — LoRA GPU-hours, eval tokens, dataset GB — with explicit rate assumptions), and `vectalon dx` (one 0-100 developer-experience score across twelve weighted axes). Each GitHub-family agent reads the live gh CLI when available or a `--file` export, and degrades to an explicit no-data verdict — never a guess',
      'The deterministic fleet is now **40 agents across four roadmap phases** — verified end-to-end: the CLI smoke sweep runs all 40 against a real Expo/React Native project (40 passed, 0 failed), every agent writes its report to `docs/vectalon/<cmd>/`, and the website agents catalog lists all 40 with their verdicts and reports',
    ],
  },
  {
    version: 'v0.8.0',
    date: '2026-08-15',
    highlights: [
      'Phase 10 — Enterprise Intelligence (Roadmap 080-089): ten new deterministic agents, every one free and report-driven — `vectalon figma` (design↔code drift: colors with no token match, components with no source, fonts never used), `vectalon sentry` (crash classes ranked by volume + user impact with a root-cause verdict per class and release-regression detection), `vectalon observability` (instrumentation coverage + slow traces/spans from telemetry), `vectalon governance` (license, security policy, CODEOWNERS, PR template, lockfile/SBOM, Dependabot, CI evidence checklist), `vectalon audit` (org-wide audit-trail validation: required fields, sequence gaps, secret hygiene), `vectalon repos` (multi-repo manifest verification — reachability, git checkout, memory store), `vectalon release-predict` (deterministic 0-100 release-risk score from read-only git history), `vectalon play-store` (deep Play checks: manifest permissions → data-safety, exported components, backup rules, SDK levels, signing, measured listing assets), `vectalon dataset` (fine-tuning data validation: schema, duplicates, label imbalance, PII leakage), and `vectalon lora` (training prerequisites with a VRAM estimate)',
      'Engineering Dashboard v2 — `vectalon dashboard` now regenerates all 13 fast agent reports in one pass (`--run`), keeps them fresh on a schedule (`--cron`, default 300s), and renders a self-contained HTML dashboard with per-agent drill-down — click any card for the full findings list with severity filters, full-text search, and links to each agent’s report',
    ],
  },
  {
    version: 'v0.7.0',
    date: '2026-08-14',
    highlights: [
      'Phase 9 — Release Engineering (Roadmap 071-079) plus the Autonomous Bug Fix Agent (070): `vectalon crash` (iOS/Android/JS crash logs → root-cause bucket with the standard fix), `vectalon arch-score` (module-graph score 0-100 across cycles, layering, coupling, cohesion, testability, depth), `vectalon cicd` (workflow anti-patterns — unpinned actions, missing concurrency/timeouts, inline secrets, deploys without tests), `vectalon app-store` (version consistency across Info.plist/build.gradle/package.json, icons, privacy manifest, permissions), `vectalon soc2` (repository evidence against the five trust-service criteria with a score), `vectalon tokens` (design-token drift — orphans, hardcoded values, duplicates), `vectalon team-stats` (cadence, author distribution, bus factor from one read-only git log), `vectalon perms` (agent/MCP config audit — auto-approved grants, local-exec servers, credentials), `vectalon dashboard` (every agent report aggregated into one executive view with an HTML dashboard), and `vectalon bug-fix` (proposes fixes for deterministic defects and executes the provably-safe ones, with `--apply` guarded by a dirty-tree check)',
    ],
  },
  {
    version: 'v0.6.0',
    date: '2026-08-14',
    highlights: [
      'Phase 8 — Autonomous Engineering (Roadmap 061-069): `vectalon review` (git diff reviewed against the project’s own derived coding standards), `vectalon arch` (circular deps, layering violations, god modules, coupling metrics), `vectalon sec` (hardcoded secrets — redacted in reports, unsafe patterns, best-effort npm audit advisories), `vectalon build-fix` (Metro/Gradle/Xcode failures → root cause + standard fix), `vectalon test-repair` (Jest/Detox/Maestro failures → root cause + standard fix), `vectalon refactor` (dead code, duplication, modernization, type smells, complexity), `vectalon deps` (RN ecosystem pairing, duplicate versions, vulnerable dependencies), `vectalon a11y` (unlabeled images, missing roles, 44pt touch targets), and `vectalon release-ready` (can-we-ship checklist against read-only git)',
      'Static performance scan — `vectalon perf`: render-phase setState, memo-defeating props, heavy startup imports, and legacy bridge traffic in one deterministic pass',
      'Team Brain — `vectalon team`: glossary, coding standards, expertise map, ADR index, PR knowledge, and onboarding brief seeded into the knowledge base, with semantic search across projects and an hourly refresh under serve (Team tier)',
    ],
  },
  {
    version: 'v0.5.0',
    date: '2026-08-13',
    highlights: [
      'Project Diagnostics (Roadmap 011-015) — the new vectalon diagnostics command validates the build/toolchain surface in one deterministic pass with a suggested fix for every finding: Metro config (shape, alias targets, watchFolders in monorepos, cache advice), Hermes compatibility against a known-issue database (hermesEnabled/newArchEnabled states, New-Arch-without-Hermes, legacy RN), Android/Gradle project checks plus a build-log parser that classifies the top RN build errors (SDK, AGP, dependency resolution, AAPT, NDK, Java, network, OOM) and Xcode/Podfile checks plus a log parser for CocoaPods, signing, linker, plist, and Xcode-version failures, and dependency conflict detection against an RN ecosystem matrix with duplicate versions across monorepo members',
      'Code generation (Roadmap 016-020) — the new vectalon generate command writes deterministic templates into the project (or previews them with --dry-run): components (functional TS + StyleSheet), screens (React Navigation wired), tests (Jest RTL or Detox), native modules (iOS ObjC++ + Android Kotlin scaffolds via --api rn-cli|expo from a JSON spec), and API clients (typed service class + apiBase.ts with ApiError generated from an OpenAPI spec — path params, request bodies, response types, error handling)',
    ],
  },
  {
    version: 'v0.4.0',
    date: '2026-08-13',
    highlights: [
      'Project Intelligence Core (Roadmap 001-010) — the new vectalon intel command runs one deterministic pass producing the versioned project manifest + validation, workspace/monorepo discovery (pnpm, yarn, npm, turbo, lerna, and now Nx), a file-to-file dependency graph with circular-import cycle detection, AST parse-rate statistics, an incremental repository index (content fingerprints, re-index only changed files), component + navigation graphs (navigators, Expo Router routes, deep-link map), a native module registry (Podfile pods, podspecs, Gradle includes, TurboModule specs), and ranked knowledge retrieval over hash-embedded chunked source with a sub-second benchmark',
      'Repository-wide scans — when the target is a workspace root, every member package is indexed too; reports land in docs/vectalon/intel/ (gitignored); --json, --graph deps|components|navigation|native|manifest, --search, and --bench',
    ],
  },
  {
    version: 'v0.3.0',
    date: '2026-08-13',
    highlights: [
      'Post-release smoke verification — vectalon smoke runs every CLI command against the project (Expo or bare RN CLI) in dev mode by default so all tier-gated features execute for real, captures each command\'s full output (ANSI-stripped for clean reports) into report.json / report.log / an HTML dashboard, and reports pass/warn/skip/fail with an exit code — generated release workflows now include a verify job that blocks submission on any failure',
      'CLI shortcut vc — the package installs vc as a third bin name (vectalon, vc, rn-vectalon), so clients can run vc status or npx vc smoke --full instead of typing npx vectalon every time',
      'Fixed: selftest diagnostics-support was environment-dependent — it now asserts the sandbox-captured error is present in the support bundle instead of demanding an exact queue count',
    ],
  },
  {
    version: 'v0.2.0',
    date: '2026-08-13',
    highlights: [
      'Impact regression flows — changed files map to affected screens (AST-driven, no model calls), and the test phase writes .maestro/<slug>-impact.yaml regression flows for every screen with a deterministic route (deep link or initial route), with screenshots attached to the PR',
      'Accessibility variants — screens covered by accessibility criteria get a second regression flow that walks the accessibility tree with explicit text selectors (the labels VoiceOver/TalkBack announce) and a namespaced screenshot',
      'Uncovered-screen reporting — screens with no deterministic route are flagged instead of silently dropped: the verification phase names them in the E2E block, and the close phase opens coverage-labeled follow-up tasks (deduplicated against open tasks via PM findTasks)',
      'Coverage dashboard — docs/vectalon/coverage/coverage-gaps.md records every E2E and accessibility gap per feature run, and the new vectalon coverage command renders a per-screen summary with open follow-up links (--json, --limit)',
    ],
  },
  {
    version: 'v0.1.31',
    date: '2026-08-11',
    highlights: [
      'Telemetry ingestion completed — vectalon telemetry no longer claims "Telemetry ingested" when nothing was ingested: honest outcomes, exit 1 for scripts/CI on an empty run, and the interactive menu guides you with Specify a path / Generate sample exports / Supported formats',
      'vectalon telemetry --fixtures — writes realistic Sentry crash, Sentry transaction, Crashlytics report, and Firebase analytics exports and ingests them on the spot, running the full crash → incident → KPI analysis end-to-end',
      '--formats and --format — a printable accepted-formats guide and per-run format forcing for unusual exports; the ingest_telemetry MCP tool supports it too',
      'Fixed: whole-document JSON exports (pretty-printed Sentry events[] arrays) were misdetected as JSONL and silently parsed to 0 events — now parsed correctly before the JSONL fallback',
    ],
  },
  {
    version: 'v0.1.30',
    date: '2026-08-11',
    highlights: [
      'Live model streaming — vectalon bench --model local shows the model generating in real time: a TTY-only token preview (character count + truncated text preview) ticks as each chunk decodes, auto-off for --json/pipes; onTextChunk is plumbed through ModelRequest → LocalProvider → runInference, and MCP/agent paths are unchanged',
      'Incremental benchmark reports — vectalon bench streams each scenario section to stdout the moment it finishes (composite, axes, correctness, relative-to-human) with suite headers switching live, then closes with the Overall block; --json stays pure and --output keeps the full grouped report',
      'llama.cpp noise eliminated — the load: control-looking token spam and the MaxListenersExceededWarning are gone: a shared log filter is plumbed into every node-llama-cpp entry point with a C-level logLevel: warn gate, exit listeners merged into one beforeExit drain, and the process listener cap raised to 64',
    ],
  },
  {
    version: 'v0.1.29',
    date: '2026-08-11',
    highlights: [
      'Bundle size visualizer — vectalon bundle prints ASCII bars for the top packages and --open renders a self-contained HTML dashboard: interactive treemap, per-package drill-down, budget violations, and replacement-suggestion cards (last publish, weekly downloads, GitHub stars)',
      'Actionable improvement suggestions — new vectalon suggestions command: severity-grouped list (title, current → latest), --json for CI, --limit, --apply <ref> (prints the exact npm install and runs it behind a confirmation gate), and --open dashboard; the interactive menu gains a View suggestions (N) entry',
      'MCP catalog health — catalog package names are validated against the npm registry (cache-backed, offline-safe): ecosystem enable fail-fasts with the corrected command, doctor gains a catalog-<id> check per enabled MCP, and sub-MCP failures collapse to one warning line instead of a wall of npm error E404 noise',
      'Staleness-aware refresh — the menu\'s Force refresh knowledge entry now shows how stale the knowledge base is',
      'Fixed: vectalon bench default results directory now resolves to the project cwd instead of the CLI\'s install location',
    ],
  },
  {
    version: 'v0.1.28',
    date: '2026-08-10',
    highlights: [
      'Structured workflow output — the terminal explains itself: [9/13] phase progress, a live command feed with ✓/✖ + exit code + duration, and parsed failure cards that point at the full report, the rotating log, and the resume command',
      'Doctor failure card — missing checks render as a numbered fix list with [auto]/[manual] tags and an auto-fix count (vectalon doctor --fix)',
      'run_agent results render as a structured markdown report with a tool-call table (✅ executed / ⚠️ skipped) and iteration counts',
      'Failed verification checks become project memory — distilled into L0→L3 error facts so future runs know the project\'s recurring failures',
    ],
  },
  {
    version: 'v0.1.27',
    date: '2026-08-10',
    highlights: [
      'L0→L3 agent memory distiller — agent sessions become raw memory, atomic facts, occurrence-weighted scenario lessons, and a stable project persona (stack, conventions, known issues), inlined into every model prompt',
      'Professional ecosystem UX — grouped catalog (MCP servers / Agent skills / Tools / Hooks) with ✓/— status marks, never-truncated IDs, and a single-item --info view',
    ],
  },
  {
    version: 'v0.1.26',
    date: '2026-08-10',
    highlights: [
      'run_agent loop hardened for small local models — forced final answer, per-run tool cap, read-only tool dedupe',
      'Fine-tune dataset feature removed — model/knowledge quality is Vectalon\'s job, not the customer\'s',
    ],
  },
  {
    version: 'v0.1.25',
    date: '2026-08-10',
    highlights: [
      'Doctor future vision — flavor detection, recommended-but-not-enabled section, numbered fix steps, --enable/--disable toggles',
      'Web intel pipeline — 8 sources incl. Hacker News, GitHub trending, Callstack; inlined into every model system prompt',
      'serve auto-refreshes intel + knowledge hourly; WASM provider gets intel enrichment too',
      'ANSI-aware word-wrapping table renderer (no more truncated hints)',
      'Benchmark UX — live per-scenario progress, shared inference engine, stderr noise filter',
    ],
  },
  {
    version: 'v0.1.24',
    date: '2026-08-10',
    highlights: [
      'rn-diff-purge upgrade diffs — native + JS/TS template changes, live and always current',
      'Current catalog — RN 0.82–0.86, Expo SDK 55–57; --to latest can never go stale',
      'Self-maintaining knowledge base — init seeds from repo scan, serve re-seeds hourly',
    ],
  },
  {
    version: 'v0.1.23',
    date: '2026-08-10',
    highlights: ['Scripted terminal demo recording (8 VHS tapes)', 'render --file comma-list fix'],
  },
  {
    version: 'v0.1.22',
    date: '2026-08-09',
    highlights: [
      'Compile-checked self-healing — every agent fix is typechecked before it lands',
      'Golden test harness + non-Expo CLI demo',
      'RN best-practices in generated code — Pressable, no leaked renders, borderCurve',
    ],
  },
]

export default function ChangelogPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <div className="mb-10">
        <h1 className="text-4xl font-bold text-slate-50">Changelog</h1>
        <p className="mt-3 text-slate-400">
          Every release of <span className="font-mono text-brand">@vectalon-dev/rn</span>.
          The model stays current with the ecosystem; these notes keep you current with the model.
        </p>
      </div>

      <div className="space-y-8">
        {RELEASES.map(r => (
          <div key={r.version} className="card">
            <div className="flex items-center gap-3">
              <h2 className="font-mono text-lg font-bold text-slate-50">{r.version}</h2>
              {r.tag && (
                <span className="rounded-full bg-brand/15 px-2.5 py-0.5 text-xs font-semibold text-brand">
                  {r.tag}
                </span>
              )}
              <span className="ml-auto text-sm text-slate-500">{r.date}</span>
            </div>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-slate-300">
              {r.highlights.map(h => (
                <li key={h} className="flex gap-2">
                  <span className="text-brand">▸</span>
                  {h}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-12 rounded-[3px] border border-ink-700 bg-ink-800 p-6 text-sm text-slate-400">
        The full changelog — including the pre-0.1.22 history — lives in the repository.
        <Link href="https://github.com/Vectalon/Vectalon/blob/main/packages/rn/CHANGELOG.md" target="_blank" className="ml-2 text-brand hover:underline">
          View on GitHub →
        </Link>
      </div>
    </div>
  )
}
