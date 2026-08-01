import { existsSync, writeFileSync } from 'fs'
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
import { dynamicImport } from '../../utils/dynamicImport'

export async function featureCommand(
  prompt: string,
  options: { workflow?: string; output?: string; json?: boolean; resume?: string; from?: string; verbose?: boolean; dryRun?: boolean; push?: boolean }
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

  intro(`${workflow.name}: ${pc.dim(prompt)}`)

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
  modelRouter.initialize({ provider: 'local' })

  const adapters = createAdapters({ root, dryRun: options.dryRun, git: { push: options.push } })

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

  const workflowEngine = new WorkflowEngine()
  const engineOptions = options.from ? { fromPhase: options.from } : undefined
  const result = await workflowEngine.run(workflow, {
    projectRoot: root,
    snapshot: engine.getSnapshot(),
    prompt,
    inputs: {},
    outputs: {},
    state,
    adapters,
    modelRouter,
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
    outro('Workflow completed successfully')
  } else {
    outro('Workflow failed')
    process.exit(1)
  }
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
