/**
 * vectalon init — Initialize Vectalon in your project
 * Business Source License 1.1 (BSL-1.1)
 *
 * P0-6: hardened with rollback + idempotency. A failed init never leaves the
 * project in an undefined state — the next run detects the dirty state and
 * offers `--resume` / `--clean-restart`, and a completed init is a no-op
 * unless `--force` is passed.
 */

import { ContextEngine } from '../../harness/ContextEngine'
import { ProjectMemory } from '../../memory/ProjectMemory'
import { PatternLearner } from '../../memory/PatternLearner'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { logger } from '../logger'
import { reportError } from '../../utils/safe'
import { applyEcosystemRecommendations, recommendEcosystemSetup, detectEcosystemItemsFromDependencies, enableEcosystemItems } from '../../ecosystem'
import pc from 'picocolors'
import { pullCommand } from './pull'
import { getDefaultPreset } from '../../model/local/presets'
import { listDownloadedModels } from '../../model/local/ModelStore'
import {
  detectModelAvailability,
  buildModelConfig,
  isModelSetupProvider,
  getRemoteProviderInfo,
  MODEL_PROVIDERS,
} from '../../model/setup'
import type { ModelSetupProvider, ProjectModelConfig } from '../../model/setup'
import { dynamicImport } from '../../utils/dynamicImport'
import { resolveProjectModelProvider, resolveProjectModelConfig } from '../../projectManifest'
import { warnIfRnVersionAhead } from '../../upgrade/drift'
import {
  detectInitState,
  snapshotProjectFiles,
  restoreProjectFiles,
  cleanPartialArtifacts,
  createInitState,
  writeInitState,
  INIT_PHASES,
} from './init/transaction'
import type { InitPhase, InitStateFile } from './init/transaction'

export interface InitOptions {
  /** Default model provider (local|wasm|openai|anthropic|azure-openai|ollama|vllm|groq). */
  model?: string
  /** Resume an interrupted init from its last completed phase. */
  resume?: boolean
  /** Roll back an interrupted init and start over. */
  cleanRestart?: boolean
  /** Re-run init even when the project is already initialized. */
  force?: boolean
}

export async function initCommand(rootDir: string, options: InitOptions = {}): Promise<void> {
  const root = rootDir || process.cwd()

  const detection = detectInitState(root)

  // Idempotency: a completed init is a no-op unless --force.
  if (detection.status === 'complete' && !options.force) {
    logger.info('rn-vectalon is already initialized in this project.')
    logger.dim('  Re-run with --force to re-initialize, or `vectalon doctor` to verify the setup.')
    return
  }

  // Dirty state handling: resume / clean-restart / prompt.
  let rollback = snapshotProjectFiles(root)
  let resumeFrom = new Set<InitPhase>()
  if (detection.status === 'dirty') {
    logger.warn(`Detected an incomplete initialization: ${detection.dirtyReason}`)
    const hasRecord = !!detection.state && detection.state.rollback.length > 0
    if (hasRecord) {
      rollback = (detection.state as InitStateFile).rollback
    }
    const clean = options.cleanRestart === true
    const resume = options.resume === true

    if (clean) {
      const restored = hasRecord
        ? restoreProjectFiles(root, rollback)
        : cleanPartialArtifacts(root)
      logger.info(`Rolled back ${restored.length} file(s) from the failed init.`)
      rollback = snapshotProjectFiles(root) // fresh baseline after the rollback
    } else if (resume || !process.stdin.isTTY) {
      if (hasRecord) {
        resumeFrom = new Set((detection.state as InitStateFile).completedPhases)
        const last = lastCompleted((detection.state as InitStateFile))
        logger.info(`Resuming from phase "${last}" (${(detection.state as InitStateFile).completedPhases.length} of ${INIT_PHASES.length} phases already done).`)
      } else {
        logger.info('No rollback record — starting fresh.')
      }
    } else {
      const p = await dynamicImport<typeof import('@clack/prompts')>('@clack/prompts')
      const choice = await p.select({
        message: 'A previous `vectalon init` did not finish. How do you want to proceed?',
        options: [
          { value: 'resume', label: 'Resume', hint: 'Continue from where it stopped (keeps finished work)' },
          { value: 'clean', label: 'Clean restart', hint: 'Roll back the failed init and start over' },
        ],
      })
      if (p.isCancel(choice)) {
        p.outro('Cancelled — nothing changed.')
        return
      }
      if (choice === 'clean') {
        const restored = hasRecord ? restoreProjectFiles(root, rollback) : cleanPartialArtifacts(root)
        logger.info(`Rolled back ${restored.length} file(s) from the failed init.`)
        rollback = snapshotProjectFiles(root)
      } else if (hasRecord) {
        resumeFrom = new Set((detection.state as InitStateFile).completedPhases)
      }
    }
  }

  const state = createInitState(root, rollback)
  writeInitState(root, state)

  try {
    await runInitPhases(root, options, state, resumeFrom)
    if (!state.completedPhases.includes('complete')) {
      state.completedPhases.push('complete')
    }
    state.status = 'complete'
    state.updatedAt = Date.now()
    writeInitState(root, state)
  } catch (err) {
    state.status = 'in-progress'
    state.updatedAt = Date.now()
    state.failureReason = err instanceof Error ? err.message : String(err)
    writeInitState(root, state)
    logger.error('vectalon init failed — the project was left in a recoverable state.')
    logger.dim('  Re-run `vectalon init` to resume, or `vectalon init --clean-restart` to roll back and start over.')
    throw err
  }
}

