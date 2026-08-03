import { ContextEngine } from '../../harness/ContextEngine'
import { ProjectMemory } from '../../memory/ProjectMemory'
import { PatternLearner } from '../../memory/PatternLearner'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { logger } from '../logger'
import { applyEcosystemRecommendations, recommendEcosystemSetup, detectEcosystemItemsFromDependencies, enableEcosystemItems } from '../../ecosystem'
import pc from 'picocolors'
import { pullCommand } from './pull'
import { getDefaultPreset } from '../../model/local/presets'
import {
  detectModelAvailability,
  buildModelConfig,
  isModelSetupProvider,
  MODEL_PROVIDERS,
} from '../../model/setup'
import type { ModelSetupProvider, ProjectModelConfig } from '../../model/setup'
import { dynamicImport } from '../../utils/dynamicImport'

export async function initCommand(rootDir: string, options: Record<string, unknown>): Promise<void> {
  const root = rootDir || process.cwd()

  logger.info('Scanning React Native project...')
  const engine = new ContextEngine(root)
  const snapshot = engine.init()

  if (!snapshot.project.reactNativeVersion) {
    logger.warn('no react-native dependency detected in package.json.')
    logger.dim('         rn-vectalon is designed for React Native projects (>= 0.72.0).')
  }

  logger.info(`Found ${snapshot.components.length} component(s)`)

  const memory = new ProjectMemory(root)
  const learner = new PatternLearner(memory)
  learner.learnFromComponents(snapshot.components)
  engine.attachPatternStore(memory)

  const vectalonDir = join(root, '.vectalon')

  // Model provider setup — the model side of initialization. Resolves the
  // provider from --model, an interactive prompt (when TTY), or 'local', and
  // returns the config to persist (remote providers store modelName + the env
  // var that carries the API key — never the key itself).
  const model = await setupModelProvider(options)

  writeFileSync(
    join(vectalonDir, 'rn-vectalon.json'),
    JSON.stringify({
      version: '0.1.0',
      projectName: snapshot.project.name,
      rnVersion: snapshot.project.reactNativeVersion,
      tooling: snapshot.project.tooling,
      expoSdkVersion: snapshot.project.expoSdkVersion,
      initializedAt: Date.now(),
      modelProvider: model.provider,
      ...(model.modelConfig ? { modelConfig: model.modelConfig } : {}),
      autoLearn: true,
    }, null, 2)
  )

  // Detect the project flavor and auto-enable the ecosystem items that apply.
  const flavor = snapshot.project.tooling
  if (flavor === 'expo') {
    logger.info(pc.cyan(`Detected Expo project${snapshot.project.expoSdkVersion ? ` (SDK ${snapshot.project.expoSdkVersion})` : ''} — setting up Expo-aware tooling...`))
  } else {
    logger.info(pc.cyan('Detected React Native CLI (bare) project — setting up RN-CLI-aware tooling...'))
  }

  const result = applyEcosystemRecommendations(root, flavor)
  const recommended = recommendEcosystemSetup(flavor)
  const byCategory = (category: string) => recommended.filter(i => i.category === category).map(i => i.id)

  const mcpIds = byCategory('mcp')
  const skillIds = byCategory('skill')
  const hookIds = byCategory('hook')
  const toolIds = byCategory('tool')

  if (mcpIds.length > 0) {
    logger.info(pc.bold(`  MCP servers enabled (${mcpIds.length}): ${mcpIds.join(', ')}`))
  }
  if (skillIds.length > 0) {
    logger.info(pc.bold(`  Skills enabled (${skillIds.length}): ${skillIds.join(', ')}`))
  }
  if (hookIds.length > 0) {
    logger.info(pc.bold(`  Hooks enabled (${hookIds.length}): ${hookIds.join(', ')}`))
  }
  if (toolIds.length > 0) {
    logger.info(pc.bold(`  Tools enabled (${toolIds.length}): ${toolIds.join(', ')}`))
  }

  // Auto-detect ecosystem items from installed packages: if the project already
  // depends on zustand, MMKV, Reanimated, Gesture Handler, FlashList, Detox,
  // husky, etc., enable the matching catalog item and surface each detection.
  const packageJsonPath = join(root, 'package.json')
  let dependencies: Record<string, string> = {}
  let devDependencies: Record<string, string> = {}
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
      }
      dependencies = pkg.dependencies || {}
      devDependencies = pkg.devDependencies || {}
    } catch {
      logger.warn('package.json is not valid JSON; skipping dependency-based ecosystem detection.')
    }
  }
  const detected = detectEcosystemItemsFromDependencies(dependencies, devDependencies)
  const newlyDetected = detected.filter(i => !result.enabled.includes(i.id))
  if (newlyDetected.length > 0) {
    enableEcosystemItems(root, newlyDetected.map(i => i.id))
  }
  if (detected.length > 0) {
    logger.info(pc.bold(`Dependencies matched (${detected.length}):`))
    for (const item of detected) {
      const already = newlyDetected.includes(item) ? '' : ' (already enabled)'
      logger.info(`  ${pc.green('✓')} ${item.packageName} → ${item.id}${already}`)
    }
  }

  logModelSetup(model)

  logger.dim(`  Config written to ${result.path}`)
  logger.dim('  Run `vectalon ecosystem --export` to emit the enabled MCP servers as an agent config fragment.')

  logger.success('rn-vectalon initialized.')
  logger.dim(`  Created .vectalon/ with project context, memory store, and ${result.enabled.length} enabled ecosystem item(s)`)
}

