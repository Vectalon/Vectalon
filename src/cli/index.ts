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
