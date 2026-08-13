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

  it('self-heals: a failed stage re-runs its fixer, then the stage retries', async () => {
    // Gate 'b' fails until the fixer 'a' has run again (the engine clears the
    // fixer's output before re-running it, so the fixer must re-produce it).
    let fixerRuns = 0
    const fixer: WorkflowPhase = {
      id: 'a',
      name: 'Implementation',
      description: 'fixes',
      run: async ctx => {
        fixerRuns++
        ctx.outputs['a'] = 'fixed-' + fixerRuns
        return {
          id: 'a',
          name: 'Implementation',
          description: '',
          status: 'completed',
          output: 'fixed output',
          artifacts: [],
        }
      },
    }
    const gate: WorkflowPhase = {
      id: 'b',
      name: 'Verification',
      description: 'gates',
      // The gate only passes once the fixer has re-run (fixerRuns >= 2) — the
      // "fix, then come back to this stage" contract.
      run: async () => {
        const fixed = fixerRuns >= 2
        return {
          id: 'b',
          name: 'Verification',
          description: '',
          status: fixed ? 'completed' : 'failed',
          output: fixed ? 'pass' : 'fail',
          artifacts: [],
          error: fixed ? undefined : 'not fixed yet',
        }
      },
    }
    const workflow: WorkflowDefinition = {
      id: 'test',
      name: 'Test workflow',
      description: '',
      phases: [fixer, gate],
      healWith: { b: 'a' },
    }

    const attempts: string[] = []
    const retries: string[] = []
    const engine = new WorkflowEngine()
    const ctx = makeContext('test prompt')
    const result = await engine.run(workflow, ctx, {
      maxAttempts: 3,
      onPhaseStart: (phase, attempt) => attempts.push(`${phase.id}:${attempt}`),
      onPhaseRetry: (phase, fixerId) => retries.push(`${phase.id}->${fixerId}`),
    })

    expect(result.status).toBe('completed')
    // Fixer ran twice (initial + heal); gate failed once then passed.
    expect(fixerRuns).toBe(2)
    expect(attempts).toEqual(['a:1', 'b:1', 'a:2', 'b:2'])
    expect(retries).toEqual(['b->a'])
    // State keeps one entry per phase — the final (successful) attempt.
    expect(result.phases.find(p => p.id === 'b')?.status).toBe('completed')
  })

  it('caps self-healing at maxAttempts and fails the run', async () => {
    let fixerRuns = 0
    const fixer: WorkflowPhase = {
      id: 'a',
      name: 'Implementation',
      description: 'fixes',
      run: async ctx => {
        fixerRuns++
        ctx.outputs['a'] = 'fixed-' + fixerRuns
        return {
          id: 'a',
          name: 'Implementation',
          description: '',
          status: 'completed',
          output: 'fixed output',
          artifacts: [],
        }
      },
    }
    const gate: WorkflowPhase = {
      id: 'b',
      name: 'Verification',
      description: 'gates',
      run: async () => ({
        id: 'b',
        name: 'Verification',
        description: '',
        status: 'failed',
        output: 'always fails',
        artifacts: [],
        error: 'stubborn',
      }),
    }
    const workflow: WorkflowDefinition = {
      id: 'test',
      name: 'Test workflow',
      description: '',
      phases: [fixer, gate],
      healWith: { b: 'a' },
    }

    const attempts: string[] = []
    const engine = new WorkflowEngine()
    const ctx = makeContext('test prompt')
    const result = await engine.run(workflow, ctx, {
      maxAttempts: 2,
      onPhaseStart: (phase, attempt) => attempts.push(`${phase.id}:${attempt}`),
    })

    expect(result.status).toBe('failed')
    // 2 attempts of the gate; the fixer ran once initially + once as the heal
    // re-run, then the gate exhausted its attempts.
    expect(attempts).toEqual(['a:1', 'b:1', 'a:2', 'b:2'])
    expect(fixerRuns).toBe(2)
    expect(result.phases.find(p => p.id === 'b')?.status).toBe('failed')
  })
})
