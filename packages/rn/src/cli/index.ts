/**
 * vectalon CLI — React Native adaptive AI harness
 * Business Source License 1.1 (BSL-1.1)
 */

import { Command } from 'commander'
import pc from 'picocolors'
import { initCommand } from './commands/init'
import { serveCommand } from './commands/serve'
import { importCommand } from './commands/import'
import { featureCommand } from './commands/feature'
import { upgradeCommand } from './commands/upgrade'
import { pullCommand } from './commands/pull'
import { modelsCommand } from './commands/models'
import { policyCommand } from './commands/policy'
import { refreshCommand } from './commands/refresh'
import { bundleCommand } from './commands/bundle'
import { profileCommand } from './commands/profile'
import { sandboxCommand } from './commands/sandbox'
import { daemonCommand } from './commands/daemon'
import { telemetryCommand } from './commands/telemetry'
import { authCommand } from './commands/auth'
import { ciCommand } from './commands/ci'
import { releaseCommand } from './commands/release'
import { trainCommand } from './commands/train'
import { ecosystemCommand } from './commands/ecosystem'
import { syncCommand } from './commands/sync'
import { benchCommand } from './commands/bench'
import { leaderboardCommand } from './commands/leaderboard'
import { impactCommand } from './commands/impact'
import { doctorCommand } from './commands/doctor'
import { selftestCommand } from './commands/selftest'
import { logger } from './logger'
import pkg from '../../package.json'
import { dynamicImport } from '../utils/dynamicImport'

