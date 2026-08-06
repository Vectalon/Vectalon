import { Command } from 'commander'
import pc from 'picocolors'
import { initCommand } from './commands/init'
import { serveCommand } from './commands/serve'
import { importCommand } from './commands/import'
import { featureCommand } from './commands/feature'
import { pullCommand } from './commands/pull'
import { modelsCommand } from './commands/models'
import { policyCommand } from './commands/policy'
import { refreshCommand } from './commands/refresh'
import { bundleCommand } from './commands/bundle'
import { telemetryCommand } from './commands/telemetry'
import { ciCommand } from './commands/ci'
import { ecosystemCommand } from './commands/ecosystem'
import { syncCommand } from './commands/sync'
import { benchCommand } from './commands/bench'
import { leaderboardCommand } from './commands/leaderboard'
import { doctorCommand } from './commands/doctor'
import { logger } from './logger'
import pkg from '../../package.json'
import { dynamicImport } from '../utils/dynamicImport'

export function runCLI(): void {
  const program = new Command()

  program
    .name('vectalon')
    .description('The adaptive AI harness for React Native')
    .version(pkg.version)

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
    .command('feature <prompt>')
    .description('Run the feature-development SDLC workflow for a given prompt')
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
    .action(featureCommand)

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
    .command('leaderboard [directory]')
    .description('Merge per-model benchmark results into a timestamped BENCHMARK_RESULTS.md leaderboard')
    .option('--out <path>', 'Output file (default BENCHMARK_RESULTS.md)')
    .option('--json', 'Print the merged runs as JSON instead of markdown')
    .option('--timestamp <iso>', 'Override the leaderboard timestamp (default now)')
    .option('--pr-comment', 'Print a compact PR comment (with upsert marker) instead of writing markdown')
    .action(leaderboardCommand)

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
      { value: 'telemetry', label: 'Ingest telemetry', hint: 'Sentry/Crashlytics/traces/analytics into the knowledge base' },
      { value: 'ci', label: 'Generate CI workflow', hint: 'EAS Workflows (Expo) or GitHub Actions (bare RN CLI)' },
      { value: 'ecosystem', label: 'Manage ecosystem', hint: 'Enable MCP servers, skills, tools, and hooks (Expo & RN-CLI)' },
      { value: 'doctor', label: 'Run doctor', hint: 'Verify every enabled ecosystem item is installed and reachable' },
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

  if (action === 'telemetry') {
    await telemetryCommand('', {})
    p.outro('Telemetry ingested')
    return
  }

  if (action === 'ci') {
    await ciCommand('', {})
    p.outro('CI workflow configured')
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
