import { readFileSync } from 'fs'
import { leaderboardCommand } from '../../src/cli/commands/leaderboard'
import { createTempProject, cleanup } from '../helpers/tmp'

const summary = (overall: number): Record<string, unknown> => ({
  specVersion: 1,
  runs: [
    {
      id: 'rn-01-login-screen',
      title: 'Login screen',
      suite: 'forms-security',
      scaffoldable: true,
      generatedFiles: [],
      guardrail: [],
      axes: { correctness: 0.8, adherence: 0.9, guardrails: 1 },
      composite: 0.88,
    },
  ],
  suites: [{ suite: 'forms-security', scenarioIds: ['rn-01-login-screen'], composite: 0.88, guardrails: 1 }],
  overallComposite: overall,
  overallGuardrails: 1,
  overallReferenceComposite: null,
  overallRelativeComposite: null,
})

describe('leaderboardCommand', () => {
  beforeEach(() => {
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('merges per-model results into BENCHMARK_RESULTS.md', () => {
    const dir = createTempProject({
      'openai.json': JSON.stringify(summary(0.88)),
      'anthropic.json': JSON.stringify(summary(0.91)),
    })
    try {
      const out = `${dir}/BENCHMARK_RESULTS.md`
      leaderboardCommand({ dir, out, timestamp: '2026-08-03T03:00:00.000Z' })

      const content = readFileSync(out, 'utf-8')
      expect(content).toContain('# RN Coding Tests — Model Leaderboard')
      expect(content).toContain('Generated: 2026-08-03T03:00:00.000Z')
      expect(content).toContain('| Scenario | anthropic | openai |')
      expect(content).toContain('| rn-01-login-screen | 88% | 88% |')
      expect(content).toContain('| **Overall** | 91% | 88% |')
      expect(process.stderr.write as jest.Mock).toHaveBeenCalled()
    } finally {
      cleanup(dir)
    }
  })

  it('prints the merged runs as JSON with --json', () => {
    const dir = createTempProject({ 'openai.json': JSON.stringify(summary(0.88)) })
    try {
      leaderboardCommand({ dir, json: true })
      const stdout = (process.stdout.write as jest.Mock).mock.calls
        .map((call: unknown[]) => (typeof call[0] === 'string' ? call[0] : ''))
        .join('')
        .trim()
      const parsed = JSON.parse(stdout) as Array<{ model: string; summary: { overallComposite: number } }>
      expect(parsed).toHaveLength(1)
      expect(parsed[0].model).toBe('openai')
      expect(parsed[0].summary.overallComposite).toBe(0.88)
    } finally {
      cleanup(dir)
    }
  })

  it('exits non-zero when no results are found', () => {
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })
    expect(() => leaderboardCommand({ dir: '/nonexistent/bench-results' })).toThrow('exit')
    expect(exit).toHaveBeenCalledWith(1)
  })
})
