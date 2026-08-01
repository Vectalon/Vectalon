import { codeReviewPhase } from '../../src/workflows/phases/codeReviewPhase'
import type { WorkflowContext, PhaseResult, WorkflowArtifact } from '../../src/adapters/types'

function makeContext(overrides: Partial<WorkflowContext['state']> = {}): WorkflowContext {
  return {
    projectRoot: '/tmp',
    snapshot: null,
    prompt: 'Login',
    inputs: {},
    outputs: {},
    state: {
      id: 'test',
      workflowId: 'feature-development',
      prompt: 'Login',
      status: 'running',
      phases: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides,
    },
    adapters: {} as WorkflowContext['adapters'],
    modelRouter: {} as WorkflowContext['modelRouter'],
  }
}

function phase(id: string, name: string, artifacts: WorkflowArtifact[], status: PhaseResult['status'] = 'completed'): PhaseResult {
  return {
    id,
    name,
    description: name,
    status,
    output: '',
    artifacts,
  }
}

describe('codeReviewPhase', () => {
  it('passes clean code with no findings', async () => {
    const ctx = makeContext({
      phases: [
        phase('tests', 'Test writing', [{ type: 'qa', title: 'Login.ts', content: "it('works', () => { expect(1).toBe(1) })", path: 'src/__tests__/Login.ts' }]),
        phase('implementation', 'Implementation', [
          {
            type: 'engineering',
            title: 'LoginApi.ts',
            content: 'export class LoginApi { async execute() { return "ok" } }',
            path: 'src/services/LoginApi.ts',
          },
        ]),
      ],
    })

    const result = await codeReviewPhase.run(ctx)

    expect(result.status).toBe('completed')
    expect(result.output).toContain('All files passed code review')
    expect(result.output).toContain('0 error(s)')
  })

  it('fails when the generated code has error-severity findings', async () => {
    const ctx = makeContext({
      phases: [
        phase('tests', 'Test writing', []),
        phase('implementation', 'Implementation', [
          {
            type: 'engineering',
            title: 'Bad.ts',
            content: 'export function bad() {\n  try { return 1 } catch (err) {}\n}',
            path: 'src/Bad.ts',
          },
        ]),
      ],
    })

    const result = await codeReviewPhase.run(ctx)

    expect(result.status).toBe('failed')
    expect(result.output).toContain('no-empty-catch')
  })

  it('reviews inline artifact content without requiring files on disk', async () => {
    const ctx = makeContext({
      phases: [
        phase('implementation', 'Implementation', [
          {
            type: 'engineering',
            title: 'Logger.ts',
            content: 'export function log() { console.log("hi") }',
            path: 'src/Logger.ts',
          },
        ]),
      ],
    })

    const result = await codeReviewPhase.run(ctx)

    expect(result.status).toBe('completed')
    expect(result.output).toContain('no-console-log')
  })

  it('fails when no implementation phase exists', async () => {
    const ctx = makeContext({ phases: [] })
    const result = await codeReviewPhase.run(ctx)

    expect(result.status).toBe('failed')
    expect(result.output).toContain('No implementation phase found')
  })
})
