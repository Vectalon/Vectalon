import { ContextEngine } from '../../harness/ContextEngine'
import { MCPServer } from '../../protocol/MCPServer'
import { ModelRouter } from '../../model/ModelRouter'
import { ProjectMemory } from '../../memory/ProjectMemory'
import { PatternLearner } from '../../memory/PatternLearner'
import { existsSync } from 'fs'
import { join } from 'path'

export async function serveCommand(options: {
  port?: number
  protocol?: string
  modelProvider?: string
}): Promise<void> {
  const root = process.cwd()
  const cortexDir = join(root, '.cortex')

  if (!existsSync(cortexDir)) {
    process.stderr.write('  No .cortex/ directory found. Run `rn-cortex init` first.\n')
    process.exit(1)
  }

  const engine = new ContextEngine(root)
  engine.refresh()

  const memory = new ProjectMemory(root)
  const learner = new PatternLearner(memory)
  const snapshot = engine.getSnapshot()
  if (snapshot) {
    learner.learnFromComponents(snapshot.components)
  }
  engine.attachPatternStore(memory)

  const modelRouter = new ModelRouter()
  const modelProvider = options.modelProvider || 'local'
  modelRouter.initialize({ provider: modelProvider as 'local' | 'openai' | 'anthropic' })

  const protocol = options.protocol || 'mcp'
  const server = new MCPServer(engine, modelRouter, protocol as 'mcp' | 'stdio' | 'sse' | 'http')

  process.stderr.write(`  rn-cortex serving via ${protocol.toUpperCase()}\n`)
  process.stderr.write('  Agents can connect and use project-aware tools\n')
  process.stderr.write('  Available tools:\n')
  for (const tool of server.getToolList()) {
    process.stderr.write(`    - ${tool.name}: ${tool.description}\n`)
  }

  await server.start(options.port || 0)
}
