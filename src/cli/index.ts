import { Command } from 'commander'
import { initCommand } from './commands/init'
import { serveCommand } from './commands/serve'
import { importCommand } from './commands/import'
import pkg from '../../package.json'

export function runCLI(): void {
  const program = new Command()

  program
    .name('rn-vectalon')
    .description('The adaptive AI harness for React Native')
    .version(pkg.version)

  program
    .command('init')
    .description('Initialize rn-vectalon in your React Native project')
    .argument('[directory]', 'Project root directory')
    .option('--model <provider>', 'Default model provider (local/openai/anthropic)')
    .action(initCommand)

  program
    .command('serve')
    .description('Start the rn-vectalon MCP server for agent connections')
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

  program.parse(process.argv)
}
