import { existsSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import pc from 'picocolors'
import Table from 'cli-table'
import { ContextEngine } from '../../harness/ContextEngine'
import { ProjectMemory } from '../../memory/ProjectMemory'
import { PatternLearner } from '../../memory/PatternLearner'
import { ModelRouter } from '../../model/ModelRouter'
import { createAdapters } from '../../adapters'
import { WorkflowEngine, getWorkflow, listWorkflows, createWorkflowState, saveWorkflowState, loadWorkflowState, listWorkflowStates } from '../../workflows'
import type { WorkflowState } from '../../adapters/types'
import type { ModelProviderType } from '../../model/types'
import type { ContextSnapshot } from '../../harness/types'
import { getIntent, type WorkflowIntent, type IntentPrediction } from '../../workflows/phases/intent'
import { resolveProjectModelProvider, resolveProjectModelConfig } from '../../projectManifest'
import { activeModelLabel, isRemoteKeyMissing } from '../../model/setup'
import { dynamicImport } from '../../utils/dynamicImport'
import { setFileChangeWriter, formatFileChange, computeFileChange, type FileChange } from '../../utils/fileDiff'
import { KnowledgeRefreshService } from '../../knowledge/refresh'
import type { ImprovementSuggestion } from '../../knowledge/refresh'
import { readEnabledSkills, formatSkillsPreview } from '../../ecosystem'
import { workflowDocsDir } from '../../workflows/phases/documentWriter'
import type { HealDecision } from '../../adapters/types'

export interface FeatureCommandOptions {
  workflow?: string
  output?: string
  json?: boolean
  resume?: string
  from?: string
  verbose?: boolean
  dryRun?: boolean
  push?: boolean
  model?: string
  device?: boolean
  healInteractive?: boolean
  healAttempts?: number
  healSeverity?: string
}

export function formatIntentLabel(intent: WorkflowIntent): string {
  switch (intent.type) {
    case 'add-feature':
      return `add-feature/${intent.feature}`
    case 'remove-dependency':
      return `remove-dependency/${intent.dependency}`
    case 'refactor':
      return `refactor/${intent.target}`
    case 'fix':
      return `fix/${intent.area}`
    default:
      return 'unknown'
  }
}

export function formatIntentSummary(prediction: IntentPrediction): string {
  const label = formatIntentLabel(prediction.intent)
  const confidence = prediction.alternatives[0]?.confidence
  const confidenceText = typeof confidence === 'number' ? `, confidence ${confidence.toFixed(2)}` : ''
  const reasoning = prediction.reasoning?.trim()
  const lines = [`Detected intent: ${label} — LLM${confidenceText}`]
  if (reasoning) {
    const truncated = reasoning.length > 160 ? `${reasoning.slice(0, 157)}...` : reasoning
    lines.push(`  ↳ ${truncated}`)
  }
  return lines.join('\n')
}

async function detectIntentLine(options: {
  prompt: string
  snapshot: ContextSnapshot | null
  modelRouter: ModelRouter
  outputs: Record<string, string>
}): Promise<string> {
  // getIntent always returns an LLM-driven prediction (the safe 'unknown' default
  // when the model is unavailable), so this cannot throw and intent detection
  // never blocks the CLI.
  const prediction = await getIntent(options)
  return formatIntentSummary(prediction)
}

export async function featureCommand(
  prompt: string,
  options: FeatureCommandOptions
): Promise<void> {
  const { intro, outro, spinner, log, note } = await dynamicImport<typeof import('@clack/prompts')>('@clack/prompts')

  const root = process.cwd()
  const vectalonDir = join(root, '.vectalon')

  if (!existsSync(vectalonDir)) {
    log.error('No .vectalon/ directory found. Run `vectalon init` first.')
    process.exit(1)
  }

  const workflow = getWorkflow(options.workflow || 'feature-development')
  if (!workflow) {
    const available = listWorkflows().map(w => w.id).join(', ')
    log.error(`Unknown workflow: ${options.workflow}`)
    log.info(`Available workflows: ${available}`)
    process.exit(1)
  }

  const VALID_PROVIDERS = ['local', 'openai', 'anthropic']
  if (options.model && !VALID_PROVIDERS.includes(options.model)) {
    log.error(`Unknown model provider: ${options.model}`)
    log.info(`Available providers: ${VALID_PROVIDERS.join(', ')}`)
    process.exit(1)
  }

  intro(`${workflow.name}: ${pc.dim(prompt)}`)

  const engine = new ContextEngine(root)
  engine.refresh()

  const refreshService = new KnowledgeRefreshService({ projectRoot: root })
  if (refreshService.isStale()) {
    log.info('Knowledge cache is stale; refreshing from web sources...')
    try {
      const packageJsonPath = join(root, 'package.json')
      let dependencies: Record<string, string> = {}
      let devDependencies: Record<string, string> = {}
      if (existsSync(packageJsonPath)) {
        const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
        dependencies = pkg.dependencies || {}
        devDependencies = pkg.devDependencies || {}
      }
      const refreshResult = await refreshService.refresh({
        projectRoot: root,
        dependencies,
        devDependencies,
      })
      if (refreshResult.suggestions.length > 0) {
        log.info(`${refreshResult.suggestions.length} improvement suggestion(s) available`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.warn(`Knowledge refresh failed: ${message}`)
    }
  }

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
  const provider = resolveProjectModelProvider(root, options.model) as ModelProviderType
  const modelConfig = resolveProjectModelConfig(root)
  // projectRoot lets the local provider inline enabled ecosystem skills into
  // the system prompt of every local generation (incl. intent detection).
  modelRouter.initialize({ provider, modelName: modelConfig?.modelName, apiKeyEnv: modelConfig?.apiKeyEnv, projectRoot: root })

  // Audit the guidance the model will actually receive: print the inlined
  // skills (truncated to a few lines per skill) so users can see what
  // best-practice content is in the system prompt (local and remote alike).
  if (!options.json) {
    const skills = readEnabledSkills(root)
    if (skills.length > 0) {
      log.info(pc.dim(`Inlined ${skills.length} project skill(s) into the model prompt:`))
      for (const line of formatSkillsPreview(skills).split('\n')) {
        log.info(pc.dim(line))
      }
    }
  }

  // Surface the model that will generate the code, warning when a remote
  // provider is configured but its API key is missing from the environment.
  const activeModel = activeModelLabel(provider, modelConfig)
  if (!options.json) {
    log.info(`Model: ${pc.bold(activeModel)}`)
    if (isRemoteKeyMissing(provider, modelConfig)) {
      log.warn(`No API key found for ${provider}. Set ${modelConfig?.apiKeyEnv || provider.toUpperCase() + '_API_KEY'} in your environment or export it before running.`)
    }
  }

  const adapters = createAdapters({ root, dryRun: options.dryRun, git: { push: options.push } })
  const deviceRun = options.device === true

  // Detect intent up front so users can see why the workflow routes the way it
  // does, then hand the memoized prediction to the engine so every phase reuses
  // it — one model call per run instead of per phase.
  const outputs: Record<string, string> = {}
  if (!options.json) {
    log.info(await detectIntentLine({ prompt, snapshot, modelRouter, outputs }))
    // Stream Claude-style file-change logs with diffs to stderr while the
    // spinner (stdout) keeps animating. The writer is a no-op when unset.
    setFileChangeWriter((change: FileChange) => {
      process.stderr.write(formatFileChange(change) + '\n')
    })
  }

  let state = createWorkflowState(workflow.id, prompt)
  if (options.resume) {
    const loaded = loadWorkflowState(root, workflow.id, options.resume)
    if (!loaded) {
      log.error(`Workflow state not found: ${options.resume}`)
      log.info('Available states:')
      for (const s of listWorkflowStates(root, workflow.id)) {
        log.info(`  - ${s.id} (${s.status})`)
      }
      process.exit(1)
    }
    state = { ...loaded, prompt, status: 'running', updatedAt: Date.now() }
    log.info(`Resuming workflow state: ${state.id}`)
  }

  const s = spinner()
  s.start('Starting workflow...')

  // Interactive self-healing: when enabled, prompt before each model fix with a
  // live diff and accept/reject/retry choices instead of applying it blindly.
  const inputs: Record<string, unknown> = {}
  if (options.healAttempts !== undefined) inputs.maxAttempts = options.healAttempts
  if (options.healSeverity !== undefined) inputs.healSeverity = options.healSeverity

  const workflowEngine = new WorkflowEngine()
  const engineOptions = options.from ? { fromPhase: options.from } : undefined
  let result: WorkflowState
  try {
    result = await workflowEngine.run(workflow, {
      projectRoot: root,
      snapshot,
      prompt,
      inputs,
      outputs,
      state,
      adapters,
      modelRouter,
      deviceRun,
      onHealFix: options.healInteractive && !options.json
        ? async (info) => {
            // Show the proposed fix as a Claude-style diff before asking.
            const change = computeFileChange(info.file, 'modified', info.currentContent, info.fixedContent)
            s.stop('Reviewing proposed fix...')
            process.stderr.write('\n' + formatFileChange(change) + '\n')
            const { select, isCancel } = await dynamicImport<typeof import('@clack/prompts')>('@clack/prompts')
            const action = await select({
              message: `Accept the fix for ${info.file}?`,
              options: [
                { value: 'accept', label: 'Accept and write fix' },
                { value: 'reject', label: 'Reject and keep original' },
                { value: 'retry', label: 'Ask the model to retry' },
              ],
            })
            if (isCancel(action)) {
              s.start('Workflow paused...')
              return 'reject'
            }
            s.start('Continuing workflow...')
            return action as HealDecision
          }
        : undefined,
    }, {
      ...engineOptions,
      onPhaseStart: (phase) => {
        s.message(`${phase.name}...`)
      },
      onPhaseComplete: (phase, phaseResult) => {
        if (phaseResult.status === 'failed') {
          s.stop(`${phase.name} failed`)
        } else {
          s.message(`${phase.name} completed`)
        }
      },
    })
  } finally {
    // All file writes happen inside the workflow run; detach the writer so it
    // never leaks into later runs (json mode, MCP server, subsequent CLI runs).
    setFileChangeWriter(null)
  }

  saveWorkflowState(root, result)

  if (options.json) {
    const json = JSON.stringify(result, null, 2)
    if (options.output) {
      writeFileSync(options.output, json)
    }
    process.stdout.write(json + '\n')
  } else {
    s.stop(result.status === 'completed' ? 'Workflow completed' : 'Workflow failed')
    renderSummary(result, workflow.name, root, note, log, activeModel)

    if (options.verbose) {
      process.stdout.write('\n## Detailed output\n\n')
      process.stdout.write(result.phases.map(p => `### ${p.name}\n${p.output}`).join('\n\n') + '\n')
    }

    if (options.output) {
      const output = result.phases.map(p => `### ${p.name}\n${p.output}`).join('\n\n')
      writeFileSync(options.output, output)
      log.info(`Detailed output written to ${options.output}`)
    }
  }

  if (result.status === 'completed') {
    if (!options.json) {
      renderUpgradeSuggestions(refreshService.getSuggestions(), log)
    }
    outro('Workflow completed successfully')
  } else {
    outro('Workflow failed')
    process.exit(1)
  }
}

interface SuggestionLog {
  error: (message: string) => void
  warn: (message: string) => void
  info: (message: string) => void
}

export function formatUpgradeSuggestions(suggestions: ImprovementSuggestion[]): Array<{ severity: ImprovementSuggestion['severity']; message: string }> {
  return suggestions.map(s => {
    const version =
      s.currentVersion && s.latestVersion && s.currentVersion !== s.latestVersion
        ? `${s.currentVersion} → ${s.latestVersion}`
        : s.latestVersion || s.currentVersion || ''
    return { severity: s.severity, message: version ? `${s.library}: ${version}` : s.library }
  })
}

export function renderUpgradeSuggestions(suggestions: ImprovementSuggestion[], log: SuggestionLog): void {
  const lines = formatUpgradeSuggestions(suggestions)
  if (lines.length === 0) return

  log.info(pc.bold(`Upgrade suggestions available (${lines.length})`))
  for (const line of lines) {
    if (line.severity === 'error') {
      log.error(line.message)
    } else if (line.severity === 'warning') {
      log.warn(line.message)
    } else {
      log.info(line.message)
    }
  }
  log.info(pc.dim('Run `vectalon refresh --force` to re-check for updates'))
}

function extractLLMFindings(output: string): string[] {
  const findings: string[] = []
  const fileBlocks = output.split(/###\s+/)
  for (const block of fileBlocks) {
    const lines = block.split('\n')
    const fileLine = lines[0]?.trim()
    if (!fileLine) continue
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('🔴') || trimmed.startsWith('🟡') || trimmed.startsWith('🔵')) {
        findings.push(`  ${fileLine}: ${trimmed}`)
      }
    }
  }
  return findings.slice(0, 12)
}

function renderSummary(
  result: WorkflowState,
  workflowName: string,
  root: string,
  note: (message: string, title?: string) => void,
  log: { error: (message: string) => void; info: (message: string) => void },
  activeModel: string
): void {
  const phaseTable = new Table({
    head: ['Phase', 'Status', 'Files'],
    style: { head: ['cyan'] },
    colWidths: [32, 16, 38],
  })
  const fileArtifacts = result.phases.flatMap(p => p.artifacts).filter(a => a.path && a.type !== 'document')
  for (const p of result.phases) {
    const statusColor = p.status === 'completed' ? pc.green : p.status === 'failed' ? pc.red : pc.yellow
    const phaseFiles = p.artifacts
      .filter(a => a.path && a.type !== 'document')
      .map(a => {
        const path = a.path ?? ''
        return path.startsWith(root) ? path.slice(root.length + 1) : path
      })
    const filesCell = phaseFiles.length > 0 ? phaseFiles.join(', ') : '—'
    phaseTable.push([p.name, statusColor(p.status), filesCell])
  }

  const docsDir = workflowDocsDir(root, result.workflowId, result.id)

  const lines: string[] = [
    `Workflow: ${workflowName}`,
    `ID: ${result.id}`,
    `Status: ${result.status === 'completed' ? 'completed' : 'failed'}`,
    `Model: ${activeModel}`,
    '',
    phaseTable.toString(),
  ]

  if (fileArtifacts.length > 0) {
    lines.push('')
    lines.push(pc.bold('Files created or modified:'))
    for (const artifact of fileArtifacts) {
      const displayPath = artifact.path?.startsWith(root) ? artifact.path.slice(root.length + 1) : artifact.path
      lines.push(`  ${pc.green('✔')} ${displayPath}`)
    }
  }

  // Surface LLM review findings inline when code review fails.
  const codeReviewPhase = result.phases.find(p => p.id === 'code-review')
  if (codeReviewPhase?.status === 'failed') {
    const findings = extractLLMFindings(codeReviewPhase.output)
    if (findings.length > 0) {
      lines.push('')
      lines.push(pc.bold('Code review findings:'))
      for (const f of findings) {
        lines.push(pc.red(f))
      }
    }
  }

  lines.push('')
  lines.push(`Documents saved to ${docsDir}`)

  note(lines.join('\n'), 'Summary')

  const failedPhase = result.phases.find(p => p.status === 'failed')
  if (failedPhase) {
    log.error(`Failed phase: ${failedPhase.name}`)
    process.stdout.write('\n')
    process.stdout.write(failedPhase.output)
    process.stdout.write('\n')
  }
}
