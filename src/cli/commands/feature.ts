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
import { logger } from '../logger'

export async function featureCommand(
  prompt: string,
  options: { workflow?: string; output?: string; json?: boolean; resume?: string; from?: string }
): Promise<void> {
  const root = process.cwd()
  const vectalonDir = join(root, '.vectalon')

  if (!existsSync(vectalonDir)) {
    logger.error('No .vectalon/ directory found. Run `vectalon init` first.')
    process.exit(1)
  }

  const workflow = getWorkflow(options.workflow || 'feature-development')
  if (!workflow) {
    const available = listWorkflows().map(w => w.id).join(', ')
    logger.error(`Unknown workflow: ${options.workflow}`)
    logger.dim(`  Available workflows: ${available}`)
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
  modelRouter.initialize({ provider: 'local' })

  const adapters = createAdapters({})

  let state = createWorkflowState(workflow.id, prompt)
  if (options.resume) {
    const loaded = loadWorkflowState(root, workflow.id, options.resume)
    if (!loaded) {
      logger.error(`Workflow state not found: ${options.resume}`)
      logger.info('Available states:')
      for (const s of listWorkflowStates(root, workflow.id)) {
        logger.dim(`  - ${s.id} (${s.status})`)
      }
      process.exit(1)
    }
    state = { ...loaded, prompt, status: 'running', updatedAt: Date.now() }
    logger.info(`Resuming workflow state: ${state.id}`)
  }

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
  }, engineOptions)

  saveWorkflowState(root, result)

  const phaseTable = new Table({
    head: ['Phase', 'Status'],
    style: { head: ['cyan'] },
  })
  for (const p of result.phases) {
    const statusColor = p.status === 'completed' ? pc.green : p.status === 'failed' ? pc.red : pc.yellow
    phaseTable.push([p.name, statusColor(p.status)])
  }

  const summary = [
    `# ${pc.bold(`Workflow: ${workflow.name}`)}`,
    `ID: ${pc.dim(result.id)}`,
    `Status: ${result.status === 'completed' ? pc.green(result.status) : pc.red(result.status)}`,
    '',
    '## Phase summary',
    phaseTable.toString(),
  ].join('\n')

  if (options.json) {
    const json = JSON.stringify(result, null, 2)
    if (options.output) {
      writeFileSync(options.output, json)
    }
    logger.out(json + '\n')
  } else {
    const output = `${summary}\n\n## Detailed output\n\n${result.phases.map(p => `### ${p.name}\n${p.output}`).join('\n\n')}`
    if (options.output) {
      writeFileSync(options.output, output)
    }
    logger.out(output + '\n')
  }

  if (result.status === 'completed') {
    logger.success(`Workflow completed: ${result.id}`)
  } else {
    logger.error(`Workflow failed: ${result.id}`)
    process.exit(1)
  }
}
