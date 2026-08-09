import { WorkflowEngine } from '../../src/workflows/WorkflowEngine'
import type { WorkflowDefinition, WorkflowContext, WorkflowPhase } from '../../src/adapters/types'

function makePhase(id: string, name: string, output: string): WorkflowPhase {
  return {
    id,
    name,
    description: name,
    run: async () => ({
      id,
      name,
      description: name,
      status: 'completed',
      output,
      artifacts: [],
    }),
  }
}

function makeContext(prompt: string): WorkflowContext {
  return {
    projectRoot: '/tmp',
    snapshot: null,
    prompt,
    inputs: {},
    outputs: {},
    state: {
      id: 'wf-test',
      workflowId: 'test',
      prompt,
      status: 'pending',
      phases: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    adapters: {} as WorkflowContext['adapters'],
    modelRouter: {} as WorkflowContext['modelRouter'],
  }
}

describe('WorkflowEngine', () => {
  it('runs all phases in order and marks the workflow completed', async () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      name: 'Test workflow',
      description: 'A test workflow',
      phases: [
        makePhase('a', 'Phase A', 'output-a'),
        makePhase('b', 'Phase B', 'output-b'),
      ],
    }

    const engine = new WorkflowEngine()
    const ctx = makeContext('test prompt')
    const result = await engine.run(workflow, ctx)

    expect(result.status).toBe('completed')
    expect(result.phases).toHaveLength(2)
    expect(result.phases[0].id).toBe('a')
    expect(result.phases[1].id).toBe('b')
    expect(ctx.outputs.a).toBe('output-a')
    expect(ctx.outputs.b).toBe('output-b')
  })

  it('stops at the first failed phase and marks the workflow failed', async () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      name: 'Test workflow',
      description: 'A test workflow',
      phases: [
        makePhase('a', 'Phase A', 'output-a'),
        {
          id: 'b',
          name: 'Phase B',
          description: 'fails',
          run: async () => {
            throw new Error('boom')
          },
        },
        makePhase('c', 'Phase C', 'output-c'),
      ],
    }

    const engine = new WorkflowEngine()
    const ctx = makeContext('test prompt')
    const result = await engine.run(workflow, ctx)

    expect(result.status).toBe('failed')
    expect(result.phases).toHaveLength(2)
    expect(result.phases[1].status).toBe('failed')
    expect(result.phases[1].error).toContain('boom')
  })

  it('resume skips completed phases and only re-runs failed/remaining ones', async () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      name: 'Test workflow',
      description: 'A test workflow',
      phases: [
        makePhase('a', 'Phase A', 'output-a'),
        makePhase('b', 'Phase B', 'output-b'),
        makePhase('c', 'Phase C', 'output-c'),
      ],
    }

    // Pre-seed state: 'a' completed, 'b' failed (the phase the user is resuming).
    const ctx = makeContext('test prompt')
    ctx.state.phases = [
      { id: 'a', name: 'Phase A', description: '', status: 'completed', output: 'output-a', artifacts: [] },
      { id: 'b', name: 'Phase B', description: '', status: 'failed', output: 'old-b', artifacts: [] },
    ]

    const engine = new WorkflowEngine()
    const result = await engine.run(workflow, ctx, { resume: true })

    expect(result.status).toBe('completed')
    // 'a' must not re-run — only 'b' and 'c' re-execute.
    expect(ctx.outputs.a).toBeUndefined()
    expect(ctx.outputs.b).toBe('output-b')
    expect(ctx.outputs.c).toBe('output-c')
    const ids = result.phases.map(p => p.id)
    expect(ids).toEqual(['a', 'b', 'c'])
    expect(result.phases.find(p => p.id === 'a')?.output).toBe('output-a')
  })
})
