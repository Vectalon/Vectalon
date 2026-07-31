import { existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { ContextEngine } from '../../harness/ContextEngine'
import { ProjectMemory } from '../../memory/ProjectMemory'
import { PatternLearner } from '../../memory/PatternLearner'
import { ModelRouter } from '../../model/ModelRouter'
import { createAdapters } from '../../adapters'
import { WorkflowEngine, getWorkflow, listWorkflows, createWorkflowState, saveWorkflowState, loadWorkflowState, listWorkflowStates } from '../../workflows'

export async function featureCommand(
  prompt: string,
  options: { workflow?: string; output?: string; json?: boolean; resume?: string; from?: string }
): Promise<void> {
  const root = process.cwd()
  const vectalonDir = join(root, '.vectalon')

  if (!existsSync(vectalonDir)) {
    process.stderr.write('  No .vectalon/ directory found. Run `rn-vectalon init` first.\n')
    process.exit(1)
  }

  const workflow = getWorkflow(options.workflow || 'feature-development')
  if (!workflow) {
    const available = listWorkflows().map(w => w.id).join(', ')
    process.stderr.write(`  Unknown workflow: ${options.workflow}\n`)
    process.stderr.write(`  Available workflows: ${available}\n`)
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
      process.stderr.write(`  Workflow state not found: ${options.resume}\n`)
      process.stderr.write(`  Available states:\n`)
      for (const s of listWorkflowStates(root, workflow.id)) {
        process.stderr.write(`    - ${s.id} (${s.status})\n`)
      }
      process.exit(1)
    }
    state = { ...loaded, prompt, status: 'running', updatedAt: Date.now() }
    process.stderr.write(`  Resuming workflow state: ${state.id}\n`)
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

  const summary = [
    `# Workflow: ${workflow.name}`,
    `ID: ${result.id}`,
    `Status: ${result.status}`,
    '',
    '## Phase summary',
    ...result.phases.map(p => `- ${p.name}: ${p.status}`),
  ].join('\n')

  if (options.json) {
    const json = JSON.stringify(result, null, 2)
    if (options.output) {
      writeFileSync(options.output, json)
    }
    process.stdout.write(json + '\n')
  } else {
    const output = `${summary}\n\n## Detailed output\n\n${result.phases.map(p => `### ${p.name}\n${p.output}`).join('\n\n')}`
    if (options.output) {
      writeFileSync(options.output, output)
    }
    process.stdout.write(output + '\n')
  }

  if (result.status === 'completed') {
    process.stderr.write(`  Workflow completed: ${result.id}\n`)
  } else {
    process.stderr.write(`  Workflow failed: ${result.id}\n`)
    process.exit(1)
  }
}