export function createProgram(): Command {
  const program = new Command()

  program
    .name('vectalon')
    .description('The adaptive AI harness for React Native')
    .version(pkg.version)
    .option('--dev', 'Enable dev mode — bypass all tier/license checks')
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
    .option('--model <provider>', 'Default model provider (local/openai/anthropic)')
    .action(initCommand)

  program
    .command('serve')
    .description('Start the vectalon MCP server for agent connections')
    .option('-p, --port <number>', 'HTTP server port', Number, 0)
    .option('--protocol <type>', 'Protocol type (mcp/stdio/sse/http)', 'mcp')
    .option('--model <provider>', 'Model provider (local/openai/anthropic)')
    .action(serveCommand)

  program
    .command('import')
    .description('Import SDLC artifacts (markdown/JSON) into the knowledge base')
    .argument('<target>', 'File or directory to import')
    .option('--type <type>', 'Artifact type (business, research, product, requirements, design, architecture, engineering, data, security, qa, devops, operations, analytics)')
    .option('--title <title>', 'Artifact title')
    .action(importCommand)

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
    .option('--model <provider>', 'Model provider (local/openai/anthropic)')
    .option('--push', 'Allow git push and PR creation (default: local branch/commit only)')
    .option('--device', 'Run device/simulator build checks (iOS/Android) during verification')
    .option('--heal-interactive', 'Prompt before applying each self-healing code-review fix (accept/reject/retry)')
    .option('--heal-attempts <n>', 'Max self-healing review attempts (default 3, or per .vectalon/policy.json)', Number)
    .option('--heal-severity <level>', 'Lowest severity that triggers healing: error|warning|info (default error)', 'error')
    .option('--ticket <key>', 'Read a ticket from the PM adapter (Jira/GitHub/Monday) and run the workflow headlessly from its title + description')
    .action(featureCommand)

  program
    .command('upgrade [directory]')
    .description('Upgrade React Native / Expo with the copilot (impact analysis, codemods, verification)')
    .option('--to <version>', 'Target version — RN (0.76), Expo SDK (53), or latest (default: latest known stable)')
    .option('--dry-run', 'Preview the plan + impact without changing files (default)')
    .option('--apply', 'Execute safe codemods and dependency bumps (native patches still require review; --force applies those too)')
    .option('--force', 'Skip safety checks: apply review steps automatically, skip confirmation')
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
    .command('bundle [directory]')
    .description('Analyze the Metro bundle and enforce performance budgets')
    .option('--platform <type>', 'Bundle platform (ios|android)', 'ios')
    .option('--static', 'Static on-disk checks only (skip the Metro build)')
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
    .option('--memory <mb>', 'Virtual memory limit in MB')
    .option('--network', 'Allow outbound network (default: denied where the backend supports it)')
    .option('--allow-env <names>', 'Comma-separated ambient env vars to keep')
    .option('--json', 'Print the result as JSON')
    .action((command, args, opts) => sandboxCommand(command, args, opts))

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
    .action(telemetryCommand)

  program
    .command('ci [directory]')
    .description('Generate the project CI workflow (EAS Workflows for Expo, GitHub Actions for bare RN CLI)')
    .action(ciCommand)

  program
    .command('release [directory]')
    .description('Autonomous release & monitor pipeline: detect version bump, generate changelog, write the release workflow (E2E + store submission), and monitor the crash rate')
    .option('--version <v>', 'Current version (default: package.json version)')
    .option('--changelog', 'Print only the generated changelog and exit')
    .option('--submit', 'Write the release workflow (EAS for Expo, GitHub Actions for bare RN CLI)')
    .option('--monitor', 'Ingest telemetry and monitor the crash rate for spikes')
    .option('--telemetry <dir>', 'Telemetry exports directory for --monitor (default .vectalon/telemetry)')
    .option('--baseline <rate>', 'Baseline crash rate per 1k sessions for spike detection', Number)
    .option('--hours <n>', 'Monitoring window in hours (default 24)', Number)
    .option('--json', 'Print the release plan as JSON')
    .action(releaseCommand)

  program
    .command('train [directory]')
    .description('Curate the RN fine-tuning dataset from benchmark reference solutions and generate the LoRA training plan (train → convert → eval via the bench harness)')
    .option('--build', 'Build the fine-tuning dataset (default)')
    .option('--plan', 'Also generate the LoRA training plan')
    .option('--out <dir>', 'Dataset output directory (default .vectalon/training)')
    .option('--base <model>', 'Base model: qwen2.5-coder-1.5b | qwen2.5-coder-3b | deepseek-coder-1.3b')
    .option('--scenarios <dir>', 'Custom benchmark scenario pack directory (default bench/scenarios)')
    .option('--references <dir>', 'Custom reference-solutions directory (default bench/references)')
    .option('--json', 'Print the dataset/plan as JSON')
    .action(trainCommand)

  program
    .command('ecosystem [directory]')
    .description('Browse and enable external MCP servers, skills, tools, and hooks for React Native / Expo projects')
    .option('--category <type>', 'Filter by category (mcp|skill|tool|hook)')
    .option('--flavor <type>', 'Filter by project flavor (expo|rn-cli)')
    .option('--enable <id>', 'Enable an ecosystem item and record it in .vectalon/ecosystem.json')
    .option('--disable <id>', 'Disable an enabled ecosystem item')
    .option('--export', 'Export enabled items as an MCP client config fragment')
    .option('--json', 'Print the export as JSON')
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
    .command('doctor [directory]')
    .description('Check that every enabled ecosystem item is installed and reachable')
    .option('--json', 'Print the report as JSON')
    .option('--fix', 'Auto-install missing ecosystem items and toolchain components, then re-check')
    .action(doctorCommand)

  program
    .command('bench')
    .description('Run the RN coding tests benchmark (deterministic baseline or real-model leaderboard)')
    .option('--model <provider>', 'Model provider (local/openai/anthropic) — run the real-model leaderboard pass')
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
    .description('Compute the cross-package blast radius of changed files in a monorepo (screens, navigation, E2E flows) and optionally post it as a PR comment')
    .option('--changed <files>', 'Comma-separated changed file paths relative to the workspace root')
    .option('--pr <number>', 'Post the impact report as a comment on the given pull request', Number)
    .option('--push', 'Allow git push / PR comments')
    .option('--json', 'Print the impact report as JSON')
    .option('--dry-run', 'Simulate the PR comment without posting')
    .action(impactCommand)

  program
    .command('selftest [directory]')
    .description('Test every feature of the harness in a sandbox — visible report + full activity trace of every step, command, and file modification')
    .option('--category <cat>', 'Run only one category (cli, sdlc, guardrails, knowledge, harness, model, mcp, workflows, ecosystem, bench, adapters, memory, upgrade, perf, sandbox)')
    .option('--only <id>', 'Run a single check by id')
    .option('--model <provider>', 'Force the model provider for the real-inference check (local/wasm/openai/anthropic)')
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
    .action(leaderboardCommand)

  return program
}

