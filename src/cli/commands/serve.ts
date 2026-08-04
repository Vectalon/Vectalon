import { ContextEngine } from '../../harness/ContextEngine'
import { MCPServer } from '../../protocol/MCPServer'
import { ModelRouter } from '../../model/ModelRouter'
import { ProjectMemory } from '../../memory/ProjectMemory'
import { PatternLearner } from '../../memory/PatternLearner'
import { ArtifactStore } from '../../knowledge/ArtifactStore'
import { TeamStore } from '../../knowledge/TeamStore'
import { HashEmbeddingProvider } from '../../knowledge/embeddings'
import { createRemoteEmbeddingProvider } from '../../knowledge/remoteEmbeddings'
import { KnowledgeRefreshService } from '../../knowledge/refresh'
import { resolveProjectModelProvider, resolveProjectModelConfig } from '../../projectManifest'
import { activeModelLabel, isRemoteKeyMissing } from '../../model/setup'
import { printSyncStatus } from './sync'
import { existsSync, readFileSync } from 'fs'
import { join, basename, resolve } from 'path'
import { logger } from '../logger'

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
    logger.error('No .vectalon/ directory found. Run `vectalon init` first.')
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

  // The model provider comes from --model, else the project manifest set by
  // `vectalon init` (which also records the model name + API-key env var).
  const modelRouter = new ModelRouter()
  const modelProvider = resolveProjectModelProvider(root, options.modelProvider) as 'local' | 'openai' | 'anthropic'
  const modelConfig = resolveProjectModelConfig(root)
  // projectRoot lets the local provider inline enabled ecosystem skills into
  // the system prompt of local generations behind every tool that uses the model.
  modelRouter.initialize({ provider: modelProvider, modelName: modelConfig?.modelName, apiKeyEnv: modelConfig?.apiKeyEnv, projectRoot: root })

  const activeModel = activeModelLabel(modelProvider, modelConfig)
  logger.info(`Model: ${activeModel}`)
  if (isRemoteKeyMissing(modelProvider, modelConfig)) {
    logger.warn(`No API key found for ${modelProvider}. Set ${modelConfig?.apiKeyEnv || modelProvider.toUpperCase() + '_API_KEY'} in your environment or export it before connecting agents.`)
  }

  const protocol = options.protocol || 'mcp'
  const artifactStore = new ArtifactStore(root)
  const teamStore = buildTeamStore(root, artifactStore)
  printSyncStatus(root)
  const server = new MCPServer(engine, modelRouter, protocol as 'mcp' | 'stdio' | 'sse' | 'http', artifactStore, teamStore, root)

  logger.success(`rn-vectalon serving via ${protocol.toUpperCase()}`)
  logger.info('Agents can connect and use project-aware tools')
  logger.info('Available tools:')
  for (const tool of server.getToolList()) {
    logger.dim(`  - ${tool.name}: ${tool.description}`)
  }

  startBackgroundRefresh(root)

  await server.start(options.port || 0)
}

const BACKGROUND_REFRESH_INTERVAL_MS = 60 * 60 * 1000

function startBackgroundRefresh(root: string): void {
  const refreshService = new KnowledgeRefreshService({ projectRoot: root })

  async function runRefresh(): Promise<void> {
    try {
      const packageJsonPath = join(root, 'package.json')
      let dependencies: Record<string, string> = {}
      let devDependencies: Record<string, string> = {}
      if (existsSync(packageJsonPath)) {
        const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
        dependencies = pkg.dependencies || {}
        devDependencies = pkg.devDependencies || {}
      }
      const result = await refreshService.refresh({
        projectRoot: root,
        dependencies,
        devDependencies,
      })
      if (result.suggestions.length > 0) {
        logger.info(`Background refresh: ${result.suggestions.length} improvement suggestion(s) available`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.warn(`Background knowledge refresh failed: ${message}`)
    }
  }

  if (refreshService.isStale()) {
    void runRefresh()
  }

  if (process.env.NODE_ENV !== 'test') {
    // unref() so the interval never keeps the process alive on its own.
    setInterval(() => {
      void runRefresh()
    }, BACKGROUND_REFRESH_INTERVAL_MS).unref()
  }
}

function buildTeamStore(root: string, localStore: ArtifactStore): TeamStore | null {
  const teamFile = join(root, '.vectalon', 'team.json')
  if (!existsSync(teamFile)) return null

  let config: TeamConfig
  try {
    config = JSON.parse(readFileSync(teamFile, 'utf-8'))
  } catch {
    logger.warn('.vectalon/team.json is not valid JSON; team brain disabled.')
    return null
  }

  // Real embedding API (OpenAI / OpenAI-compatible) when configured; falls back
  // to the deterministic hash seam for offline semantic scoring.
  const remoteProvider = createRemoteEmbeddingProvider()
  const teamStore = new TeamStore({
    embeddingProvider: new HashEmbeddingProvider(),
    ...(remoteProvider ? { remoteEmbeddingProvider: remoteProvider } : {}),
  })
  if (remoteProvider) {
    logger.info(`Semantic search: ${remoteProvider.name} embeddings enabled`)
  }
  teamStore.register({ name: basename(root), team: config.team, store: localStore })

  for (const project of config.projects || []) {
    const projectRoot = resolve(root, project.path)
    const projectStore = new ArtifactStore(projectRoot)
    if (projectStore.list().length === 0) {
      logger.warn(`No knowledge base at ${project.path}; skipping.`)
      continue
    }
    teamStore.register({ name: project.name, team: project.team || config.team, store: projectStore })
    logger.info(`Registered team project: ${project.name}${project.team ? ` (${project.team})` : ''}`)
  }

  return teamStore
}
