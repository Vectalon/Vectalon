/**
 * vectalon CLI — React Native adaptive AI harness
 * Business Source License 1.1 (BSL-1.1)
 */

import { Command } from 'commander'
import pc from 'picocolors'
import { initCommand } from './commands/init'
import { serveCommand } from './commands/serve'
import { featureCommand } from './commands/feature'
import { upgradeCommand } from './commands/upgrade'
import { pullCommand } from './commands/pull'
import { modelsCommand } from './commands/models'
import { policyCommand } from './commands/policy'
import { refreshCommand } from './commands/refresh'
import { suggestionsCommand } from './commands/suggestions'
import { bundleCommand } from './commands/bundle'
import { profileCommand } from './commands/profile'
import { sandboxCommand } from './commands/sandbox'
import { renderCommand } from './commands/render'
import { daemonCommand } from './commands/daemon'
import { statusCommand } from './commands/status'
import { telemetryCommand } from './commands/telemetry'
import { authCommand } from './commands/auth'
import { ciCommand } from './commands/ci'
import { visualCiCommand } from './commands/visualCi'
import { visualBaselineCommand } from './commands/visualBaseline'
import { ciIncidentCommand } from './commands/ciIncident'
import { releaseCommand } from './commands/release'
import { ecosystemCommand } from './commands/ecosystem'
import { listEcosystemItems } from '../ecosystem'
import { syncCommand } from './commands/sync'
import { teamPolicyCommand } from './commands/teamPolicy'
import { teamCommand } from './commands/team'
import { reviewCommand } from './commands/review'
import { archCommand } from './commands/arch'
import { secCommand } from './commands/sec'
import { buildFixCommand, forcedKind } from './commands/buildFix'
import { testRepairCommand, forcedKind as forcedTestKind } from './commands/testRepair'
import { refactorCommand } from './commands/refactor'
import { benchCommand } from './commands/bench'
import { leaderboardCommand, type LeaderboardCommandOptions } from './commands/leaderboard'
import { impactCommand } from './commands/impact'
import { coverageCommand } from './commands/coverage'
import { intelCommand } from './commands/intel'
import { diagnosticsCommand } from './commands/diagnostics'
import { generateCommand } from './commands/generate'
import { perfCommand } from './commands/perf'
import { smokeCommand } from './commands/smoke'
import { doctorCommand } from './commands/doctor'
import { selftestCommand } from './commands/selftest'
import { supportCommand } from './commands/support'
import { logger } from './logger'
import { attachFileLogging } from './logfile'
import { installStderrNoiseFilter } from '../model/local/inference'
import pkg from '../../package.json'
import { dynamicImport } from '../utils/dynamicImport'
import { runCommand } from '../adapters/runCommand'
import { captureError, flushErrorQueue, writeDiagnosticsBundle } from '../diagnostics'
import { buildRefreshHint, countPersistedSuggestions } from './refreshHint'