interface ResolvedModelSetup {
  provider: ModelSetupProvider
  modelConfig?: ProjectModelConfig
}

function logModelSetup(model: ResolvedModelSetup): void {
  if (model.provider === 'local') {
    const availability = detectModelAvailability()
    if (availability.localDownloaded) {
      logger.dim('  Model: local provider configured — Qwen2.5-Coder downloaded.')
    } else {
      logger.dim('  Model: local provider configured — run `vectalon pull` to download Qwen2.5-Coder and enable code generation.')
    }
    return
  }
  const config = model.modelConfig
  const envSet = model.provider === 'openai'
    ? !!process.env.OPENAI_API_KEY
    : !!process.env.ANTHROPIC_API_KEY
  const keyStatus = envSet ? 'set' : 'NOT set'
  logger.dim(`  Model: ${model.provider} provider — ${config?.modelName || 'default'} via ${config?.apiKeyEnv || model.provider.toUpperCase() + '_API_KEY'} (${keyStatus}).`)
  if (!envSet) {
    logger.dim(`  Export your API key: export ${config?.apiKeyEnv || model.provider.toUpperCase() + '_API_KEY'}=sk-...`)
  }
}

/**
 * Resolve the model provider for initialization:
 *  1. `--model <provider>` flag (local/openai/anthropic) wins.
 *  2. Otherwise, when stdin is a TTY, prompt interactively — offering to
 *     download the default Qwen model for local, or checking the env key for
 *     OpenAI/Anthropic.
 *  3. Otherwise default to 'local' (no download, no prompt).
 */
async function setupModelProvider(options: Record<string, unknown>): Promise<ResolvedModelSetup> {
  const requested = typeof options.model === 'string' && options.model.trim() ? options.model.trim() : undefined

  if (requested) {
    if (!isModelSetupProvider(requested)) {
      logger.error(`Unknown model provider: ${requested}`)
      logger.info(`Valid providers: ${MODEL_PROVIDERS.join(', ')}`)
      process.exit(1)
    }
    return finalizeModelSetup(requested)
  }

  const interactive = process.stdin.isTTY === true
  if (!interactive) {
    return { provider: 'local', modelConfig: undefined }
  }

  const p = await dynamicImport<typeof import('@clack/prompts')>('@clack/prompts')
  const availability = detectModelAvailability()

  const choice = await p.select({
    message: 'Model provider',
    options: [
      {
        value: 'local',
        label: 'Local (Qwen2.5-Coder)',
        hint: availability.localDownloaded ? 'downloaded' : `~${getDefaultPreset().sizeGb} GB download`,
      },
      { value: 'openai', label: 'OpenAI', hint: availability.openaiKeySet ? 'OPENAI_API_KEY set' : 'needs OPENAI_API_KEY' },
      { value: 'anthropic', label: 'Anthropic', hint: availability.anthropicKeySet ? 'ANTHROPIC_API_KEY set' : 'needs ANTHROPIC_API_KEY' },
    ],
  })

  if (p.isCancel(choice)) {
    p.outro('Model setup skipped — using local provider')
    return { provider: 'local', modelConfig: undefined }
  }

  const provider = choice as ModelSetupProvider

  // Offer to download the default model when local is chosen and it's missing.
  if (provider === 'local' && !availability.localDownloaded) {
    const download = await p.confirm({
      message: `Download ${getDefaultPreset().name} (~${getDefaultPreset().sizeGb} GB)?`,
      initialValue: false,
    })
    if (!p.isCancel(download) && download) {
      await pullCommand(undefined)
    }
  }

  return finalizeModelSetup(provider)
}

function finalizeModelSetup(provider: ModelSetupProvider): ResolvedModelSetup {
  return { provider, modelConfig: buildModelConfig(provider) }
}
