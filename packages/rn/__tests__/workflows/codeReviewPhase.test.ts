import { readFileSync } from 'fs'
import { join } from 'path'
import { codeReviewPhase } from '../../src/workflows/phases/codeReviewPhase'
import type { WorkflowContext, PhaseResult, WorkflowArtifact, TestRunnerAdapter } from '../../src/adapters/types'
import type { ModelRouter } from '../../src/model/ModelRouter'
import type { ModelRequest } from '../../src/model/types'
import { createTempProject, cleanup } from '../helpers/tmp'

function makeContext(
  overrides: Partial<WorkflowContext['state']> = {},
  modelRouter: WorkflowContext['modelRouter'] = {} as WorkflowContext['modelRouter'],
  projectRoot: string = '/tmp',
  extra: Partial<Pick<WorkflowContext, 'inputs' | 'adapters' | 'onHealFix'>> = {}
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
    ...extra,
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
      expect(result.output).toContain('fixed 1 finding(s)')
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

  it('appends the deterministic performance-budget section to the report', async () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', version: '1.0.0', dependencies: { leftpad: '^1.0.0' } }),
      // Installed dep without `sideEffects: false` → tree-shaking info finding.
      'node_modules/leftpad/package.json': JSON.stringify({ name: 'leftpad', version: '1.0.0' }),
    })
    try {
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
      }, {} as WorkflowContext['modelRouter'], dir)

      const result = await codeReviewPhase.run(ctx)

      expect(result.status).toBe('completed')
      expect(result.output).toContain('## Performance budgets')
      expect(result.output).toContain('missing-side-effects')
      expect(result.output).toContain('leftpad')
      // Budget findings are informational — they never fail the phase on their own.
      expect(result.status).toBe('completed')
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

  it('honors policy maxAttempts via inputs and stops healing early', async () => {
    const dir = createTempProject({})
    try {
      let fixCall = 0
      const router = {
        generate: jest.fn(async (req: ModelRequest) => {
          const prompt = req.prompt || ''
          if (prompt.includes('# Findings to resolve')) {
            fixCall++
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
      }, router, dir, { inputs: { maxAttempts: 1 } })

      const result = await codeReviewPhase.run(ctx)

      expect(result.status).toBe('failed')
      // With maxAttempts=1 the review runs once and gives up before healing.
      expect(fixCall).toBe(0)
      expect(result.output).toContain('1 attempt(s)')
    } finally {
      cleanup(dir)
    }
  })

  it('heals warnings when healSeverity is warning', async () => {
    const dir = createTempProject({})
    try {
      // First review flags a warning only; after the heal the review approves.
      let reviewed = 0
      let fixCall = 0
      const router = {
        generate: jest.fn(async (req: ModelRequest) => {
          const prompt = req.prompt || ''
          if (prompt.includes('# Findings to resolve')) {
            fixCall++
            return { content: 'const style = StyleSheet.create({})', provider: 'test' }
          }
          reviewed++
          return reviewed === 1
            ? {
                content: JSON.stringify({
                  verdict: 'changes-requested',
                  summary: 'Inline style',
                  // Warning only: with default severity this would not heal.
                  findings: [{ severity: 'warning', rule: 'inline-style', message: 'Use StyleSheet', line: 1 }],
                }),
                provider: 'test',
              }
            : {
                content: JSON.stringify({ verdict: 'approved', summary: 'Clean', findings: [] }),
                provider: 'test',
              }
        }),
      } as unknown as ModelRouter

      const ctx = makeContext({
        phases: [
          phase('implementation', 'Implementation', [
            {
              type: 'engineering',
              title: 'Bad.tsx',
              // Real JSX inline style so the LLM inline-style finding is
              // supported by the code (the hallucination guard verifies it).
              content: 'export function Bad() { return <View style={{ color: "red" }} /> }',
              path: 'src/Bad.tsx',
            },
          ]),
        ],
      }, router, dir, { inputs: { healSeverity: 'warning' } })

      const result = await codeReviewPhase.run(ctx)

      expect(result.status).toBe('completed')
      expect(fixCall).toBe(1)
      expect(result.output).toContain('severity ≥ warning')
      expect(result.output).toContain('fixed 1 finding(s)')
    } finally {
      cleanup(dir)
    }
  })

  it('runs lint/typecheck tool checks and heals reported errors', async () => {
    const dir = createTempProject({})
    try {
      let lintCalls = 0
      let fixCall = 0
      const testRunner: TestRunnerAdapter = {
        name: 'test',
        runTests: jest.fn(async () => ({ success: true, stdout: '', stderr: '', exitCode: 0 })),
        runLint: jest.fn(async () => {
          lintCalls++
          // First run reports an error in the generated file; after the heal
          // writes a fix, the re-run passes.
          return lintCalls === 1
            ? { success: false, stdout: 'src/Bad.ts:2:1 - error: avoid any (no-any)\n', stderr: '', exitCode: 1 }
            : { success: true, stdout: '', stderr: '', exitCode: 0 }
        }),
        runTypeCheck: jest.fn(async () => ({ success: true, stdout: '', stderr: '', exitCode: 0 })),
      }
      const router = {
        generate: jest.fn(async (req: ModelRequest) => {
          const prompt = req.prompt || ''
          if (prompt.includes('# Findings to resolve')) {
            fixCall++
            return { content: 'const value: number = 1', provider: 'test' }
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
            {
              type: 'engineering',
              title: 'Bad.ts',
              content: 'const value: any = 1',
              path: 'src/Bad.ts',
            },
          ]),
        ],
      }, router, dir, { adapters: { testRunner } as WorkflowContext['adapters'] })

      const result = await codeReviewPhase.run(ctx)

      expect(result.status).toBe('completed')
      expect(lintCalls).toBeGreaterThanOrEqual(2)
      expect(fixCall).toBe(1)
      expect(result.output).toContain('Tool check attempt')
    } finally {
      cleanup(dir)
    }
  })

  it('fails when tool errors exist outside generated files and are not healable', async () => {
    const dir = createTempProject({})
    try {
      let fixCall = 0
      const testRunner: TestRunnerAdapter = {
        name: 'test',
        runTests: jest.fn(async () => ({ success: true, stdout: '', stderr: '', exitCode: 0 })),
        runLint: jest.fn(async () => ({
          success: false,
          stdout: 'src/unrelated/legacy.js:4:1 - error: unexpected var (no-var)\n',
          stderr: '',
          exitCode: 1,
        })),
        runTypeCheck: jest.fn(async () => ({ success: true, stdout: '', stderr: '', exitCode: 0 })),
      }
      const router = {
        generate: jest.fn(async (req: ModelRequest) => {
          const prompt = req.prompt || ''
          if (prompt.includes('# Findings to resolve')) {
            fixCall++
            return { content: 'const value: number = 1', provider: 'test' }
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
            {
              type: 'engineering',
              title: 'Bad.ts',
              content: 'const value: any = 1',
              path: 'src/Bad.ts',
            },
          ]),
        ],
      }, router, dir, { adapters: { testRunner } as WorkflowContext['adapters'] })

      const result = await codeReviewPhase.run(ctx)

      // The lint error is in a file the workflow did not generate, so it cannot
      // be healed — the phase reports it (verification gates on lint anyway)
      // rather than failing code review on pre-existing lint debt.
      expect(result.status).toBe('completed')
      expect(fixCall).toBe(0)
      expect(result.output).toContain('outside generated files')
    } finally {
      cleanup(dir)
    }
  })

  it('skips tool checks entirely when policy toolChecks is false', async () => {
    const dir = createTempProject({ '.vectalon/policy.json': JSON.stringify({ version: 1, codeReview: { toolChecks: false } }) })
    try {
      const testRunner: TestRunnerAdapter = {
        name: 'test',
        runTests: jest.fn(async () => ({ success: true, stdout: '', stderr: '', exitCode: 0 })),
        runLint: jest.fn(async () => ({
          success: false,
          stdout: 'src/Bad.ts:2:1 - error: avoid any (no-any)\n',
          stderr: '',
          exitCode: 1,
        })),
        runTypeCheck: jest.fn(async () => ({ success: true, stdout: '', stderr: '', exitCode: 0 })),
      }
      const router = {
        generate: jest.fn(async () => ({
          content: JSON.stringify({ verdict: 'approved', summary: 'Clean', findings: [] }),
          provider: 'test',
        })),
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
      }, router, dir, { adapters: { testRunner } as WorkflowContext['adapters'] })

      const result = await codeReviewPhase.run(ctx)

      expect(result.status).toBe('completed')
      // toolChecks off means lint never runs, so a failing lint is ignored.
      expect(result.output).toContain('tool checks off')
    } finally {
      cleanup(dir)
    }
  })

  it('rejects a fix when the interactive hook says reject', async () => {
    const dir = createTempProject({})
    try {
      let fixCall = 0
      const router = {
        generate: jest.fn(async (req: ModelRequest) => {
          const prompt = req.prompt || ''
          if (prompt.includes('# Findings to resolve')) {
            fixCall++
            return { content: 'const value: number = 1', provider: 'test' }
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
      }, router, dir, { onHealFix: jest.fn(async () => 'reject' as const) })

      const result = await codeReviewPhase.run(ctx)

      expect(result.status).toBe('failed')
      expect(fixCall).toBe(1)
      expect(result.output).toContain('fix rejected by user')
    } finally {
      cleanup(dir)
    }
  })

  it('accepts a fix that clears type errors (compile gate)', async () => {
    const dir = createTempProject({})
    try {
      // Baseline typecheck reports 1 error in the file; the model fix makes
      // it compile clean, so the gate accepts (1 → 0) and the phase passes.
      let typecheckCalls = 0
      let fixCall = 0
      const testRunner: TestRunnerAdapter = {
        name: 'test',
        runTests: jest.fn(async () => ({ success: true, stdout: '', stderr: '', exitCode: 0 })),
        runLint: jest.fn(async () => ({ success: true, stdout: '', stderr: '', exitCode: 0 })),
        runTypeCheck: jest.fn(async () => {
          typecheckCalls++
          // Baseline (call 1) fails with 1 error; after the fix it passes.
          return typecheckCalls === 1
            ? { success: false, stdout: 'src/Bad.ts(2,5): error TS2322: Type \'string\' is not assignable to type \'number\'.\n', stderr: '', exitCode: 1 }
            : { success: true, stdout: '', stderr: '', exitCode: 0 }
        }),
      }
      const router = {
        generate: jest.fn(async (req: ModelRequest) => {
          const prompt = req.prompt || ''
          if (prompt.includes('# Findings to resolve')) {
            fixCall++
            return { content: 'const value: number = 1', provider: 'test' }
          }
          return prompt.includes('Bad.ts')
            ? fixCall > 0
              ? { content: JSON.stringify({ verdict: 'approved', summary: 'Fixed', findings: [] }), provider: 'test' }
              : {
                  content: JSON.stringify({
                    verdict: 'changes-requested',
                    summary: 'Uses any',
                    findings: [{ severity: 'error', rule: 'no-any', message: 'Avoid any', line: 1 }],
                  }),
                  provider: 'test',
                }
            : { content: JSON.stringify({ verdict: 'approved', summary: 'Clean', findings: [] }), provider: 'test' }
        }),
      } as unknown as ModelRouter

      const ctx = makeContext({
        phases: [
          phase('implementation', 'Implementation', [
            {
              type: 'engineering',
              title: 'Bad.ts',
              content: 'const value: any = "x"',
              path: 'src/Bad.ts',
            },
          ]),
        ],
      }, router, dir, { adapters: { testRunner } as WorkflowContext['adapters'] })

      const result = await codeReviewPhase.run(ctx)

      expect(result.status).toBe('completed')
      expect(fixCall).toBe(1)
      expect(result.output).toContain('compile gate: 1 → 0 type error(s)')
      // The accepted fix is on disk.
      expect(readFileSync(join(dir, 'src/Bad.ts'), 'utf-8')).toBe('const value: number = 1')
    } finally {
      cleanup(dir)
    }
  })

  it('rejects a fix that makes type errors worse and reverts the file (compile gate)', async () => {
    const dir = createTempProject({})
    try {
      // Baseline is clean (0 errors); the model fix introduces a type error,
      // so the gate rejects it (0 → 1), reverts to the original, and caps the
      // file so the loop never churns on it again.
      let typecheckCalls = 0
      let fixCall = 0
      const testRunner: TestRunnerAdapter = {
        name: 'test',
        runTests: jest.fn(async () => ({ success: true, stdout: '', stderr: '', exitCode: 0 })),
        runLint: jest.fn(async () => ({ success: true, stdout: '', stderr: '', exitCode: 0 })),
        runTypeCheck: jest.fn(async () => {
          typecheckCalls++
          // Baseline (call 1) passes; after the bad fix it fails with 1 error.
          return typecheckCalls === 1
            ? { success: true, stdout: '', stderr: '', exitCode: 0 }
            : { success: false, stdout: 'src/Bad.ts(2,5): error TS2322: Type \'string\' is not assignable to type \'number\'.\n', stderr: '', exitCode: 1 }
        }),
      }
      const router = {
        generate: jest.fn(async (req: ModelRequest) => {
          const prompt = req.prompt || ''
          if (prompt.includes('# Findings to resolve')) {
            fixCall++
            return { content: 'const value: number = "x"', provider: 'test' }
          }
          return prompt.includes('Bad.ts')
            ? {
                content: JSON.stringify({
                  verdict: 'changes-requested',
                  summary: 'Uses any',
                  findings: [{ severity: 'error', rule: 'no-any', message: 'Avoid any', line: 1 }],
                }),
                provider: 'test',
              }
            : { content: JSON.stringify({ verdict: 'approved', summary: 'Clean', findings: [] }), provider: 'test' }
        }),
      } as unknown as ModelRouter

      const ctx = makeContext({
        phases: [
          phase('implementation', 'Implementation', [
            {
              type: 'engineering',
              title: 'Bad.ts',
              content: 'const value: any = "x"',
              path: 'src/Bad.ts',
            },
          ]),
        ],
      }, router, dir, { adapters: { testRunner } as WorkflowContext['adapters'] })

      const result = await codeReviewPhase.run(ctx)

      expect(result.status).toBe('failed')
      expect(fixCall).toBe(1)
      expect(result.output).toContain('fix rejected by compile gate (0 → 1 type error(s)); reverted')
      expect(result.output).toContain('No files could be auto-fixed')
      // The file was reverted to the original content.
      expect(readFileSync(join(dir, 'src/Bad.ts'), 'utf-8')).toBe('const value: any = "x"')
    } finally {
      cleanup(dir)
    }
  })

  it('caps a file after a rejected fix: never re-heals it in later attempts', async () => {
    const dir = createTempProject({})
    try {
      // Both files fail review with an error finding. A's fix makes type
      // errors worse (rejected + capped); B's fix compiles clean (accepted),
      // so the heal loop continues. On the next heal attempt, capped A is
      // skipped without calling the model again.
      let typecheckCalls = 0
      const fixCalls: string[] = []
      let bFixed = false
      const testRunner: TestRunnerAdapter = {
        name: 'test',
        runTests: jest.fn(async () => ({ success: true, stdout: '', stderr: '', exitCode: 0 })),
        runLint: jest.fn(async () => ({ success: true, stdout: '', stderr: '', exitCode: 0 })),
        runTypeCheck: jest.fn(async () => {
          typecheckCalls++
          if (typecheckCalls === 1 || typecheckCalls === 4) return { success: true, stdout: '', stderr: '', exitCode: 0 }
          if (typecheckCalls === 2) {
            // After A's fix: fails with an error in A.ts.
            return { success: false, stdout: 'src/A.ts(2,5): error TS2322: Type \'string\' is not assignable to type \'number\'.\n', stderr: '', exitCode: 1 }
          }
          // After B's fix: passes.
          return { success: true, stdout: '', stderr: '', exitCode: 0 }
        }),
      }
      const router = {
        generate: jest.fn(async (req: ModelRequest) => {
          const prompt = req.prompt || ''
          if (prompt.includes('# Findings to resolve')) {
            if (prompt.includes('src/A.ts')) fixCalls.push('A')
            if (prompt.includes('src/B.ts')) {
              fixCalls.push('B')
              bFixed = true
            }
            return prompt.includes('src/A.ts')
              ? { content: 'export const a: number = "x"', provider: 'test' }
              : { content: 'export const b: number = 2', provider: 'test' }
          }
          // Review calls: A always flagged; B only until its fix lands.
          const findings = { verdict: 'changes-requested', summary: 'Uses any', findings: [{ severity: 'error', rule: 'no-any', message: 'Avoid any', line: 1 }] }
          return {
            content: JSON.stringify(prompt.includes('src/A.ts') || !bFixed ? findings : { verdict: 'approved', summary: 'Clean', findings: [] }),
            provider: 'test',
          }
        }),
      } as unknown as ModelRouter

      const ctx = makeContext({
        phases: [
          phase('implementation', 'Implementation', [
            { type: 'engineering', title: 'A.ts', content: 'export const a: any = 1', path: 'src/A.ts' },
            { type: 'engineering', title: 'B.ts', content: 'export const b: any = 2', path: 'src/B.ts' },
          ]),
        ],
      }, router, dir, { adapters: { testRunner } as WorkflowContext['adapters'] })

      const result = await codeReviewPhase.run(ctx)

      expect(result.status).toBe('failed')
      // A was attempted once and never again despite its finding persisting.
      expect(fixCalls).toEqual(['A', 'B'])
      expect(result.output).toContain('fix rejected by compile gate (0 → 1 type error(s)); reverted')
      expect(result.output).toContain('skipped (previous fix failed the compile gate)')
      // A reverted to original; B was accepted then restored to original when
      // the phase ultimately failed (A's finding persisted).
      expect(readFileSync(join(dir, 'src/A.ts'), 'utf-8')).toBe('export const a: any = 1')
      expect(readFileSync(join(dir, 'src/B.ts'), 'utf-8')).toBe('export const b: any = 2')
    } finally {
      cleanup(dir)
    }
  })

  it('rejects a fix that makes no typecheck progress (same error count)', async () => {
    const dir = createTempProject({})
    try {
      // Baseline already has 1 error; the model fix leaves it at 1 (fixes one
      // error, introduces another) — no compile progress, so the gate rejects
      // it rather than letting the heal loop churn on an unfixable file.
      let fixCall = 0
      const testRunner: TestRunnerAdapter = {
        name: 'test',
        runTests: jest.fn(async () => ({ success: true, stdout: '', stderr: '', exitCode: 0 })),
        runLint: jest.fn(async () => ({ success: true, stdout: '', stderr: '', exitCode: 0 })),
        runTypeCheck: jest.fn(async () => ({
          success: false,
          stdout: 'src/Bad.ts(2,5): error TS2322: Type \'string\' is not assignable to type \'number\'.\n',
          stderr: '',
          exitCode: 1,
        })),
      }
      const router = {
        generate: jest.fn(async (req: ModelRequest) => {
          const prompt = req.prompt || ''
          if (prompt.includes('# Findings to resolve')) {
            fixCall++
            return { content: 'const value: number = "x"', provider: 'test' }
          }
          return prompt.includes('Bad.ts')
            ? {
                content: JSON.stringify({
                  verdict: 'changes-requested',
                  summary: 'Uses any',
                  findings: [{ severity: 'error', rule: 'no-any', message: 'Avoid any', line: 1 }],
                }),
                provider: 'test',
              }
            : { content: JSON.stringify({ verdict: 'approved', summary: 'Clean', findings: [] }), provider: 'test' }
        }),
      } as unknown as ModelRouter

      const ctx = makeContext({
        phases: [
          phase('implementation', 'Implementation', [
            {
              type: 'engineering',
              title: 'Bad.ts',
              content: 'const value: any = "x"',
              path: 'src/Bad.ts',
            },
          ]),
        ],
      }, router, dir, { adapters: { testRunner } as WorkflowContext['adapters'] })

      const result = await codeReviewPhase.run(ctx)

      expect(result.status).toBe('failed')
      expect(fixCall).toBe(1)
      expect(result.output).toContain('no progress); reverted')
      expect(readFileSync(join(dir, 'src/Bad.ts'), 'utf-8')).toBe('const value: any = "x"')
    } finally {
      cleanup(dir)
    }
  })

  it('reverts and caps when the typecheck becomes unavailable mid-heal', async () => {
    const dir = createTempProject({})
    try {
      // Baseline succeeds; the verification typecheck after writing the fix
      // throws (e.g. tsc binary disappears). The gate must treat that as
      // "cannot verify" — revert, cap, and keep the loop honest.
      let fixCall = 0
      let typecheckCalls = 0
      const testRunner: TestRunnerAdapter = {
        name: 'test',
        runTests: jest.fn(async () => ({ success: true, stdout: '', stderr: '', exitCode: 0 })),
        runLint: jest.fn(async () => ({ success: true, stdout: '', stderr: '', exitCode: 0 })),
        runTypeCheck: jest.fn(async () => {
          typecheckCalls++
          // Baseline (call 1) succeeds; the post-fix verification crashes.
          if (typecheckCalls === 1) return { success: true, stdout: '', stderr: '', exitCode: 0 }
          throw new Error('tsc crashed')
        }),
      }
      const router = {
        generate: jest.fn(async (req: ModelRequest) => {
          const prompt = req.prompt || ''
          if (prompt.includes('# Findings to resolve')) {
            fixCall++
            return { content: 'const value: number = 1', provider: 'test' }
          }
          return prompt.includes('Bad.ts')
            ? {
                content: JSON.stringify({
                  verdict: 'changes-requested',
                  summary: 'Uses any',
                  findings: [{ severity: 'error', rule: 'no-any', message: 'Avoid any', line: 1 }],
                }),
                provider: 'test',
              }
            : { content: JSON.stringify({ verdict: 'approved', summary: 'Clean', findings: [] }), provider: 'test' }
        }),
      } as unknown as ModelRouter

      const ctx = makeContext({
        phases: [
          phase('implementation', 'Implementation', [
            {
              type: 'engineering',
              title: 'Bad.ts',
              content: 'const value: any = "x"',
              path: 'src/Bad.ts',
            },
          ]),
        ],
      }, router, dir, { adapters: { testRunner } as WorkflowContext['adapters'] })

      const result = await codeReviewPhase.run(ctx)

      expect(result.status).toBe('failed')
      expect(fixCall).toBe(1)
      expect(result.output).toContain('compile gate unavailable')
      expect(result.output).toContain('reverted')
      expect(readFileSync(join(dir, 'src/Bad.ts'), 'utf-8')).toBe('const value: any = "x"')
    } finally {
      cleanup(dir)
    }
  })

  it('falls back to trusting fixes when the project has no typecheck script', async () => {
    const dir = createTempProject({})
    try {
      // No runTypeCheck on the runner → compile gate is off; heals trust the
      // model fix exactly as before, and the report says so.
      let fixCall = 0
      const testRunner: TestRunnerAdapter = {
        name: 'test',
        runTests: jest.fn(async () => ({ success: true, stdout: '', stderr: '', exitCode: 0 })),
        runLint: jest.fn(async () => ({ success: true, stdout: '', stderr: '', exitCode: 0 })),
      } as TestRunnerAdapter
      const router = {
        generate: jest.fn(async (req: ModelRequest) => {
          const prompt = req.prompt || ''
          if (prompt.includes('# Findings to resolve')) {
            fixCall++
            return { content: 'const value: number = 1', provider: 'test' }
          }
          return prompt.includes('Bad.ts')
            ? fixCall > 0
              ? { content: JSON.stringify({ verdict: 'approved', summary: 'Fixed', findings: [] }), provider: 'test' }
              : {
                  content: JSON.stringify({
                    verdict: 'changes-requested',
                    summary: 'Uses any',
                    findings: [{ severity: 'error', rule: 'no-any', message: 'Avoid any', line: 1 }],
                  }),
                  provider: 'test',
                }
            : { content: JSON.stringify({ verdict: 'approved', summary: 'Clean', findings: [] }), provider: 'test' }
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
      }, router, dir, { adapters: { testRunner } as WorkflowContext['adapters'] })

      const result = await codeReviewPhase.run(ctx)

      expect(result.status).toBe('completed')
      expect(fixCall).toBe(1)
      expect(result.output).toContain('compile gate off')
      expect(result.output).toContain('fixed 1 finding(s)')
      expect(readFileSync(join(dir, 'src/Bad.ts'), 'utf-8')).toBe('const value: number = 1')
    } finally {
      cleanup(dir)
    }
  })

  it('retries when the interactive hook says retry, then accepts', async () => {
    const dir = createTempProject({})
    try {
      let fixed = false
      let fixCall = 0
      const router = {
        generate: jest.fn(async (req: ModelRequest) => {
          const prompt = req.prompt || ''
          if (prompt.includes('# Findings to resolve')) {
            fixCall++
            fixed = true
            return { content: `const value: number = ${fixCall}`, provider: 'test' }
          }
          return prompt.includes('Bad.ts')
            ? fixed
              ? {
                  content: JSON.stringify({ verdict: 'approved', summary: 'Clean', findings: [] }),
                  provider: 'test',
                }
              : {
                  content: JSON.stringify({
                    verdict: 'changes-requested',
                    summary: 'Uses any',
                    findings: [{ severity: 'error', rule: 'no-any', message: 'Avoid any', line: 1 }],
                  }),
                  provider: 'test',
                }
            : {
                content: JSON.stringify({ verdict: 'approved', summary: 'Clean', findings: [] }),
                provider: 'test',
              }
        }),
      } as unknown as ModelRouter

      const decisions: string[] = ['retry', 'accept']
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
      }, router, dir, { onHealFix: jest.fn(async () => decisions.shift() as 'retry' | 'accept') })

      const result = await codeReviewPhase.run(ctx)

      expect(result.status).toBe('completed')
      expect(fixCall).toBe(2)
    } finally {
      cleanup(dir)
    }
  })
})