export function createProgram(): Command {
  const program = new Command()

  program
    .name('vectalon')
    .description('The adaptive AI harness for React Native')
    .version(pkg.version)
    .option('--dev', 'Enable dev mode — bypass all tier/license checks')
    .option('--diagnostics', 'Write .vectalon/diagnostics-bundle.json (environment, last 5000 log lines, project state) — works on every command')
    .hook('preAction', (thisCommand) => {
      if (thisCommand.opts().dev) {
        process.env.VECTALON_DEV_MODE = '1'
        logger.info(pc.yellow('DEV MODE — all features unlocked'))
      }
    })

  program
    .command('init')
    .description('Initialize vectalon in your React Native project')
    .argument('[directory]', 'Project root directory')
    .option('--model <provider>', 'Default model provider (local|wasm|openai|anthropic|azure-openai|ollama|vllm|groq)')
    .option('--resume', 'Resume an interrupted init from its last completed phase')
    .option('--clean-restart', 'Roll back an interrupted init (restore originals) and start over')
    .option('--force', 'Re-initialize even when the project is already initialized')
    .action(initCommand)

  program
    .command('serve')
    .description('Start the vectalon MCP server for agent connections')
    .option('-p, --port <number>', 'HTTP server port', Number, 0)
    .option('--protocol <type>', 'Protocol type (mcp/stdio/sse/http)', 'mcp')
    .option('--model <provider>', 'Model provider (local|wasm|openai|anthropic|azure-openai|ollama|vllm|groq)')
    .option('--safe-mode', 'CI-safe mode: model generation returns stubs, file-writing and device-control tools are disabled')
    .action(serveCommand)

  program
    .command('feature [prompt]')
    .description('Run the feature-development SDLC workflow for a given prompt (or --ticket <key> from the PM adapter)')
    .option('--workflow <id>', 'Workflow to run', 'feature-development')
    .option('--resume <state-id>', 'Resume a previous workflow state')
    .option('--from <phase-id>', 'Start from a specific phase when resuming')
    .option('-o, --output <path>', 'Write workflow output to a file')
    .option('--json', 'Output as JSON')
    .option('--verbose', 'Show full phase output')
    .option('--dry-run', 'Simulate adapters without running real commands')
    .option('--model <provider>', 'Model provider (local|wasm|openai|anthropic|azure-openai|ollama|vllm|groq)')
    .option('--push', 'Allow git push and PR creation (default: local branch/commit only)')
    .option('--device', 'Run device/simulator build checks (iOS/Android) during verification')
    .option('--heal-interactive', 'Prompt before applying each self-healing code-review fix (accept/reject/retry)')
    .option('--heal-attempts <n>', 'Max self-healing review attempts (default 3, or per .vectalon/policy.json)', Number)
    .option('--heal-severity <level>', 'Lowest severity that triggers healing: error|warning|info (default error)', 'error')
    .option('--strict-verification', 'Gate on pre-existing project failures too (default: ignore failures that reference no workflow-touched file)')
    .option('--ticket <key>', 'Read a ticket from the PM adapter (Jira/GitHub/Monday) and run the workflow headlessly from its title + description')
    .action(featureCommand)

  program
    .command('upgrade [directory]')
    .description('Upgrade React Native / Expo with the copilot (impact analysis, codemods, verification)')
    .option('--to <version>', 'Target version — RN (0.76), Expo SDK (53), or latest (default: latest known stable)')
    .option('--dry-run', 'Preview the plan + impact without changing files (default)')
    .option('--apply', 'Execute safe codemods and dependency bumps (native patches still require review; --force applies those too)')
    .option('--force', 'Skip safety checks: apply review steps automatically, skip confirmation')
    .option('--diff', 'Fetch the official rn-diff-purge template diff (native + JS/TS changes to apply) for this upgrade and print a categorized summary — live from GitHub (requires network)')
    .option('--json', 'Print the plan/report as JSON')
    .option('--no-verify', 'Skip post-apply verification (doctor, typecheck, bundle budget gate)')
    .action(upgradeCommand)

  program
    .command('pull [preset]')
    .description('Download a local model preset (default: qwen2.5-coder-1.5b)')
    .action(pullCommand)

  program
    .command('models')
    .description('List available and downloaded local models')
    .action(modelsCommand)

  program
    .command('policy [directory]')
    .description('Manage project-specific guardrail policy')
    .option('--init', 'Create a default .vectalon/policy.json')
    .option('--check <file>', 'Run the policy against a source file')
    .action(policyCommand)

  program
    .command('refresh [directory]')
    .description('Refresh knowledge from web sources and generate improvement suggestions')
    .option('--force', 'Refresh even if the cache is still fresh')
    .action(refreshCommand)

  program
    .command('suggestions [directory]')
    .description('List improvement suggestions from the knowledge refresh (outdated dependencies) and act on them — apply the latest version or open the dashboard')
    .option('--json', 'Print the full suggestions store as JSON (CI/agents)')
    .option('--limit <n>', 'Cap the number of suggestions listed', Number)
    .option('--apply <id>', 'Apply one suggestion — npm install the latest version (asks for confirmation in a TTY)')
    .option('--yes', 'Apply without prompting (with --apply)')
    .option('--open', 'Write + open the HTML suggestions dashboard in the browser')
    .option('--out <dir>', 'Dashboard output directory (default .vectalon/suggestions)')
    .action(suggestionsCommand)

  program
    .command('bundle [directory]')
    .description('Analyze the Metro bundle and enforce performance budgets — ASCII top-package bars plus an interactive HTML treemap dashboard (--open)')
    .option('--platform <type>', 'Bundle platform (ios|android)', 'ios')
    .option('--static', 'Static on-disk checks only (skip the Metro build)')
    .option('--open', 'Open the HTML treemap dashboard in the browser after the run')
    .option('--no-html', 'Skip writing the HTML dashboard (and the npm signal fetches)')
    .option('--report <dir>', 'Dashboard output directory (default .vectalon/bundle)')
    .action(bundleCommand)

  program
    .command('profile [directory]')
    .description('Analyze Hermes .cpuprofile / heap snapshots — JS-thread blocking, retained objects, leak signals, baselines + regressions')
    .option('--profile <file>', 'Path to a Hermes .cpuprofile JSON file')
    .option('--heap <file>', 'Path to a Hermes .heapsnapshot JSON file')
    .option('--baseline <label>', 'Baseline label in the knowledge base', 'default')
    .option('--save-baseline', 'Persist this run as the baseline for future comparisons')
    .option('--threshold-ms <number>', 'JS-thread blocking threshold in ms (default 100)', Number, 100)
    .option('--json', 'Print the report as JSON instead of markdown')
    .action(profileCommand)

  program
    .command('sandbox')
    .description('Run a command in an isolated process with no ambient authority — scrubbed env, writes confined to the sandbox root, network denied by default, CPU/memory/time bounds')
    .argument('<command>', 'Command to run inside the sandbox')
    .argument('[args...]', 'Arguments for the command')
    .option('--root <dir>', 'Sandbox root — working directory + the only writable location (default: cwd)')
    .option('--timeout <ms>', 'Wall-clock timeout in ms (default 30000)', Number)
    .option('--cpu <seconds>', 'CPU time limit in seconds')
    .option('--memory <mb>', 'Virtual memory limit in MB', Number)
    .option('--network', 'Allow outbound network (default: denied where the backend supports it)')
    .option('--allow-env <names>', 'Comma-separated ambient env vars to keep')
    .option('--json', 'Print the result as JSON')
    .action((command, args, opts) => sandboxCommand(command, args, opts))

  program
    .command('render [directory]')
    .description('Compile + headless-render generated TS/TSX in the sandbox — console logs, render tree, runtime errors before the diff')
    .option('--entry <file>', 'Entry file to render (required), e.g. src/App.tsx')
    .option(
      '--file <file>',
      'Extra file to compile (repeatable / comma-separated)',
      (val: string, prev: string[] = []) => prev.concat(val.split(',').map(s => s.trim()).filter(Boolean)),
      []
    )
    .option('--timeout <ms>', 'Wall-clock timeout in ms (default 30000)', Number)
    .option('--memory <mb>', 'Virtual memory limit in MB', Number)
    .option('--json', 'Print the structured result as JSON')
    .action((directory, opts) => renderCommand(directory, opts))

  program
    .command('status')
    .description('One-line-each overview: daemon (pid/port/health), MCP server + tool count, model provider state, last refresh, license/trial days remaining, and .vectalon/ disk usage — the first thing to run in a support session')
    .action(statusCommand)

  program
    .command('daemon')
    .description('Live Metro/Hermes companion daemon — continuously watch bundle size, build errors, and JS thread health')
    .option('-p, --port <number>', 'Daemon HTTP port (default 0 = auto-assign)', Number, 0)
    .option('--metro-port <number>', 'Metro dev-server port (default 8081)', Number, 8081)
    .option('--stop', 'Stop a running daemon')
    .option('--status', 'Show daemon status')
    .option('--once', 'Run a single device-probe pass and exit')
    .option('--no-device-probe', 'Disable the Hermes JS-thread probe')
    .option('--wire-metro', 'Patch metro.config.js to use the generated reporter')
    .option('--telemetry-watch', 'Also watch telemetry exports (.vectalon/telemetry) — new crashes/analytics ingest as they land')
    .action(daemonCommand)

  program
    .command('auth')
    .description('Manage Vectalon license and trial')
    .option('--license <key>', 'Activate a license key')
    .option('--github', 'Authenticate with GitHub for trial')
    .option('--status', 'Show current authentication status')
    .option('--logout', 'Clear license and revert to free tier')
    .action(authCommand)

  program
    .command('telemetry [directory]')
    .description('Ingest runtime telemetry (Sentry / Crashlytics / traces / analytics) into the knowledge base and analyze it')
    .option('--path <dir>', 'Telemetry exports directory or file (default .vectalon/telemetry or telemetry/)')
    .option('--no-analyze', 'Ingest only; skip crash/incident/KPI analysis')
    .option('--fixtures', 'Write sample Sentry/Crashlytics/analytics exports into .vectalon/telemetry and ingest them — see the pipeline end-to-end')
    .option('--format <fmt>', 'Force a telemetry format instead of auto-detecting: sentry | crashlytics | performance | analytics')
    .option('--formats', 'Print the accepted formats guide and exit')
    .option('--watch', 'Keep watching the telemetry directory and ingest new exports as they land (Ctrl-C to stop)')
    .option('--interval <ms>', 'Watch poll interval in ms (default 10000)', Number)
    .action(async (directory, opts) => {
      const outcome = await telemetryCommand(directory, opts)
      // Nothing ingested is a failure for scripts/CI; the interactive menu
      // handles the empty case itself (path / fixtures / formats guidance).
      if (outcome.status === 'empty') process.exit(1)
    })

  program
    .command('ci [directory]')
    .description('Generate the project CI workflow (EAS Workflows for Expo; GitHub Actions / Azure Pipelines / GitLab CI / Bitbucket Pipelines for bare RN CLI, detected from the git remote)')
    .option('--provider <host>', 'Force a CI host instead of detecting from the git remote (github|azure|gitlab|bitbucket)')
    .option('--dry-run', 'Show what would be generated without writing files')
    .action(ciCommand)

  program
    .command('visual-ci [directory]')
    .description('PR-mode visual regression: capture affected screens, diff against the committed baselines (docs/vectalon/visual-baselines), post the report on the PR, and exit with a gating code')
    .option('--base <ref>', 'Ref whose baselines are used (default: GITHUB_BASE_REF or origin/main)')
    .option('--screens <list>', 'Comma-separated screen keys to check (default: derived from changed files)')
    .option('--changed <files>', 'Comma-separated changed files (default: git diff base...HEAD)')
    .option('--platform <type>', 'Device platform (ios|android)')
    .option('--attempts <n>', 'Capture attempts per screen (default 3)', Number)
    .option('--settle-ms <n>', 'Settle wait before each capture in ms (default 2500)', Number)
    .option('--verdict <policy>', 'Gating policy: strict|warn|report (default warn)')
    .option('--pr <number>', 'Post the report as a PR comment (upsert)', Number)
    .option('--push', 'Allow git push / PR comments')
    .option('--out <dir>', 'Run output directory (default .vectalon/visual-ci)')
    .option('--json', 'Print the machine-readable outcome as JSON')
    .option('--dry-run', 'Describe the plan without touching a device')
    .option('--incident', 'File a triaged incident into the knowledge base when the gate fails (regression only — infra failures are reported, not filed)')
    .action(visualCiCommand)

  program
    .command('ci-incident [directory]')
    .description('Self-healing CI gate: file a triaged incident (severity, cause bucket, rollback suggestion) for a failed CI gate into the knowledge base — every CI failure becomes something the team brain learns from')
    .option('--gate <name>', 'Gate that failed, e.g. visual-regression|quality|bundle-budget|bench-regression (default ci)')
    .option('--step <name>', 'Workflow step that failed')
    .option('--command <cmd>', 'The failing command')
    .option('--exit <code>', 'Exit code of the failing step', Number)
    .option('--output <text>', 'Failing output (truncated in the report)')
    .option('--commit <sha>', 'Failing commit sha (default: git HEAD)')
    .option('--branch <name>', 'Failing branch (default: git / CI env)')
    .option('--severity <level>', 'Override severity: sev1|sev2|sev3')
    .option('--telemetry <dir>', 'Ingest crash telemetry exports to make the triage data-driven')
    .option('--json', 'Print the incident as JSON')
    .option('--dry-run', 'Analyze + print without persisting')
    .action(ciIncidentCommand)

  program
    .command('visual-baseline [directory]')
    .description('Manage the committed visual baselines (docs/vectalon/visual-baselines): list, capture, update, prune, quarantine')
    .option('--list', 'List committed baselines')
    .option('--capture <key>', 'Add a baseline for a screen key')
    .option('--update <key>', 'Replace a baseline (clears quarantine)')
    .option('--from <path>', 'PNG source for --capture/--update')
    .option('--platform <type>', 'Platform for --capture (ios|android)')
    .option('--note <text>', 'Note for the baseline entry')
    .option('--tolerance <json>', 'Per-key diff tolerance overrides, e.g. {"driftThreshold":0.05}')
    .option('--quarantine <key>', 'Quarantine a baseline (reports but never gates)')
    .option('--reason <text>', 'Reason for --quarantine')
    .option('--unquarantine <key>', 'Clear a quarantine')
    .option('--prune', 'Remove baselines whose key matches no screen in the project')
    .option('--dry-run', 'Show what --prune would remove without removing')
    .option('--json', 'Print the result as JSON')
    .action(visualBaselineCommand)

  program
    .command('release [directory]')
    .description('Autonomous release & monitor pipeline: detect version bump, generate changelog, write the release workflow (E2E + store submission), and monitor the crash rate')
    .option('--version <v>', 'Current version (default: package.json version)')
    .option('--changelog', 'Print only the generated changelog and exit')
    .option('--submit', 'Write the release workflow (EAS for Expo, GitHub Actions for bare RN CLI)')
    .option('--monitor', 'Ingest telemetry and monitor the crash rate for spikes (z-score anomaly detection on the time series when crashes have timestamps)')
    .option('--telemetry <dir>', 'Telemetry exports directory for --monitor (default .vectalon/telemetry)')
    .option('--baseline <rate>', 'Baseline crash rate per 1k sessions for ratio spike detection (overrides z-score)')
    .option('--zscore <n>', 'Z-score threshold for anomaly detection (default 3.0 = baseline + 3σ)', Number)
    .option('--hours <n>', 'Monitoring window in hours (default 24)', Number)
    .option('--json', 'Print the release plan as JSON')
    .action(releaseCommand)

  program
    .command('ecosystem [directory]')
    .description('Browse and enable external MCP servers, skills, tools, and hooks for React Native / Expo projects')
    .option('--category <type>', 'Filter by category (mcp|skill|tool|hook)')
    .option('--flavor <type>', 'Filter by project flavor (expo|rn-cli)')
    .option('--enable <id>', 'Enable an ecosystem item and record it in .vectalon/ecosystem.json')
    .option('--force', 'Skip the npm-registry existence check when enabling an MCP item')
    .option('--disable <id>', 'Disable an enabled ecosystem item')
    .option('--info <id>', 'Show install command + capabilities for one item')
    .option('--export', 'Export enabled items as an MCP client config fragment')
    .option('--json', 'Print the export as JSON')
    .option('--expanded', 'Force the full catalog view (descriptions + commands) even when piped')
    .action(ecosystemCommand)

  program
    .command('sync [directory]')
    .description('Sync the team brain (.vectalon/knowledge) to a hosted git remote')
    .option('--push', 'Push the knowledge base to the remote')
    .option('--pull', 'Pull the knowledge base from the remote')
    .option('--init', 'Create .vectalon/sync.json (requires --remote)')
    .option('--remote <url>', 'Git remote URL for the hosted artifact store')
    .option('--branch <name>', 'Remote branch to sync to/from (default: main)')
    .option('--force', 'Override a disabled sync config')
    .action(syncCommand)

  program
    .command('team-policy [directory]')
    .description('Org-wide guardrail policy (Team brain v2): publish/pull the team policy + shared bundle budgets through the sync remote, so one policy change gates every project')
    .option('--push', 'Publish this project\'s policy + budgets as the org policy on the sync remote')
    .option('--pull', 'Fetch the org policy into .vectalon/team — effective immediately for policy checks, code review, and bundle budgets')
    .option('--check <file>', 'Run the effective (org + local) policy against a source file')
    .option('--show', 'Print the effective policy and budget settings')
    .option('--budget <json>', 'Set local budget overrides, e.g. {"largeLibBytes":65536}')
    .option('--remove', 'Stop following the org policy (delete the cached copy)')
    .option('--remote <url>', 'Git remote URL (default: .vectalon/sync.json)')
    .option('--branch <name>', 'Remote branch (default: .vectalon/sync.json)')
    .option('--force', 'Override a disabled sync config')
    .action(teamPolicyCommand)

  program
    .command('team [directory]')
    .description('Team Brain (Roadmap 041-049): project glossary, coding standards, expertise map, ADR/decision index, PR knowledge, and onboarding brief — seeded into the knowledge base and written to docs/vectalon/team/; --search queries the team knowledge base across projects')
    .option('--search <query>', 'Search the team knowledge base (semantic when embeddings configured, lexical otherwise) — the Phase 6 acceptance')
    .option('--project <name>', 'Scope --search to one registered project')
    .option('--team <name>', 'Scope --search to one team')
    .option('--type <type>', 'Scope --search to one artifact type')
    .option('--limit <n>', 'Search result cap (default 5)', Number)
    .option('--projects', 'List registered team projects')
    .option('--json', 'Print machine-readable output')
    .action(teamCommand)

  program
    .command('review [directory]')
    .description('PR Review Agent (Roadmap 061): reviews the diff (uncommitted by default, or --base <ref>) with deterministic rules + the team-brain coding standards, plus an optional LLM pass — report to docs/vectalon/review/')
    .option('--base <ref>', 'Git ref the diff is taken against (default: uncommitted changes)')
    .option('--model <provider>', 'Model provider override for the LLM pass')
    .option('--json', 'Print machine-readable output')
    .action(reviewCommand)

  program
    .command('arch [directory]')
    .description('Architecture Review Agent (Roadmap 062): one deterministic pass over the module graph — circular dependencies, layering violations (shared code importing feature code), god modules, module over-coupling, wide fan-in, orphans, and deep nesting — with a verdict and severity-ranked recommendations; report to docs/vectalon/arch/')
    .option('--src <dir>', 'Source directory to analyze (default src)')
    .option('--max-fanout <n>', 'Internal dependencies that make a file a god module (default 12)', Number)
    .option('--max-module-fanout <n>', 'Module fan-out that flags over-coupling (default 8)', Number)
    .option('--max-depth <n>', 'Directory levels under src that flag deep nesting (default 5)', Number)
    .option('--json', 'Print machine-readable output')
    .action(archCommand)

  program
    .command('sec [directory]')
    .description('Security Review Agent (Roadmap 063): one deterministic pass — hardcoded secrets (redacted), unsafe code patterns (eval, shell injection, disabled TLS, cleartext HTTP, SQL concatenation, weak crypto), and best-effort npm audit dependency advisories — with a verdict and severity-ranked recommendations; report to docs/vectalon/sec/')
    .option('--no-audit', 'Skip the npm audit dependency pass (fast, offline)')
    .option('--json', 'Print machine-readable output')
    .action(secCommand)

  program
    .command('build-fix [directory]')
    .description('Build Fix Agent (Roadmap 064): diagnose a failing Metro, Gradle, or Xcode build from its log — the kind is auto-detected (or forced with --metro/--gradle/--xcode), the root cause is classified with the standard fix, and corroborating failures are listed as a fix plan; report to docs/vectalon/build-fix/')
    .option('--log <path>', 'Build log file to diagnose (Metro bundler output, Gradle, or Xcode)')
    .option('--metro', 'Force the log kind to Metro bundler output')
    .option('--gradle', 'Force the log kind to Gradle output')
    .option('--xcode', 'Force the log kind to Xcode output')
    .option('--json', 'Print machine-readable output')
    .action((directory: string, options: { metro?: boolean; gradle?: boolean; xcode?: boolean }) =>
      buildFixCommand(directory, { ...options, kind: forcedKind(options) }))

  program
    .command('test-repair [directory]')
    .description('Test Repair Agent (Roadmap 065): diagnose a failing Jest, Detox, or Maestro test run from its output log — the kind is auto-detected (or forced with --jest/--detox/--maestro), the root cause is classified with the standard fix, and corroborating failures are listed as a fix plan; report to docs/vectalon/test-repair/')
    .option('--log <path>', 'Test output log to diagnose (Jest, Detox, or Maestro)')
    .option('--jest', 'Force the log kind to Jest output')
    .option('--detox', 'Force the log kind to Detox output')
    .option('--maestro', 'Force the log kind to Maestro output')
    .option('--json', 'Print machine-readable output')
    .action((directory: string, options: { jest?: boolean; detox?: boolean; maestro?: boolean }) =>
      testRepairCommand(directory, { ...options, kind: forcedTestKind(options) }))

  program
    .command('refactor [directory]')
    .description('Refactoring Agent (Roadmap 066): one deterministic pass over the project source files that proposes concrete, safe refactors — dead code (unused imports/variables, unreachable statements), duplication (repeated blocks and strings), modernization (optional chaining, includes, strict equality, const/let), type smells (any, ts-ignore), inline-style debt, console noise, and complexity — line-pinned with suggestions; report to docs/vectalon/refactor/')
    .option('--json', 'Print machine-readable output')
    .action(refactorCommand)

  program
    .command('doctor [directory]')
    .description('Diagnose ecosystem items, native toolchain, leaderboard readiness, model access + web intel — with numbered fix steps and quick enable/disable')
    .option('--json', 'Print the report as JSON')
    .option('--fix', 'Auto-install missing ecosystem items and toolchain components, then re-check')
    .option('--selftest', 'Verify the doctor\'s own probes work, then exit')
    .option('--enable <id>', 'Enable a single ecosystem item and exit (writes .vectalon/ecosystem.json)')
    .option('--disable <id>', 'Disable a single ecosystem item and exit')
    .option('--enable-recommended', 'Enable every ecosystem item recommended for this project\'s flavor, then exit')
    .action(doctorCommand)

  program
    .command('support [directory]')
    .description('Collect a structured support bundle — sanitized logs, error queue, crash report, package.json, and .vectalon state — and upload it to the Vectalon support pipeline (you get a token to paste into a ticket)')
    .option('--upload', 'Upload the sanitized bundle and print the support token')
    .option('--out <path>', 'Write the bundle to a custom path (default .vectalon/support-bundle.json)')
    .action(supportCommand)

  program
    .command('bench')
    .description('Run the RN coding tests benchmark (deterministic baseline or real-model leaderboard)')
    .option('--model <provider>', 'Model provider (local|wasm|openai|anthropic|azure-openai|ollama|vllm|groq) — run the real-model leaderboard pass')
    .option('--suite <id>', 'Only run scenarios in the given suite (core-ui, data-flow, forms-security, navigation, a11y, perf, refactor)')
    .option('--live', 'Run real tests/typecheck/lint for correctness scoring (slow)')
    .option('--install', 'Run npm install in each temp project before live correctness checks')
    .option('--json', 'Print the summary as JSON instead of markdown')
    .option('-o, --output <path>', 'Write the report to a file instead of stdout')
    .option('--scenarios <dir>', 'Override the scenarios directory (default: bench/scenarios)')
    .option('--references <dir>', 'Override the human reference-solutions directory (default: bench/references)')
    .option('--baseline <file>', 'Compare the deterministic run against a stored baseline JSON (CI regression gate; the gate runs only when this flag is passed)')
    .option('--tolerance <fraction>', 'Max allowed axis drop before a regression is flagged (default 0.01)')
    .action(benchCommand)

  program
    .command('impact [directory]')
    .description('Compute the cross-package blast radius of changed files in a monorepo (screens, navigation, E2E flows), write the report doc to docs/vectalon/impact/, and optionally post it as a PR comment')
    .option('--changed <files>', 'Comma-separated changed file paths or screen/component names relative to the workspace root')
    .option('--pr <number>', 'Post the impact report as a comment on the given pull request', Number)
    .option('--push', 'Allow git push / PR comments')
    .option('--json', 'Print the impact report as JSON')
    .option('--dry-run', 'Simulate the PR comment without posting (does not write the doc)')
    .option('--out <dir>', 'Write the impact doc to this directory instead of docs/vectalon/impact')
    .action(impactCommand)

  program
    .command('coverage [directory]')
    .description('Render the committed coverage dashboard (docs/vectalon/coverage/coverage-gaps.md) — per-screen E2E and accessibility gap summary with open follow-up task links')
    .option('--json', 'Print the per-screen summary as JSON (CI/agents)')
    .option('--limit <n>', 'Cap the number of screens listed', Number)
    .action(coverageCommand)

  program
    .command('intel [directory]')
    .description('Project Intelligence Core — canonical manifest, workspace discovery, dependency graph (with cycles), AST parse stats, incremental index, component + navigation graphs, native module registry, and sub-second knowledge retrieval in one deterministic pass')
    .option('--json', 'Print the full report as JSON')
    .option('--graph <name>', 'Export one graph as JSON: deps, components, navigation, native, manifest')
    .option('--search <query>', 'Run one retrieval query over the indexed project and show ranked results')
    .option('--bench', 'Run the sub-second retrieval benchmark (010 acceptance)')
    .action(intelCommand)

  program
    .command('diagnostics [directory]')
    .description('Project Diagnostics — Metro config, Hermes compatibility, Android (Gradle) + iOS (Xcode) build analysis, and dependency conflict detection in one deterministic pass, with suggested fixes for every finding')
    .option('--json', 'Print the full report as JSON')
    .option('--gradle-log <path>', 'Analyze a Gradle build log: classify the root cause of the failure and suggest the standard fix (013)')
    .option('--xcode-log <path>', 'Analyze an Xcode build log: classify the root cause of the failure and suggest the standard fix (014)')
    .action(diagnosticsCommand)

  program
    .command('perf [directory]')
    .description('Static performance scan (Roadmap 021-023, 027, 029) — re-render hazards, startup hot paths, and legacy bridge traffic in one deterministic pass, with severity-ranked recommendations; complements the runtime profile command')
    .option('--json', 'Print the full report as JSON')
    .action(perfCommand)

  program
    .command('generate <type> [name]')
    .description('Code generation — component, screen, test, native-module, or api (typed services with error handling + caching from an OpenAPI spec)')
    .option('--dry-run', 'Preview the generated files without writing them')
    .option('--no-typescript', 'Generate plain JavaScript instead of TypeScript (component/screen)')
    .option('--no-styles', 'Skip the StyleSheet block (component/screen)')
    .option('--navigation', 'Include navigation hooks (component)')
    .option('--framework <jest|detox>', 'Test framework (test)', 'jest')
    .option('--api <rn-cli|expo>', 'Native module API surface (native-module)', 'rn-cli')
    .option('--spec <path|json>', 'Native module or OpenAPI spec (native-module/api)')
    .action(generateCommand)

  program
    .command('smoke [directory]')
    .description('Post-release verification: run every CLI command against the project, capture the full output of each, and report pass/warn/skip/fail — exit non-zero on any failure (runs after a release to verify everything is in order)')
    .option('--list', 'List all checks and exit')
    .option('--only <ids>', 'Run only these check ids (comma-separated)')
    .option('--skip <ids>', 'Skip these check ids (comma-separated)')
    .option('--full', 'Include slow / model-heavy checks (feature, bench, selftest, pull)')
    .option('--no-dev', 'Disable dev mode — tier-gated checks (bundle, sandbox, ci, visual-ci, …) report as skips instead of running for real (dev mode is the default)')
    .option('--json', 'Print the JSON report to stdout instead of files')
    .option('--no-html', 'Skip writing the HTML dashboard')
    .option('--open', 'Open the HTML dashboard in the browser after the run')
    .option('--no-open', 'Do not auto-open the dashboard (default when not a TTY)')
    .option('--out <dir>', 'Report output directory (default .vectalon/smoke)')
    .option('--timeout <ms>', 'Per-check timeout in ms (default 60000)', Number)
    .action(smokeCommand)

  program
    .command('selftest [directory]')
    .description('Test every feature of the harness in a sandbox — visible report + full activity trace of every step, command, and file modification')
    .option('--category <cat>', 'Run only one category (cli, sdlc, guardrails, knowledge, harness, model, mcp, workflows, ecosystem, bench, adapters, memory, upgrade, perf, sandbox, render, diagnostics)')
    .option('--only <id>', 'Run a single check by id')
    .option('--model <provider>', 'Force the model provider for the real-inference check (local|wasm|openai|anthropic|azure-openai|ollama|vllm|groq)')
    .option('--require-model', 'Fail (instead of warn) when no real model is available for the inference check')
    .option('--list', 'List all checks and exit')
    .option('--json', 'Print the JSON report to stdout instead of files')
    .option('--no-html', 'Skip writing the HTML dashboard')
    .option('--open', 'Open the HTML dashboard in the browser after the run')
    .option('--no-open', 'Do not auto-open the dashboard (default when not a TTY)')
    .option('--out <dir>', 'Report output directory (default .vectalon/selftest)')
    .option('--verbose', 'Echo every recorded activity step to the terminal after the run')
    .action(selftestCommand)

  program
    .command('leaderboard [directory]')
    .description('Merge per-model benchmark results into a timestamped BENCHMARK_RESULTS.md leaderboard')
    .option('--out <path>', 'Output file (default BENCHMARK_RESULTS.md)')
    .option('--json', 'Print the merged runs as JSON instead of markdown')
    .option('--timestamp <iso>', 'Override the leaderboard timestamp (default now)')
    .option('--pr-comment', 'Print a compact PR comment (with upsert marker) instead of writing markdown')
    // Commander passes (directory, options); merge the positional into dir so
    // both `leaderboard bench/results` and `leaderboard --json` behave alike.
    .action((directory: string | undefined, opts: LeaderboardCommandOptions) =>
      leaderboardCommand({ ...opts, dir: directory || opts.dir })
    )

  return program
}

