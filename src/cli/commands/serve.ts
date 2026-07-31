import { ContextEngine } from '../../harness/ContextEngine'
import { MCPServer } from '../../protocol/MCPServer'
import { ModelRouter } from '../../model/ModelRouter'
import { ProjectMemory } from '../../memory/ProjectMemory'
import { PatternLearner } from '../../memory/PatternLearner'
import { ArtifactStore } from '../../knowledge/ArtifactStore'
import { TeamStore } from '../../knowledge/TeamStore'
import { HashEmbeddingProvider } from '../../knowledge/embeddings'
import { existsSync, readFileSync } from 'fs'
import { join, basename, resolve } from 'path'

interface TeamConfig {
  team?: string
  projects?: Array<{ name: string; path: string; team?: string }>
}

export async function serveCommand(options: {
  port?: number
  protocol?: string
  modelProvider?: string
}): Promise<void> {
  const root = process.cwd()
  const vectalonDir = join(root, '.vectalon')

  if (!existsSync(vectalonDir)) {
    process.stderr.write('  No .vectalon/ directory found. Run `rn-vectalon init` first.\n')
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
  const artifactStore = new ArtifactStore(root)
  const teamStore = buildTeamStore(root, artifactStore)
  const server = new MCPServer(engine, modelRouter, protocol as 'mcp' | 'stdio' | 'sse' | 'http', artifactStore, teamStore)

  process.stderr.write(`  rn-vectalon serving via ${protocol.toUpperCase()}\n`)
  process.stderr.write('  Agents can connect and use project-aware tools\n')
  process.stderr.write('  Available tools:\n')
  for (const tool of server.getToolList()) {
    process.stderr.write(`    - ${tool.name}: ${tool.description}\n`)
  }

  await server.start(options.port || 0)
}

function buildTeamStore(root: string, localStore: ArtifactStore): TeamStore | null {
  const teamFile = join(root, '.vectalon', 'team.json')
  if (!existsSync(teamFile)) return null

  let config: TeamConfig
  try {
    config = JSON.parse(readFileSync(teamFile, 'utf-8'))
  } catch {
    process.stderr.write('  Warning: .vectalon/team.json is not valid JSON; team brain disabled.\n')
    return null
  }

  const teamStore = new TeamStore({ embeddingProvider: new HashEmbeddingProvider() })
  teamStore.register({ name: basename(root), team: config.team, store: localStore })

  for (const project of config.projects || []) {
    const projectRoot = resolve(root, project.path)
    const projectStore = new ArtifactStore(projectRoot)
    if (projectStore.list().length === 0) {
      process.stderr.write(`  Warning: no knowledge base at ${project.path}; skipping.\n`)
      continue
    }
    teamStore.register({ name: project.name, team: project.team || config.team, store: projectStore })
    process.stderr.write(`  Registered team project: ${project.name}${project.team ? ` (${project.team})` : ''}\n`)
  }

  return teamStore
}
