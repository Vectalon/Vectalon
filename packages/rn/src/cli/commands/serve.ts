import { ContextEngine } from '../../harness/ContextEngine'
import { MCPServer } from '../../protocol/MCPServer'
import { ModelRouter } from '../../model/ModelRouter'
import { ProjectMemory } from '../../memory/ProjectMemory'
import { PatternLearner } from '../../memory/PatternLearner'
import { ArtifactStore } from '../../knowledge/ArtifactStore'
import { TeamStore } from '../../knowledge/TeamStore'
import { HashEmbeddingProvider } from '../../knowledge/embeddings'
import { reportError } from '../../utils/safe'
import { createRemoteEmbeddingProvider } from '../../knowledge/remoteEmbeddings'
import { KnowledgeRefreshService } from '../../knowledge/refresh'
import { startEnabledMcpClients } from '../../protocol/subMcp'
import type { McpClientHandle } from '../../protocol/subMcp'
import { resolveProjectModelProvider, resolveProjectModelConfig } from '../../projectManifest'
import { activeModelLabel, isRemoteKeyMissing, getRemoteProviderInfo } from '../../model/setup'
import type { ModelProviderType } from '../../model/types'
import { getWasmPreset } from '../../model/local/wasmPresets'
import { printSyncStatus } from './sync'
import { existsSync, readFileSync } from 'fs'
import { join, basename, resolve } from 'path'
import { logger } from '../logger'
import { startHeartbeat } from '../../diagnostics/heartbeat'
import type { HeartbeatHandle } from '../../diagnostics/heartbeat'

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
  // An explicit --model choice disables the zero-config WASM auto-tier (see
  // feature.ts); projectRoot lets the local provider inline enabled ecosystem
  // skills into local generations behind every tool that uses the model.
  const modelRouter = new ModelRouter({
    projectRoot: root,
    zeroConfigEnabled: options.modelProvider ? false : undefined,
  })
  const modelProvider = resolveProjectModelProvider(root, options.modelProvider) as ModelProviderType
  const modelConfig = resolveProjectModelConfig(root)
  modelRouter.initialize({ provider: modelProvider, modelName: modelConfig?.modelName, apiKeyEnv: modelConfig?.apiKeyEnv })

  // The WASM zero-config tier shows as the effective model when it is active.
  const activeModel =
    modelProvider === 'local' || modelProvider === 'wasm'
      ? modelRouter.getActiveLabel()
      : activeModelLabel(modelProvider, modelConfig)
  logger.info(`Model: ${activeModel}`)
  if (isRemoteKeyMissing(modelProvider, modelConfig)) {
    const keyEnv = modelConfig?.apiKeyEnv || getRemoteProviderInfo(modelProvider)?.apiKeyEnv || `${modelProvider.toUpperCase()}_API_KEY`
    logger.warn(`No API key found for ${modelProvider}. Set ${keyEnv} in your environment or export it before connecting agents.`)
  }
  if (modelRouter.isZeroConfigActive()) {
    logger.info(`Zero-config WASM model (${getWasmPreset().modelId}) will download on first tool use — RN_VECTALON_NO_WASM=1 to disable`)
  }

  const protocol = options.protocol || 'mcp'
  const artifactStore = new ArtifactStore(root)
  const teamStore = buildTeamStore(root, artifactStore)
  printSyncStatus(root)

  // Spawn each enabled ecosystem MCP server (Metro MCP, Expo MCP, …) as a
  // child process and proxy its real tools through the parent tool list.
  // Failed servers are skipped with a warning; serve keeps running either way.
  let subMcpClients: McpClientHandle[] = []
  if (process.env.NODE_ENV !== 'test') {
    subMcpClients = await startEnabledMcpClients(root, {
      log: { info: message => logger.info(message), warn: message => logger.warn(message) },
      stderr: (item, line) => logger.dim(`[${item.id}] ${line}`),
    })
  }

  const server = new MCPServer(engine, modelRouter, protocol as 'mcp' | 'stdio' | 'sse' | 'http', artifactStore, teamStore, subMcpClients, {
    // `vectalon serve` runs locally — device tools execute real commands.
    deviceControlLive: true,
    root,
  })

  // Kill spawned sub-MCP servers (and their npx grandchildren) on shutdown,
  // and stop the liveness heartbeat (its interval is unref'd, but a clean
  // stop avoids one final spurious ping during teardown).
  let heartbeat: HeartbeatHandle | null = null
  const shutdown = (): void => {
    heartbeat?.stop()
    for (const client of subMcpClients) client.close()
  }
  if (subMcpClients.length > 0 || process.env.NODE_ENV !== 'test') {
    process.on('exit', shutdown)
    process.on('SIGINT', () => {
      shutdown()
      process.exit(130)
    })
    process.on('SIGTERM', () => {
      shutdown()
      process.exit(143)
    })
  }

  logger.success(`rn-vectalon serving via ${protocol.toUpperCase()}`)
  logger.info('Agents can connect and use project-aware tools')
  logger.info('Available tools:')
  for (const tool of server.getToolList()) {
    logger.dim(`  - ${tool.name}: ${tool.description}`)
  }

  startBackgroundRefresh(root)

  const boundPort = await server.start(options.port || 0)
  if (typeof boundPort === 'number') {
    logger.info(`HTTP server listening on http://localhost:${boundPort}`)
  }

  // Liveness heartbeat (every 5 min, opt-out via telemetry.enabled=false).
  heartbeat = startHeartbeat({
    kind: 'serve',
    root,
    modelProvider: activeModel,
  })
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
  } catch (err) {
    reportError(err, 'serve: .vectalon/team.json is not valid JSON — team brain disabled', 'warn')
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