export async function runCLI(): Promise<void> {
  installGlobalErrorHandlers()
  // The llama.cpp tokenizer emits known-harmless "load: control-looking token"
  // noise to stderr (dispatched asynchronously from the native addon, so it
  // can fire at any time). Install the process-wide noise filter up front so
  // it can never corrupt CLI output — before any model load or MCP wiring.
  installStderrNoiseFilter()
  // P1-12: every command mirrors logger lines to .vectalon/logs/vectalon.log
  // (rotating, 5 × 10 MB); --diagnostics turns on debug-level capture too.
  attachFileLogging(process.cwd())
  const program = createProgram()
  const argv = process.argv
  const diagnostics = takeDiagnosticsFlag(argv)
  if (diagnostics) {
    // Capture debug lines in the file log for the whole run. This mutates the
    // shared env (children inherit VECTALON_DEBUG=1) — benign: nothing
    // downstream reads it, and sandboxed commands scrub the env anyway.
    process.env.VECTALON_DEBUG = '1'
    // Tracked so the process-exit handler can always emit a bundle (even when
    // a command calls process.exit(1) directly, e.g. doctor in a broken
    // project); the catch path attaches the full stack trace.
    pendingDiagnostics = { command: commandName(argv) }
    process.on('exit', () => {
      if (pendingDiagnostics) writeDiagnosticsBundle(pendingDiagnostics)
    })
  }
  const supportsClack = majorNode() > 20 || (majorNode() === 20 && (minorNode() > 12 || (minorNode() === 12 && patchNode() >= 0)))
  const interactiveEligible = argv.length <= 2 && process.stdin.isTTY && supportsClack

  if (interactiveEligible) {
    try {
      await runInteractive()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(message)
      if (diagnostics) {
        writeDiagnosticsBundle({ command: 'interactive', errorStack: err instanceof Error ? err.stack : undefined })
      }
      await flushErrorQueue()
      process.exit(1)
    }
    return
  }

  // Eager write so `--diagnostics` is visible immediately; the exit handler
  // refreshes it with the final state (log tail included).
  if (diagnostics) {
    const path = writeDiagnosticsBundle({ command: commandName(argv) })
    logger.info(`Diagnostics bundle written to ${path}`)
  }

  try {
    await program.parseAsync(argv)
    // Drain any warn-level errors captured during the run (best-effort).
    await flushErrorQueue()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(message)
    if (diagnostics && pendingDiagnostics) {
      pendingDiagnostics.errorStack = err instanceof Error ? err.stack : undefined
      writeDiagnosticsBundle(pendingDiagnostics)
    }
    // Errors-only, opt-out telemetry: queue + best-effort flush, then exit 1.
    await flushErrorQueue()
    process.exit(1)
  }
}

