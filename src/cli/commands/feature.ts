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
import { dynamicImport } from '../../utils/dynamicImport'
import { setFileChangeWriter, formatFileChange, computeFileChange, type FileChange } from '../../utils/fileDiff'
import { KnowledgeRefreshService } from '../../knowledge/refresh'
import type { ImprovementSuggestion } from '../../knowledge/refresh'
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

  const modelRouter = new ModelRouter()
  modelRouter.initialize({ provider: (options.model || 'local') as ModelProviderType })

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
    renderSummary(result, workflow.name, root, note, log)

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

function renderSummary(
  result: WorkflowState,
  workflowName: string,
  root: string,
  note: (message: string, title?: string) => void,
  log: { error: (message: string) => void; info: (message: string) => void }
): void {
  const phaseTable = new Table({
    head: ['Phase', 'Status'],
    style: { head: ['cyan'] },
    colWidths: [32, 16],
  })
  for (const p of result.phases) {
    const statusColor = p.status === 'completed' ? pc.green : p.status === 'failed' ? pc.red : pc.yellow
    phaseTable.push([p.name, statusColor(p.status)])
  }

  const docsDir = join(root, '.vectalon', 'docs', result.workflowId, result.id)
  const fileArtifacts = result.phases.flatMap(p => p.artifacts).filter(a => a.path && a.type !== 'document')

  const lines: string[] = [
    `Workflow: ${workflowName}`,
    `ID: ${result.id}`,
    `Status: ${result.status === 'completed' ? 'completed' : 'failed'}`,
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
