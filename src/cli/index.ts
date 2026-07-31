import { Command } from 'commander'
import { initCommand } from './commands/init'
import { serveCommand } from './commands/serve'
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

  program.parse(process.argv)
}