/** The subcommand name (e.g. "init") for diagnostics context. */
function commandName(argv: string[]): string {
  return argv[2] || 'vectalon'
}

/**
 * Changed files in the working tree (tracked + untracked, staged + unstaged),
 * for the impact TUI's type-to-filter autofill. Best-effort — returns [] when
 * the directory is not a git repo.
 */
async function gitChangedFiles(root: string): Promise<string[]> {
  const result = await runCommand('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root })
  if (!result.success) return []
  return result.stdout
    .split('\n')
    .map(line => line.replace(/^\S+\s+/, '').trim())
    .filter(Boolean)
    .sort()
}

/**
 * `--diagnostics` works on EVERY command: strip it from argv (so commander
 * accepts it on any subcommand) and let runCLI write the bundle afterwards.
 */
function takeDiagnosticsFlag(argv: string[]): boolean {
  const idx = argv.indexOf('--diagnostics')
  if (idx === -1) return false
  argv.splice(idx, 1)
  return true
}

/**
 * Global crash capture: uncaught exceptions and unhandled rejections are
 * queued for the error telemetry pipeline (opt-out, errors only) with CLI
 * command context. Never installed in tests.
 */
function installGlobalErrorHandlers(): void {
  if (process.env.NODE_ENV === 'test') return
  const cmd = (): string => process.argv.slice(2)[0] || 'vectalon'
  process.on('uncaughtException', (err: Error) => {
    logger.error(err.message)
    captureError(err, cmd(), 'uncaught exception')
    void flushErrorQueue().finally(() => process.exit(1))
  })
  process.on('unhandledRejection', (reason: unknown) => {
    const err = reason instanceof Error ? reason : new Error(String(reason))
    logger.error(err.message)
    captureError(err, cmd(), 'unhandled rejection')
    void flushErrorQueue()
  })
}

/** Diagnostics bundle to write on process exit (set when --diagnostics runs). */
let pendingDiagnostics: { command: string; errorStack?: string } | null = null

function majorNode(): number {
  return parseInt(process.versions.node.split('.')[0], 10)
}

function minorNode(): number {
  return parseInt(process.versions.node.split('.')[1], 10)
}

function patchNode(): number {
  return parseInt(process.versions.node.split('.')[2], 10)
}

async function runInteractive(): Promise<void> {
  const p = await dynamicImport<typeof import('@clack/prompts')>('@clack/prompts')

  p.intro(pc.bold(pc.cyan('vectalon')))

  const refreshHint = buildRefreshHint(process.cwd())
  const suggestionCount = countPersistedSuggestions(process.cwd())

  const action = await p.select({
    message: 'What would you like to do?',
    options: [
      { value: 'init', label: 'Initialize a project', hint: 'Scan React Native project and create .vectalon/' },
      { value: 'feature', label: 'Run feature workflow', hint: 'Generate a feature end-to-end' },
      { value: 'refresh', label: 'Force refresh knowledge', hint: refreshHint },
      { value: 'suggestions', label: suggestionCount > 0 ? `View suggestions (${suggestionCount})` : 'View suggestions', hint: 'Improvement suggestions from the knowledge refresh' },
      { value: 'bundle', label: 'Analyze bundle', hint: 'Metro snapshot + budgets, ASCII bars + HTML treemap dashboard' },
      { value: 'status', label: 'Show status', hint: 'Daemon, MCP, model, refresh, license, disk — one screen' },
      { value: 'daemon', label: 'Live Metro daemon', hint: 'Watch bundle size and JS thread health continuously' },
      { value: 'telemetry', label: 'Ingest telemetry', hint: 'Sentry/Crashlytics/traces/analytics into the knowledge base' },
      { value: 'impact', label: 'Analyze impact', hint: 'Cross-package blast radius of changed files (monorepo)' },
      { value: 'coverage', label: 'Show coverage dashboard', hint: 'Per-screen E2E and a11y gap summary with open follow-up links' },
      { value: 'intel', label: 'Run project intelligence', hint: 'Manifest, deps, AST, graphs, native registry, retrieval (001-010)' },
      { value: 'diagnostics', label: 'Run project diagnostics', hint: 'Metro, Hermes, Android/iOS build analysis, dependency conflicts (011-015)' },
      { value: 'generate', label: 'Generate code', hint: 'Component, screen, test, native module, API client (016-020)' },
      { value: 'perf', label: 'Run static perf scan', hint: 'Re-render hazards, startup hot paths, bridge traffic (021-029)' },
      { value: 'smoke', label: 'Run post-release smoke', hint: 'Every command, full output, pass/skip/fail report' },
      { value: 'ci', label: 'Generate CI workflow', hint: 'EAS Workflows (Expo) or GitHub Actions (bare RN CLI)' },
      { value: 'release', label: 'Release pipeline', hint: 'Detect version bump, changelog, submit workflow, crash monitor' },
      { value: 'ecosystem', label: 'Manage ecosystem', hint: 'Enable MCP servers, skills, tools, and hooks (Expo & RN-CLI)' },
      { value: 'doctor', label: 'Run doctor', hint: 'Verify every enabled ecosystem item is installed and reachable' },
      { value: 'selftest', label: 'Run self-test', hint: 'Test every feature — visible report + activity trace' },
      { value: 'bench', label: 'Run benchmark', hint: 'Score the harness on the RN coding tests (11 scenarios)' },
      { value: 'leaderboard', label: 'Update leaderboard', hint: 'Merge bench/results into BENCHMARK_RESULTS.md' },
      { value: 'sync', label: 'Sync team brain', hint: 'Push/pull .vectalon/knowledge to a hosted git remote' },
      { value: 'team', label: 'Run team brain', hint: 'Glossary, coding standards, expertise, decisions, onboarding (041-049)' },
      { value: 'review', label: 'Run PR review', hint: 'Review the diff — deterministic rules + team-brain standards (061)' },
      { value: 'arch', label: 'Run architecture review', hint: 'Cycles, layering, coupling, god modules, orphans (062)' },
      { value: 'sec', label: 'Run security review', hint: 'Secrets, unsafe patterns, dependency advisories (063)' },
      { value: 'build-fix', label: 'Diagnose a failing build', hint: 'Metro/Gradle/Xcode log → root cause + fix plan (064)' },
      { value: 'test-repair', label: 'Diagnose failing tests', hint: 'Jest/Detox/Maestro log → root cause + fix plan (065)' },
      { value: 'refactor', label: 'Scan for refactor opportunities', hint: 'Dead code, duplication, modernization, type smells (066)' },
      { value: 'policy', label: 'Manage policy', hint: 'Configure project-specific guardrails' },
      { value: 'serve', label: 'Start MCP server', hint: 'Expose project-aware tools to agents' },
      { value: 'pull', label: 'Download local model', hint: 'Download the default Qwen2.5-Coder model' },
      { value: 'models', label: 'List models', hint: 'Show available and downloaded local models' },
      { value: 'help', label: 'Show help', hint: 'Print command reference' },
    ],
  })

  if (p.isCancel(action)) {
    p.outro('Cancelled')
    return
  }

  if (action === 'help') {
    new Command().name('vectalon').help()
    return
  }

  if (action === 'init') {
    const directory = await p.text({
      message: 'Project directory',
      placeholder: process.cwd(),
    })
    if (p.isCancel(directory)) {
      p.outro('Cancelled')
      return
    }
    await initCommand(typeof directory === 'string' ? directory : '', {})
    p.outro('Project initialized')
    return
  }

  if (action === 'feature') {
    const prompt = await p.text({
      message: 'Feature prompt',
      placeholder: 'e.g., Add a login screen with email and password',
      validate: value => value ? undefined : 'Prompt is required',
    })
    if (p.isCancel(prompt)) {
      p.outro('Cancelled')
      return
    }
    await featureCommand(prompt as string, {})
    return
  }

  if (action === 'serve') {
    const protocol = await p.select({
      message: 'Protocol',
      options: [
        { value: 'mcp', label: 'MCP' },
        { value: 'stdio', label: 'Stdio' },
        { value: 'sse', label: 'SSE' },
        { value: 'http', label: 'HTTP' },
      ],
    })
    if (p.isCancel(protocol)) {
      p.outro('Cancelled')
      return
    }
    await serveCommand({ protocol: protocol as string })
    return
  }

  if (action === 'refresh') {
    await refreshCommand('', { force: true })
    p.outro('Knowledge refreshed')
    return
  }

  if (action === 'suggestions') {
    await suggestionsCommand('', {})
    p.outro('Suggestions shown')
    return
  }

  if (action === 'bundle') {
    await bundleCommand('', {})
    p.outro('Bundle analysis complete')
    return
  }

  if (action === 'status') {
    await statusCommand()
    p.outro('Status shown')
    return
  }

  if (action === 'daemon') {
    const mode = await p.select({
      message: 'Daemon action',
      options: [
        { value: 'start', label: 'Start daemon', hint: 'Watch Metro builds + JS thread health' },
        { value: 'status', label: 'Show status' },
        { value: 'stop', label: 'Stop daemon' },
      ],
    })
    if (p.isCancel(mode)) {
      p.outro('Cancelled')
      return
    }
    if (mode === 'status') {
      await daemonCommand({ status: true })
      return
    }
    if (mode === 'stop') {
      await daemonCommand({ stop: true })
      p.outro('Daemon stopped')
      return
    }
    await daemonCommand({})
    return
  }

  if (action === 'telemetry') {
    const outcome = await telemetryCommand('', {})
    if (outcome.status === 'ingested') {
      p.outro('Telemetry ingested')
      return
    }
    if (outcome.status === 'formats') {
      p.outro('Formats listed')
      return
    }
    const next = await p.select({
      message: 'No telemetry exports found — what now?',
      options: [
        { value: 'path', label: 'Specify a path', hint: 'A file or directory of Sentry / Crashlytics / analytics exports' },
        { value: 'fixtures', label: 'Generate sample exports', hint: 'Write demo exports and ingest them — see the pipeline end-to-end' },
        { value: 'formats', label: 'Supported formats', hint: 'What shapes are accepted and how to export them' },
        { value: 'cancel', label: 'Cancel' },
      ],
    })
    if (p.isCancel(next)) {
      p.outro('Cancelled')
      return
    }
    if (next === 'path') {
      const path = await p.text({
        message: 'Path to telemetry exports (file or directory)',
        placeholder: '.vectalon/telemetry',
      })
      if (p.isCancel(path)) {
        p.outro('Cancelled')
        return
      }
      const out = await telemetryCommand('', { path: path as string })
      p.outro(out.status === 'ingested' ? 'Telemetry ingested' : 'Nothing to ingest')
      return
    }
    if (next === 'fixtures') {
      const out = await telemetryCommand('', { fixtures: true })
      p.outro(out.status === 'ingested' ? 'Sample exports ingested — telemetry pipeline demonstrated' : 'Fixture ingestion failed')
      return
    }
    if (next === 'formats') {
      await telemetryCommand('', { formats: true })
      p.outro('Formats listed')
      return
    }
    p.outro('Cancelled')
    return
  }

  if (action === 'impact') {
    // Autofill: pick changed files from git (type-to-filter multiselect), or
    // type paths / screen names manually. Clack's list prompts filter as you
    // type, so the whole file set stays browseable.
    const gitChanged = await gitChangedFiles(process.cwd())
    if (gitChanged.length > 0) {
      const picked = await p.multiselect({
        message: 'Changed files (type to filter, space to select)',
        options: [
          ...gitChanged.map(f => ({ value: f, label: f })),
          { value: '__manual__', label: 'Type paths or screen names manually…' },
        ],
        required: true,
      })
      if (p.isCancel(picked)) {
        p.outro('Cancelled')
        return
      }
      const chosen = picked as string[]
      if (chosen.includes('__manual__')) {
        const typed = await p.text({
          message: 'Changed files (comma-separated paths or screen/component names)',
          placeholder: 'NewRequestSubmitScreen or packages/ui/src/Button.tsx',
          validate: value => value ? undefined : 'At least one changed file is required',
        })
        if (p.isCancel(typed)) {
          p.outro('Cancelled')
          return
        }
        await impactCommand('', { changed: typed as string })
        return
      }
      await impactCommand('', { changed: chosen.join(',') })
      return
    }
    const changed = await p.text({
      message: 'Changed files (comma-separated paths or screen/component names)',
      placeholder: 'NewRequestSubmitScreen or packages/ui/src/Button.tsx',
      validate: value => value ? undefined : 'At least one changed file is required',
    })
    if (p.isCancel(changed)) {
      p.outro('Cancelled')
      return
    }
    await impactCommand('', { changed: changed as string })
    return
  }

  if (action === 'coverage') {
    await coverageCommand('', {})
    p.outro('Coverage dashboard shown')
    return
  }

  if (action === 'intel') {
    await intelCommand('', {})
    p.outro('Project intelligence complete')
    return
  }

  if (action === 'diagnostics') {
    const gradle = await p.confirm({ message: 'Analyze a Gradle build log too?', initialValue: false })
    const gradleLog = gradle ? (await p.text({ message: 'Path to the Gradle log' })) as string : undefined
    const xcode = await p.confirm({ message: 'Analyze an Xcode build log too?', initialValue: false })
    const xcodeLog = xcode ? (await p.text({ message: 'Path to the Xcode log' })) as string : undefined
    await diagnosticsCommand('', { gradleLog, xcodeLog })
    p.outro('Project diagnostics complete')
    return
  }

  if (action === 'perf') {
    await perfCommand('', {})
    p.outro('Static performance scan complete')
    return
  }

  if (action === 'generate') {
    const genType = await p.select({
      message: 'What would you like to generate?',
      options: [
        { value: 'component', label: 'Component', hint: 'Functional TS component with styles' },
        { value: 'screen', label: 'Screen', hint: 'Component with navigation hooks' },
        { value: 'test', label: 'Test', hint: 'Jest RTL or Detox test for a component' },
        { value: 'native-module', label: 'Native module', hint: 'iOS + Android bridge scaffold (needs --spec)' },
        { value: 'api', label: 'API client', hint: 'Typed services from an OpenAPI spec (needs --spec)' },
      ],
    })
    if (p.isCancel(genType)) {
      p.outro('Cancelled')
      return
    }
    const type = genType as string
    const needsSpec = type === 'native-module' || type === 'api'
    const name = needsSpec ? '' : ((await p.text({ message: 'Name', placeholder: 'UserCard' })) as string)
    const spec = needsSpec ? ((await p.text({ message: 'Spec (JSON or path)' })) as string) : undefined
    await generateCommand(type, name, { spec })
    p.outro('Generation complete')
    return
  }

  if (action === 'smoke') {
    const scope = await p.select({
      message: 'Smoke scope',
      options: [
        { value: 'default', label: 'Standard checks', hint: 'All fast checks — servers, analysis, CI, doctor, …' },
        { value: 'full', label: 'Include slow checks', hint: '+ feature workflow, bench, full selftest, model pull' },
      ],
    })
    if (p.isCancel(scope)) {
      p.outro('Cancelled')
      return
    }
    await smokeCommand('', { full: scope === 'full' })
    p.outro('Smoke complete')
    return
  }

  if (action === 'ci') {
    await ciCommand('', {})
    p.outro('CI workflow configured')
    return
  }

  if (action === 'release') {
    const step = await p.select({
      message: 'Release stage',
      options: [
        { value: 'plan', label: 'Plan release', hint: 'Detect version bump + changelog from git history' },
        { value: 'submit', label: 'Write submit workflow', hint: 'E2E on device farm + store submission (EAS / GitHub Actions)' },
        { value: 'monitor', label: 'Monitor crash rate', hint: 'Ingest telemetry and check for spikes' },
      ],
    })
    if (p.isCancel(step)) {
      p.outro('Cancelled')
      return
    }
    if (step === 'submit') {
      await releaseCommand('', { submit: true })
    } else if (step === 'monitor') {
      await releaseCommand('', { monitor: true })
    } else {
      await releaseCommand('', {})
    }
    p.outro('Release stage complete')
    return
  }

  if (action === 'ecosystem') {
    const item = await p.select({
      message: 'Ecosystem action',
      options: [
        { value: 'list', label: 'List catalog', hint: 'Grouped by category, enabled items marked' },
        { value: 'enable', label: 'Enable an item', hint: 'Pick from the catalog and record it in .vectalon/ecosystem.json' },
        { value: 'info', label: 'View item details', hint: 'Install command + capabilities for one item' },
        { value: 'export', label: 'Export MCP config', hint: 'Print enabled MCP servers as an agent config fragment' },
      ],
    })
    if (p.isCancel(item)) {
      p.outro('Cancelled')
      return
    }
    if (item === 'list') {
      ecosystemCommand('', {})
      return
    }
    if (item === 'export') {
      ecosystemCommand('', { export: true })
      return
    }
    // Pick from the catalog instead of typing an id blind — clack's list is
    // type-to-filter, so 38 items stay manageable.
    const catalogItems = listEcosystemItems({})
    const options = catalogItems.map(ec => ({
      value: ec.id,
      label: `${ec.id} — ${ec.name}`,
      hint: `${ec.category} · ${ec.flavor}`,
    }))
    const picked = await p.select({
      message: item === 'info' ? 'Ecosystem item to inspect' : 'Ecosystem item to enable',
      options,
    })
    if (p.isCancel(picked)) {
      p.outro('Cancelled')
      return
    }
    if (item === 'info') {
      ecosystemCommand('', { info: picked as string })
      return
    }
    ecosystemCommand('', { enable: picked as string })
    p.outro('Ecosystem updated')
    return
  }

  if (action === 'doctor') {
    doctorCommand('', {})
    p.outro('Doctor complete')
    return
  }

  if (action === 'selftest') {
    await selftestCommand('', {})
    p.outro('Self-test complete')
    return
  }

  if (action === 'bench') {
    const scope = await p.select({
      message: 'Benchmark scope',
      options: [
        { value: 'default', label: 'Deterministic baseline', hint: 'Scaffold-able scenarios (rn-01/02/05/06), offline' },
        { value: 'local', label: 'Local model leaderboard', hint: 'All 11 scenarios through the local model' },
      ],
    })
    if (p.isCancel(scope)) {
      p.outro('Cancelled')
      return
    }
    await benchCommand({ model: scope === 'local' ? 'local' : undefined })
    p.outro('Benchmark complete')
    return
  }

  if (action === 'leaderboard') {
    leaderboardCommand({})
    p.outro('Leaderboard updated')
    return
  }

  if (action === 'sync') {
    const direction = await p.select({
      message: 'Sync direction',
      options: [
        { value: 'push', label: 'Push knowledge to remote' },
        { value: 'pull', label: 'Pull knowledge from remote' },
      ],
    })
    if (p.isCancel(direction)) {
      p.outro('Cancelled')
      return
    }
    await syncCommand('', { push: direction === 'push', pull: direction === 'pull' })
    p.outro('Sync complete')
    return
  }

  if (action === 'team') {
    const teamAction = await p.select({
      message: 'Team brain action',
      options: [
        { value: 'generate', label: 'Generate team brain', hint: 'Glossary, standards, expertise, decisions, PR knowledge, onboarding' },
        { value: 'search', label: 'Search team knowledge', hint: 'Semantic query across registered projects' },
        { value: 'projects', label: 'List team projects' },
      ],
    })
    if (p.isCancel(teamAction)) {
      p.outro('Cancelled')
      return
    }
    if (teamAction === 'generate') {
      await teamCommand('', {})
      p.outro('Team brain generated')
      return
    }
    if (teamAction === 'projects') {
      await teamCommand('', { projects: true })
      return
    }
    const query = await p.text({
      message: 'Search query',
      placeholder: 'e.g., how do we handle payments?',
      validate: value => value ? undefined : 'A query is required',
    })
    if (p.isCancel(query)) {
      p.outro('Cancelled')
      return
    }
    await teamCommand('', { search: query as string })
    p.outro('Search complete')
    return
  }

  if (action === 'review') {
    const reviewScope = await p.select({
      message: 'What should the review cover?',
      options: [
        { value: 'worktree', label: 'Uncommitted changes', hint: 'Review the current diff (default)' },
        { value: 'branch', label: 'Branch vs a base ref', hint: 'Review everything in this branch, e.g. --base main' },
      ],
    })
    if (p.isCancel(reviewScope)) {
      p.outro('Cancelled')
      return
    }
    const base = reviewScope === 'branch' ? (await p.text({ message: 'Base ref', placeholder: 'main' })) as string : undefined
    await reviewCommand('', { base })
    p.outro('Review complete')
    return
  }

  if (action === 'arch') {
    await archCommand('', {})
    p.outro('Architecture review complete')
    return
  }

  if (action === 'sec') {
    await secCommand('', {})
    p.outro('Security review complete')
    return
  }

  if (action === 'build-fix') {
    const logPath = (await p.text({ message: 'Path to the failing build log', placeholder: 'build.log', validate: v => v ? undefined : 'A log path is required' })) as string
    await buildFixCommand('', { log: logPath })
    p.outro('Build fix diagnosis complete')
    return
  }

  if (action === 'test-repair') {
    const logPath = (await p.text({ message: 'Path to the failing test log', placeholder: 'test.log', validate: v => v ? undefined : 'A log path is required' })) as string
    await testRepairCommand('', { log: logPath })
    p.outro('Test fix diagnosis complete')
    return
  }

  if (action === 'refactor') {
    await refactorCommand('', {})
    p.outro('Refactor scan complete')
    return
  }

  if (action === 'policy') {
    const policyAction = await p.select({
      message: 'Policy action',
      options: [
        { value: 'init', label: 'Initialize default policy' },
        { value: 'show', label: 'Show current policy' },
      ],
    })
    if (p.isCancel(policyAction)) {
      p.outro('Cancelled')
      return
    }
    if (policyAction === 'init') {
      policyCommand('', { init: true })
      p.outro('Policy initialized')
    } else {
      policyCommand('', {})
    }
    return
  }

  if (action === 'pull') {
    await pullCommand(undefined)
    p.outro('Model download complete')
    return
  }

  if (action === 'models') {
    await modelsCommand()
    return
  }
}