function lastCompleted(state: InitStateFile): string {
  return state.completedPhases[state.completedPhases.length - 1] || 'none'
}

/** Mark a phase complete and persist the state (so a later crash can resume). */
function completePhase(root: string, state: InitStateFile, phase: InitPhase): void {
  if (!state.completedPhases.includes(phase)) {
    state.completedPhases.push(phase)
  }
  state.updatedAt = Date.now()
  writeInitState(root, state)
}

/**
 * The init pipeline, phase by phase. Phases already completed (resume) are
 * skipped; each completed phase is persisted so an interrupt never loses
 * progress. Throws on the first failing phase — the caller persists the
 * rollback record.
 */
async function runInitPhases(
  root: string,
  options: InitOptions,
  state: InitStateFile,
  resumeFrom: Set<InitPhase>
): Promise<void> {
  // Scan + memory are cheap and deterministic — always re-run them (even on
  // resume) so the snapshot used below is fresh; the gated phases are the
  // side-effectful ones (model download, manifest, ecosystem writes).
  const engine = new ContextEngine(root)
  const snapshot = engine.init()

  if (!snapshot.project.reactNativeVersion) {
    logger.warn('no react-native dependency detected in package.json.')
    logger.dim('         rn-vectalon is designed for React Native projects (>= 0.72.0).')
  } else {
    warnIfRnVersionAhead(snapshot.project.reactNativeVersion)
  }
  logger.info(`Found ${snapshot.components.length} component(s)`)

  const memory = new ProjectMemory(root)
  const learner = new PatternLearner(memory)
  learner.learnFromComponents(snapshot.components)
  engine.attachPatternStore(memory)
  completePhase(root, state, 'scan')
  completePhase(root, state, 'memory')

  const vectalonDir = join(root, '.vectalon')

  // --- phase: gitignore ---
  if (!resumeFrom.has('gitignore')) {
    // The `.vectalon/` workspace is per-machine runtime state (memory, knowledge
    // caches, generated code, workflow states). Keep it out of version control:
    // team-visible outputs (workflow documents) land in `docs/vectalon/` instead.
    ensureGitignored(root, '.vectalon/')
    completePhase(root, state, 'gitignore')
  }

  // --- phase: model ---
  const modelsBefore = new Set(listDownloadedModels().map(m => m.id))
  let model: ResolvedModelSetup
  if (resumeFrom.has('model')) {
    // The model phase already completed in a previous run — rebuild the
    // resolved setup from the persisted manifest for logging.
    const resolved = resolveProjectModelProvider(root) as ModelSetupProvider
    model = { provider: resolved, modelConfig: resolveProjectModelConfig(root) }
  } else {
    model = await setupModelProvider(options)
    for (const downloaded of listDownloadedModels()) {
      if (!modelsBefore.has(downloaded.id) && !state.modelsDownloaded.includes(downloaded.id)) {
        state.modelsDownloaded.push(downloaded.id)
      }
    }
    completePhase(root, state, 'model')
  }

  // --- phase: manifest ---
  if (!resumeFrom.has('manifest')) {
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
    completePhase(root, state, 'manifest')
  }

  // --- phase: ecosystem ---
  if (!resumeFrom.has('ecosystem')) {
    const flavor = snapshot.project.tooling
    if (flavor === 'expo') {
      logger.info(pc.cyan(`Detected Expo project${snapshot.project.expoSdkVersion ? ` (SDK ${snapshot.project.expoSdkVersion})` : ''} — setting up Expo-aware tooling...`))
    } else {
      logger.info(pc.cyan('Detected React Native CLI (bare) project — setting up RN-CLI-aware tooling...'))
    }

    void applyEcosystemRecommendations(root, flavor)
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
    completePhase(root, state, 'ecosystem')
  }

  // --- phase: detect-deps ---
  if (!resumeFrom.has('detect-deps')) {
    const result = applyEcosystemRecommendations(root, snapshot.project.tooling)
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
      } catch (err) {
        reportError(err, 'init: package.json is not valid JSON — skipping dependency-based ecosystem detection', 'warn')
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
    completePhase(root, state, 'detect-deps')
  }

  logModelSetup(model)

  if (state.modelsDownloaded.length > 0) {
    logger.dim(`  Model(s) downloaded during this run: ${state.modelsDownloaded.join(', ')} (kept even on rollback — they live in your global config dir)`)
  }

  logger.dim(`  Config written to ${join(root, '.vectalon', 'ecosystem.json')}`)
  logger.dim('  Run `vectalon ecosystem --export` to emit the enabled MCP servers as an agent config fragment.')

  logger.success('rn-vectalon initialized.')
  logger.dim('  Created .vectalon/ (gitignored runtime workspace) with project context, memory store, and enabled ecosystem item(s)')
  logger.dim('  Workflow documents are written to docs/vectalon/ so the team sees them in version control.')
}

