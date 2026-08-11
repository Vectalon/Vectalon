import { existsSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import pc from 'picocolors'
import { ContextEngine } from '../../harness/ContextEngine'
import { ProjectMemory } from '../../memory/ProjectMemory'
import { PatternLearner } from '../../memory/PatternLearner'
import { MemoryDistiller } from '../../memory/MemoryDistiller'
import { reportError } from '../../utils/safe'
import { ModelRouter } from '../../model/ModelRouter'
import { createAdapters } from '../../adapters'
import { WorkflowEngine, getWorkflow, listWorkflows, createWorkflowState, saveWorkflowState, loadWorkflowState, listWorkflowStates } from '../../workflows'
import type { WorkflowState } from '../../adapters/types'
import type { ModelProviderType } from '../../model/types'
import type { ContextSnapshot } from '../../harness/types'
import { getIntent, type WorkflowIntent, type IntentPrediction } from '../../workflows/phases/intent'
import { resolveProjectModelProvider, resolveProjectModelConfig } from '../../projectManifest'
import { activeModelLabel, isRemoteKeyMissing, isModelSetupProvider, getRemoteProviderInfo, MODEL_PROVIDERS } from '../../model/setup'
import { getWasmPreset } from '../../model/local/wasmPresets'
import { dynamicImport } from '../../utils/dynamicImport'
import { setFileChangeWriter, formatFileChange, computeFileChange, type FileChange } from '../../utils/fileDiff'
import { setCommandListener } from '../../adapters/runCommand'
import { getLogFilePath } from '../logfile'
import { KnowledgeRefreshService } from '../../knowledge/refresh'
import type { ImprovementSuggestion } from '../../knowledge/refresh'
import { readEnabledSkills, formatSkillsPreview } from '../../ecosystem'
import { workflowDocsDir, writeWorkflowIndex } from '../../workflows/phases/documentWriter'
import { renderWorkflowSummary, renderFailureCard, renderStageLine, stripAnsi, failedCheckFacts, type SummaryContext } from '../workflowReport'
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
  /** Read a ticket from the PM adapter and run the workflow headlessly from it. */
  ticket?: string
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

  if (options.model && !isModelSetupProvider(options.model)) {
    log.error(`Unknown model provider: ${options.model}`)
    log.info(`Available providers: ${MODEL_PROVIDERS.join(', ')}`)
    process.exit(1)
  }

  // Ticket-to-PR autonomy: with --ticket <key>, read the ticket through the PM
  // adapter (Jira / GitHub / Monday; deterministic stub when no provider is
  // configured) and drive the full workflow headlessly from its title +
  // description. The self-healing code-review + verification loop then produces
  // a real PR (with --push) and posts the review comment on it.
  const adapters = createAdapters({ root, dryRun: options.dryRun, git: { push: options.push } })
  if (options.ticket) {
    try {
      const ticket = await adapters.projectManagement.readTicket(options.ticket)
      if (!ticket) {
        log.error(`Ticket not found: ${options.ticket}`)
        process.exit(1)
      }
      if (!prompt) {
        prompt = [ticket.title, ticket.description].filter(Boolean).join('\n\n')
      }
      log.info(
        `Ticket ${ticket.key}: ${ticket.title}${ticket.fetched ? (ticket.url ? ` (${ticket.url})` : ' (fetched)') : ' (deterministic stub — configure a PM provider for live fetch)'}`
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.error(`Could not read ticket ${options.ticket}: ${message}`)
      process.exit(1)
    }
  }
  if (!prompt) {
    log.error('A prompt or --ticket <key> is required')
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
        log.info(`${refreshResult.suggestions.length} improvement suggestion(s) available — run \`vectalon suggestions\` to review`)
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
  // An explicit --model choice disables the zero-config WASM auto-tier so it
  // never silently substitutes a different model (or triggers a first-use
  // download) when the user asked for a specific provider; the tier only
  // applies to the manifest default path. projectRoot lets the local provider
  // inline enabled ecosystem skills into every local generation.
  const modelRouter = new ModelRouter({ projectRoot: root, zeroConfigEnabled: options.model ? false : undefined })
  const provider = resolveProjectModelProvider(root, options.model) as ModelProviderType
  const modelConfig = resolveProjectModelConfig(root)
  modelRouter.initialize({ provider, modelName: modelConfig?.modelName, apiKeyEnv: modelConfig?.apiKeyEnv })

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

  // Surface the model that will generate the code (the WASM zero-config tier
  // when active for local), warning when a remote provider is configured but
  // its API key is missing from the environment.
  const activeModel =
    provider === 'local' || provider === 'wasm'
      ? modelRouter.getActiveLabel()
      : activeModelLabel(provider, modelConfig)
  if (!options.json) {
    log.info(`Model: ${pc.bold(activeModel)}`)
    if (isRemoteKeyMissing(provider, modelConfig)) {
      const keyEnv = modelConfig?.apiKeyEnv || getRemoteProviderInfo(provider)?.apiKeyEnv || `${provider.toUpperCase()}_API_KEY`
      log.warn(`No API key found for ${provider}. Set ${keyEnv} in your environment or export it before running.`)
    }
    if (modelRouter.isZeroConfigActive()) {
      const wasm = getWasmPreset()
      log.info(
        pc.dim(`Zero-config WASM model: ${wasm.modelId} (${wasm.dtype}, ~${Math.round(wasm.sizeMb / 1024)} GB) downloads on first use. Set RN_VECTALON_NO_WASM=1 to disable.`)
      )
    }
  }

  const deviceRun = options.device === true

  // Detect intent up front so users can see why the workflow routes the way it
  // does, then hand the memoized prediction to the engine so every phase reuses
  // it — one model call per run instead of per phase.
  const outputs: Record<string, string> = {}
  let intentLine = ''
  if (!options.json) {
    intentLine = await detectIntentLine({ prompt, snapshot, modelRouter, outputs })
    log.info(intentLine)
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
  // Resume must flow through to the engine: without resume: true the loaded
  // state's completed phases would re-run (regenerating files the model
  // already wrote). with --from <phase> the engine starts at that phase.
  const engineOptions: { fromPhase?: string; resume?: boolean } | undefined = options.resume
    ? { resume: true, ...(options.from ? { fromPhase: options.from } : {}) }
    : options.from
      ? { fromPhase: options.from }
      : undefined

  // Live SDLC stage + command feed. Commands that run through runCommand emit
  // start/complete events; we surface the running command on the spinner and
  // collect outcomes for the summary's "Commands run" section. Cleared in the
  // finally block so it never leaks into later runs.
  const totalPhases = workflow.phases.length
  const runCommands: SummaryContext['commands'] = []
  let currentPhaseLabel = ''
  if (!options.json) {
    setCommandListener((event) => {
      if (!event.result) {
        // Command started — show what is actually running on the spinner.
        s.message(`[${currentPhaseLabel}] ${pc.dim('▸')} ${pc.dim(event.command)}`)
        return
      }
      const dur = event.durationMs !== undefined ? ` (${Math.round(event.durationMs / 1000)}s)` : ''
      const mark = event.result.success ? pc.dim('✓') : pc.red('✖')
      const exit = event.result.success ? '' : pc.red(` exit ${event.result.exitCode}`)
      process.stderr.write(`    ${mark} ${event.command}${pc.dim(dur)}${exit}\n`)
      // Restore the stage label so the spinner doesn't sit on the finished
      // command while the phase continues.
      s.message(`${currentPhaseLabel}...`)
      runCommands.push({
        command: event.command,
        exitCode: event.result.exitCode,
        success: event.result.success,
        durationMs: event.durationMs,
      })
    })
  }

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
        const idx = workflow.phases.findIndex(p => p.id === phase.id)
        currentPhaseLabel = `[${idx + 1}/${totalPhases}] ${phase.name}`
        s.message(`${currentPhaseLabel}...`)
      },
      onPhaseComplete: (phase, phaseResult) => {
        const idx = workflow.phases.findIndex(p => p.id === phase.id)
        if (phaseResult.status === 'failed') {
          s.stop(`${phase.name} failed`)
        } else {
          s.message(`${phase.name} completed`)
          if (!options.json) {
            process.stderr.write(renderStageLine(phaseResult, idx, totalPhases) + '\n')
          }
        }
      },
    })
  } finally {
    // All file writes happen inside the workflow run; detach the writer and
    // command listener so neither leaks into later runs (json mode, MCP
    // server, subsequent CLI runs).
    setFileChangeWriter(null)
    setCommandListener(null)
  }

  saveWorkflowState(root, result)

  // L0→L3 memory: record this workflow run as a raw session and distill it
  // into the project's learned knowledge (persona + scenario lessons) so
  // future generations' system prompts carry what this project has taught
  // us — the same enrichment path as web intel. Never breaks the workflow.
  try {
    const distiller = new MemoryDistiller(root)
    distiller.learnFromPatterns(memory.getActivePatterns())
    distiller.learnFromDecisions(memory.getDecisions())
    const artifactFiles = result.phases.flatMap(p => p.artifacts).filter(a => a.path && a.type !== 'document')
    // Review findings are extracted from the FULL phase outputs (not the
    // truncated L0 entries) so a finding past the entry cap is never lost.
    const reviewFindings = result.phases
      .flatMap(p => extractLLMFindings(p.output || ''))
      .map(f => f.replace(/[🔴🟡🔵]\s*/u, '').trim())
      .filter(Boolean)
    // Failed verification checks become error facts too, so the project's
    // recurring failures ("lint fails on .vectalon/metro/vectalon-reporter.js")
    // are learned and surfaced in future runs' memory context.
    const verificationPhase = result.phases.find(p => p.id === 'verification')
    const verificationFacts = verificationPhase ? failedCheckFacts(verificationPhase.output || '', root) : []
    distiller.ingestSession({
      id: result.id,
      workflowId: workflow.id,
      startedAt: result.createdAt,
      endedAt: Date.now(),
      outcome: result.status === 'completed' ? 'completed' : 'failed',
      summary: prompt.slice(0, 200),
      files: artifactFiles.map(a => {
        const p = a.path as string
        return p.startsWith(root) ? p.slice(root.length + 1) : p
      }),
      facts: [
        ...reviewFindings.map(statement => ({ category: 'error' as const, statement })),
        ...verificationFacts,
      ],
      entries: result.phases.map(p => ({
        kind: 'tool' as const,
        tool: p.id,
        text: `${p.name}: ${(p.output || '').slice(0, 600)}`,
        at: result.updatedAt,
      })),
    })
  } catch (err) {
    reportError(err, 'feature: memory distillation')
  }

  if (options.json) {
    const json = JSON.stringify(result, null, 2)
    if (options.output) {
      writeFileSync(options.output, json)
    }
    process.stdout.write(json + '\n')
  } else {
    s.stop(result.status === 'completed' ? 'Workflow completed' : 'Workflow failed')
    renderSummary(result, workflow.name, root, note, log, {
      model: activeModel,
      intentLabel: intentLine.split('\n')[0]?.replace('Detected intent: ', '') || undefined,
      skills: readEnabledSkills(root).map(s => s.name),
      commands: runCommands,
      logFile: getLogFilePath(),
      prompt,
    })

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

interface RenderSummaryContext {
  model: string
  intentLabel?: string
  skills: string[]
  commands: SummaryContext['commands']
  logFile?: string | null
  prompt: string
}

function renderSummary(
  result: WorkflowState,
  workflowName: string,
  root: string,
  note: (message: string, title?: string) => void,
  log: { error: (message: string) => void; info: (message: string) => void },
  ctx: RenderSummaryContext
): void {
  const docsDir = workflowDocsDir(root, result.workflowId, result.id)
  const docFiles = result.phases
    .flatMap(p => p.artifacts)
    .filter(a => a.path && a.type === 'document')
    .map(a => {
      const p = a.path as string
      return p.startsWith(root) ? p.slice(root.length + 1) : p
    })

  // Write the docs index — the single link that previews every document a run
  // produced. Best-effort: never breaks the summary on a read-only project.
  try {
    writeWorkflowIndex(root, result.workflowId, result.id, result, result.phases.flatMap(p => p.artifacts), {
      prompt: ctx.prompt,
      model: ctx.model,
      status: result.status,
    })
  } catch (err) {
    reportError(err, 'feature: writing docs index', 'warn')
  }

  const summary = renderWorkflowSummary(result, workflowName, root, {
    model: ctx.model,
    intentLabel: ctx.intentLabel,
    skills: ctx.skills,
    commands: ctx.commands,
    docFiles,
    docsDir,
    logFile: ctx.logFile,
  })
  // Strip ANSI before the box: clack's note() sizes the border from raw line
  // width, and colored lines would misalign it (the broken box in the pasted
  // output). Colors still render in stage lines and the failure card.
  note(stripAnsi(summary), 'Summary')

  const failedPhase = result.phases.find(p => p.status === 'failed')
  if (failedPhase) {
    // Structured failure card instead of the raw markdown wall: which checks
    // failed (with exit codes), the first failing output excerpt, and where to
    // find the full report, the command log, and how to resume.
    const docArtifact = failedPhase.artifacts.find(a => a.type === 'document' && a.path)
    const docsFile = docArtifact
      ? docArtifact.path!.startsWith(root)
        ? docArtifact.path!.slice(root.length + 1)
        : docArtifact.path!
      : `${docsDir}/${failedPhase.id}.md`
    process.stdout.write('\n')
    process.stdout.write(renderFailureCard(failedPhase, { docsFile, stateId: result.id, logFile: ctx.logFile }) + '\n')
    process.stdout.write('\n')
  }
}
