import { codeReviewPhase } from '../../src/workflows/phases/codeReviewPhase'
import type { WorkflowContext, PhaseResult, WorkflowArtifact } from '../../src/adapters/types'
import type { ModelRouter } from '../../src/model/ModelRouter'
import type { ModelRequest } from '../../src/model/types'
import { createTempProject, cleanup } from '../helpers/tmp'

function makeContext(
  overrides: Partial<WorkflowContext['state']> = {},
  modelRouter: WorkflowContext['modelRouter'] = {} as WorkflowContext['modelRouter'],
  projectRoot: string = '/tmp'
): WorkflowContext {
  return {
    projectRoot,
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
    modelRouter,
  }
}

function mockRouter(content: string): ModelRouter {
  return {
    generate: jest.fn(async () => ({ content, provider: 'test' })),
  } as unknown as ModelRouter
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

  it('surfaces LLM findings and gates on LLM error severity', async () => {
    const router = mockRouter(JSON.stringify({
      verdict: 'changes-requested',
      summary: 'Effect leaks memory',
      findings: [
        { severity: 'error', rule: 'effect-leak', message: 'Missing cleanup function', line: 4, suggestion: 'Return a cleanup fn' },
      ],
    }))
    const ctx = makeContext({
      phases: [
        phase('implementation', 'Implementation', [
          {
            type: 'engineering',
            title: 'Screen.tsx',
            content: 'export function Screen() { useEffect(() => {}) }',
            path: 'src/screens/Screen.tsx',
          },
        ]),
      ],
    }, router)

    const result = await codeReviewPhase.run(ctx)

    expect(result.status).toBe('failed')
    expect(result.output).toContain('effect-leak')
    expect(result.output).toContain('Missing cleanup function')
    expect(result.output).toContain('LLM')
  })

  it('falls back to rule-based findings when the model is unavailable', async () => {
    const router = mockRouter('[Local model fallback: no downloaded model or inference failed.]')
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
    }, router)

    const result = await codeReviewPhase.run(ctx)

    expect(result.status).toBe('completed')
    expect(result.output).toContain('no-console-log')
    expect(result.output).toContain('rule-based')
  })

  it('passes when the LLM approves clean code', async () => {
    const router = mockRouter(JSON.stringify({
      verdict: 'approved',
      summary: 'Clean code',
      findings: [],
    }))
    const ctx = makeContext({
      phases: [
        phase('implementation', 'Implementation', [
          {
            type: 'engineering',
            title: 'Clean.ts',
            content: 'export const clean = 1',
            path: 'src/Clean.ts',
          },
        ]),
      ],
    }, router)

    const result = await codeReviewPhase.run(ctx)

    expect(result.status).toBe('completed')
    expect(result.output).toContain('**LLM review:** ✅ approved')
  })

  it('self-heals: feeds error findings back, rewrites the file, and re-reviews to pass', async () => {
    const dir = createTempProject({})
    try {
      // Review 1 finds an error; fix returns corrected code; review 2 approves.
      let call = 0
      const router = {
        generate: jest.fn(async () => {
          call++
          if (call === 1) {
            return {
              content: JSON.stringify({
                verdict: 'changes-requested',
                summary: 'Uses any',
                findings: [{ severity: 'error', rule: 'no-any', message: 'Avoid any', line: 1 }],
              }),
              provider: 'test',
            }
          }
          if (call === 2) {
            return { content: 'const value: number = 1', provider: 'test' }
          }
          return {
            content: JSON.stringify({ verdict: 'approved', summary: 'Fixed', findings: [] }),
            provider: 'test',
          }
        }),
      } as unknown as ModelRouter

      const ctx = makeContext({
        phases: [
          phase('implementation', 'Implementation', [
            {
              type: 'engineering',
              title: 'Bad.ts',
              content: 'const value: any = 1',
              path: 'src/Bad.ts',
            },
          ]),
        ],
      }, router, dir)

      const result = await codeReviewPhase.run(ctx)

      expect(result.status).toBe('completed')
      expect(result.output).toContain('Self-healing')
      expect(result.output).toContain('fixed 1 error finding(s)')
      expect(result.output).toContain('**LLM review:** ✅ approved')
    } finally {
      cleanup(dir)
    }
  })

  it('self-heals error findings in TEST files and syncs their artifact content', async () => {
    const dir = createTempProject({})
    try {
      // Distinguish review calls from fix calls by the prompt marker: fixes
      // receive the '# Findings to resolve' header. Once a fix is applied the
      // mock flips a flag so the re-review approves — modeling the fix actually
      // resolving the issue. The test artifact's error must be healed and its
      // inline content synced so re-review sees it (previously only
      // implementation artifacts were synced).
      let fixed = false
      const router = {
        generate: jest.fn(async (req: ModelRequest) => {
          const prompt = req.prompt || ''
          if (prompt.includes('# Findings to resolve')) {
            fixed = true
            return { content: 'const value: number = 1', provider: 'test' }
          }
          if (prompt.includes('Bad.test.ts')) {
            return fixed
              ? { content: JSON.stringify({ verdict: 'approved', summary: 'Fixed', findings: [] }), provider: 'test' }
              : {
                  content: JSON.stringify({
                    verdict: 'changes-requested',
                    summary: 'Test uses any',
                    findings: [{ severity: 'error', rule: 'no-any', message: 'Avoid any in tests', line: 1 }],
                  }),
                  provider: 'test',
                }
          }
          return {
            content: JSON.stringify({ verdict: 'approved', summary: 'Clean', findings: [] }),
            provider: 'test',
          }
        }),
      } as unknown as ModelRouter

      const ctx = makeContext({
        phases: [
          phase('implementation', 'Implementation', [
            { type: 'engineering', title: 'Bad.ts', content: 'const value = 1', path: 'src/Bad.ts' },
          ]),
          phase('tests', 'Test writing', [
            { type: 'qa', title: 'Bad.test.ts', content: 'const value: any = 1', path: 'src/__tests__/Bad.test.ts' },
          ]),
        ],
      }, router, dir)

      const result = await codeReviewPhase.run(ctx)

      expect(result.status).toBe('completed')
      expect(result.output).toContain('Self-healing')
      // The test artifact's inline content must reflect the fix so re-review and
      // downstream phases see the corrected test.
      const testArtifact = ctx.state.phases.find(p => p.id === 'tests')?.artifacts[0]
      expect(testArtifact?.content).toBe('const value: number = 1')
    } finally {
      cleanup(dir)
    }
  })

  it('fails after max attempts when the model cannot clear the errors', async () => {
    const dir = createTempProject({})
    try {
      // Review always finds the error; the fix returns plausible code that still
      // contains the violation, so the loop must exhaust MAX_REVIEW_ATTEMPTS.
      // Original content is '...any = 0' so each fix ('...1', '...2') differs
      // from the current content and gets applied — otherwise the identical
      // fix would be skipped and the loop would break early.
      let fixCall = 0
      const router = {
        generate: jest.fn(async (req: ModelRequest) => {
          const prompt = req.prompt || ''
          if (prompt.includes('# Findings to resolve')) {
            fixCall++
            // Still broken: keeps the any type so re-review fails again.
            return { content: `const value: any = ${fixCall}`, provider: 'test' }
          }
          return {
            content: JSON.stringify({
              verdict: 'changes-requested',
              summary: 'Still broken',
              findings: [{ severity: 'error', rule: 'no-any', message: 'Avoid any', line: 1 }],
            }),
            provider: 'test',
          }
        }),
      } as unknown as ModelRouter

      const ctx = makeContext({
        phases: [
          phase('implementation', 'Implementation', [
            {
              type: 'engineering',
              title: 'Bad.ts',
              content: 'const value: any = 0',
              path: 'src/Bad.ts',
            },
          ]),
        ],
      }, router, dir)

      const result = await codeReviewPhase.run(ctx)

      expect(result.status).toBe('failed')
      expect(result.output).toContain('no-any')
      expect(result.output).toContain('Self-healing')
      // Attempt cap reached: the fix was attempted on attempts 1 and 2.
      expect(fixCall).toBe(2)
      // The failed heal must restore the original implementation to disk so the
      // repo isn't left with the model's last broken fix.
      expect(result.output).toContain('restoring original file contents')
    } finally {
      cleanup(dir)
    }
  })

  it('rejects non-code garbage fixes and does not overwrite the file', async () => {
    const dir = createTempProject({})
    try {
      // The review finds an error, but the "fix" is prose with no code-like
      // structure — it must be rejected so the real file is never overwritten.
      let fixCall = 0
      const router = {
        generate: jest.fn(async (req: ModelRequest) => {
          const prompt = req.prompt || ''
          if (prompt.includes('# Findings to resolve')) {
            fixCall++
            return { content: 'Here is my fix, I hope this helps!', provider: 'test' }
          }
          return {
            content: JSON.stringify({
              verdict: 'changes-requested',
              summary: 'Uses any',
              findings: [{ severity: 'error', rule: 'no-any', message: 'Avoid any', line: 1 }],
            }),
            provider: 'test',
          }
        }),
      } as unknown as ModelRouter

      const ctx = makeContext({
        phases: [
          phase('implementation', 'Implementation', [
            {
              type: 'engineering',
              title: 'Bad.ts',
              content: 'const value: any = 0',
              path: 'src/Bad.ts',
            },
          ]),
        ],
      }, router, dir)

      const result = await codeReviewPhase.run(ctx)

      expect(result.status).toBe('failed')
      expect(result.output).toContain('No files could be auto-fixed')
      // Prose never reached the disk: the fix was attempted once then abandoned.
      expect(fixCall).toBe(1)
    } finally {
      cleanup(dir)
    }
  })
})