/**
 * Ensure an entry (e.g. `.vectalon/`) is present in the project's `.gitignore`,
 * creating the file if missing and appending without duplicating entries.
 */
export function ensureGitignored(root: string, entry: string): boolean {
  const gitignorePath = join(root, '.gitignore')
  const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf-8') : ''
  const lines = existing.split('\n')
  const normalized = entry.replace(/\/$/, '')
  const alreadyIgnored = lines.some(line => {
    const trimmed = line.trim().replace(/\r$/, '')
    return trimmed === entry.trim() || trimmed === normalized
  })
  if (alreadyIgnored) {
    return false
  }
  const addition = existing.length > 0 && !existing.endsWith('\n') ? '\n' : ''
  writeFileSync(gitignorePath, existing + addition + entry + '\n')
  return true
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
  if (model.provider === 'wasm') {
    logger.dim('  Model: wasm provider configured — Qwen2.5-Coder ONNX/WASM downloads on first use (zero-config).')
    return
  }
  const config = model.modelConfig
  const info = getRemoteProviderInfo(model.provider)
  if (!info) return
  if (!info.apiKeyEnv) {
    logger.dim(`  Model: ${info.label} provider — ${config?.modelName || info.defaultModel} at ${config?.endpoint || info.baseUrl} (no API key required).`)
    return
  }
  const env = config?.apiKeyEnv || info.apiKeyEnv
  const envSet = !!process.env[env]
  logger.dim(`  Model: ${info.label} provider — ${config?.modelName || info.defaultModel} via ${env} (${envSet ? 'set' : 'NOT set'}).`)
  if (!envSet) {
    logger.dim(`  Export your API key: export ${env}=sk-...`)
  }
}

/**
 * Resolve the model provider for initialization:
 *  1. `--model <provider>` flag (local/wasm/openai/anthropic/...) wins.
 *  2. Otherwise, when stdin is a TTY, prompt interactively — offering to
 *     download the default Qwen model for local, or checking the env key for
 *     OpenAI/Anthropic.
 *  3. Otherwise default to 'local' (no download, no prompt).
 */
async function setupModelProvider(options: InitOptions): Promise<ResolvedModelSetup> {
  const requested = typeof options.model === 'string' && options.model.trim() ? options.model.trim() : undefined

  if (requested) {
    if (!isModelSetupProvider(requested)) {
      // Throw (never process.exit) — initCommand is an exported function
      // invoked in-process by the selftest, tests, and MCP tooling; exiting
      // the process would bypass the transaction rollback record and kill
      // the host.
      throw new Error(`Unknown model provider: ${requested} — valid providers: ${MODEL_PROVIDERS.join(', ')}`)
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
      {
        value: 'wasm',
        label: 'WASM (zero-config)',
        hint: 'downloads on first use — no API key, no native build',
      },
      { value: 'openai', label: 'OpenAI', hint: availability.openaiKeySet ? 'OPENAI_API_KEY set' : 'needs OPENAI_API_KEY' },
      { value: 'anthropic', label: 'Anthropic', hint: availability.anthropicKeySet ? 'ANTHROPIC_API_KEY set' : 'needs ANTHROPIC_API_KEY' },
      { value: 'azure-openai', label: 'Azure OpenAI', hint: availability.azureOpenaiKeySet ? 'AZURE_OPENAI_API_KEY set' : 'needs AZURE_OPENAI_API_KEY' },
      { value: 'ollama', label: 'Ollama', hint: 'local server — no API key' },
      { value: 'vllm', label: 'vLLM', hint: 'local server — no API key' },
      { value: 'groq', label: 'Groq', hint: availability.groqKeySet ? 'GROQ_API_KEY set' : 'needs GROQ_API_KEY' },
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

interface ResolvedModelSetup {
  provider: ModelSetupProvider
  modelConfig?: ProjectModelConfig
}