export function runCLI(): void {
  const program = createProgram()
  const argv = process.argv
  const supportsClack = majorNode() > 20 || (majorNode() === 20 && (minorNode() > 12 || (minorNode() === 12 && patchNode() >= 0)))
  const interactiveEligible = argv.length <= 2 && process.stdin.isTTY && supportsClack

  if (interactiveEligible) {
    runInteractive().catch((err: Error) => {
      logger.error(err.message)
      process.exit(1)
    })
  } else {
    program.parse(argv)
  }
}

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

  const action = await p.select({
    message: 'What would you like to do?',
    options: [
      { value: 'init', label: 'Initialize a project', hint: 'Scan React Native project and create .vectalon/' },
      { value: 'feature', label: 'Run feature workflow', hint: 'Generate a feature end-to-end' },
      { value: 'refresh', label: 'Refresh knowledge', hint: 'Update best practices and dependency suggestions from the web' },
      { value: 'bundle', label: 'Analyze bundle', hint: 'Metro bundle snapshot + performance budgets' },
      { value: 'daemon', label: 'Live Metro daemon', hint: 'Watch bundle size and JS thread health continuously' },
      { value: 'telemetry', label: 'Ingest telemetry', hint: 'Sentry/Crashlytics/traces/analytics into the knowledge base' },
      { value: 'impact', label: 'Analyze impact', hint: 'Cross-package blast radius of changed files (monorepo)' },
      { value: 'ci', label: 'Generate CI workflow', hint: 'EAS Workflows (Expo) or GitHub Actions (bare RN CLI)' },
      { value: 'release', label: 'Release pipeline', hint: 'Detect version bump, changelog, submit workflow, crash monitor' },
      { value: 'train', label: 'Fine-tune dataset', hint: 'Curate RN training data from benchmark references + LoRA plan' },
      { value: 'ecosystem', label: 'Manage ecosystem', hint: 'Enable MCP servers, skills, tools, and hooks (Expo & RN-CLI)' },
      { value: 'doctor', label: 'Run doctor', hint: 'Verify every enabled ecosystem item is installed and reachable' },
      { value: 'selftest', label: 'Run self-test', hint: 'Test every feature — visible report + activity trace' },
      { value: 'bench', label: 'Run benchmark', hint: 'Score the harness on the RN coding tests (11 scenarios)' },
      { value: 'leaderboard', label: 'Update leaderboard', hint: 'Merge bench/results into BENCHMARK_RESULTS.md' },
      { value: 'sync', label: 'Sync team brain', hint: 'Push/pull .vectalon/knowledge to a hosted git remote' },
      { value: 'policy', label: 'Manage policy', hint: 'Configure project-specific guardrails' },
      { value: 'serve', label: 'Start MCP server', hint: 'Expose project-aware tools to agents' },
      { value: 'import', label: 'Import artifacts', hint: 'Add markdown/JSON to the knowledge base' },
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

  if (action === 'import') {
    const target = await p.text({
      message: 'File or directory to import',
      placeholder: './docs',
      validate: value => value ? undefined : 'Target is required',
    })
    if (p.isCancel(target)) {
      p.outro('Cancelled')
      return
    }
    await importCommand(target as string, {})
    p.outro('Import complete')
    return
  }

  if (action === 'refresh') {
    await refreshCommand('', { force: true })
    p.outro('Knowledge refreshed')
    return
  }

  if (action === 'bundle') {
    await bundleCommand('', {})
    p.outro('Bundle analysis complete')
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
    await telemetryCommand('', {})
    p.outro('Telemetry ingested')
    return
  }

  if (action === 'impact') {
    const changed = await p.text({
      message: 'Changed files (comma-separated, relative to the workspace root)',
      placeholder: 'packages/ui/src/Button.tsx',
      validate: value => value ? undefined : 'At least one changed file is required',
    })
    if (p.isCancel(changed)) {
      p.outro('Cancelled')
      return
    }
    await impactCommand('', { changed: changed as string })
    return
  }

  if (action === 'ci') {
    await ciCommand('', {})
    p.outro('CI workflow configured')
    return
  }

  if (action === 'train') {
    const mode = await p.select({
      message: 'Training action',
      options: [
        { value: 'dataset', label: 'Build dataset', hint: 'Curate ChatML JSONL from benchmark reference solutions' },
        { value: 'plan', label: 'Dataset + plan', hint: 'Build dataset and print the LoRA fine-tuning plan' },
      ],
    })
    if (p.isCancel(mode)) {
      p.outro('Cancelled')
      return
    }
    await trainCommand('', { build: true, plan: mode === 'plan' })
    p.outro('Training artifacts written to .vectalon/training/')
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
        { value: 'list', label: 'List catalog', hint: 'Show all MCPs, skills, tools, hooks' },
        { value: 'enable', label: 'Enable an item', hint: 'Pick from the catalog and record it in .vectalon/ecosystem.json' },
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
    const enable = await p.text({
      message: 'Ecosystem item id to enable',
      placeholder: 'e.g. metro-mcp, expo-skills, maestro',
    })
    if (p.isCancel(enable)) {
      p.outro('Cancelled')
      return
    }
    ecosystemCommand('', { enable: enable as string })
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
