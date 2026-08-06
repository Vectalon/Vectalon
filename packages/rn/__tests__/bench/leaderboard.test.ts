import { readFileSync } from 'fs'
import {
  loadLeaderboardRuns,
  renderLeaderboard,
  renderLeaderboardPrComment,
  LEADERBOARD_PR_COMMENT_MARKER,
  writeLeaderboard,
  defaultLeaderboardResultsDir,
} from '../../src/bench/leaderboard'
import type { BenchSummary } from '../../src/bench'
import { createTempProject, cleanup } from '../helpers/tmp'

function summary(overrides: Partial<BenchSummary> = {}): BenchSummary {
  return {
    specVersion: 1,
    runs: [
      {
        id: 'rn-01-login-screen',
        title: 'Login screen',
        suite: 'forms-security',
        scaffoldable: true,
        generatedFiles: ['src/screens/LoginScreen.tsx'],
        guardrail: [],
        axes: { correctness: 0.8, adherence: 0.9, guardrails: 1 },
        composite: 0.88,
      },
    ],
    suites: [{ suite: 'forms-security', scenarioIds: ['rn-01-login-screen'], composite: 0.88, guardrails: 1 }],
    overallComposite: 0.88,
    overallGuardrails: 1,
    overallReferenceComposite: 0.92,
    overallRelativeComposite: 0.96,
    ...overrides,
  }
}

describe('leaderboard loading', () => {
  it('loads one run per result JSON, deriving the model from the filename', () => {
    const dir = createTempProject({
      'openai.json': JSON.stringify(summary()),
      'anthropic.json': JSON.stringify(summary({ overallComposite: 0.91 })),
    })
    try {
      const runs = loadLeaderboardRuns(dir)
      expect(runs.map(r => r.model).sort()).toEqual(['anthropic', 'openai'])
      expect(runs.find(r => r.model === 'openai')?.summary.overallComposite).toBe(0.88)
      expect(runs.find(r => r.model === 'anthropic')?.summary.overallComposite).toBe(0.91)
    } finally {
      cleanup(dir)
    }
  })

  it('skips unparseable and non-summary files', () => {
    const dir = createTempProject({
      'openai.json': JSON.stringify(summary()),
      'broken.json': '{not json',
      'notes.json': JSON.stringify({ hello: 'world' }),
    })
    try {
      const runs = loadLeaderboardRuns(dir)
      expect(runs.map(r => r.model)).toEqual(['openai'])
    } finally {
      cleanup(dir)
    }
  })

  it('returns [] for a missing directory', () => {
    expect(loadLeaderboardRuns('/nonexistent/bench-results')).toEqual([])
  })

  it('has a default results directory under the package bench folder', () => {
    expect(defaultLeaderboardResultsDir()).toMatch(/bench[\\/]results$/)
  })
})

describe('leaderboard rendering', () => {
  const runs = [
    {
      model: 'openai',
      summary: summary({ overallComposite: 0.88 }),
    },
    {
      // A model whose pass produced no scored scenarios renders as '—'.
      model: 'local',
      summary: summary({ overallComposite: 0.7, runs: [], suites: [] }),
    },
  ]

  it('renders a timestamped header with spec version and model/scenario counts', () => {
    const md = renderLeaderboard(runs, '2026-08-03T03:00:00.000Z')
    expect(md).toContain('# RN Coding Tests — Model Leaderboard')
    expect(md).toContain('Generated: 2026-08-03T03:00:00.000Z')
    expect(md).toContain('spec v1')
    expect(md).toContain('2 model(s)')
    expect(md).toContain('1 scenario(s)')
  })

  it('renders a scenario × model table per axis', () => {
    const md = renderLeaderboard(runs, 't')
    expect(md).toContain('## Composite')
    expect(md).toContain('## Correctness')
    expect(md).toContain('## Adherence')
    expect(md).toContain('## Guardrails')
    expect(md).toContain('| Scenario | openai | local |')
    expect(md).toContain('| rn-01-login-screen | 88% | — |')
    expect(md).toContain('| **Overall** | 88% | 70% |')
  })

  it('renders the relative-to-human section when references exist', () => {
    const md = renderLeaderboard(runs, 't')
    expect(md).toContain('## Relative to human (overall)')
    expect(md).toContain('| openai | 96% | 92% |')
  })

  it('omits the relative section when no run has references', () => {
    const noRefs = [{ model: 'openai', summary: summary({ overallReferenceComposite: null, overallRelativeComposite: null }) }]
    const md = renderLeaderboard(noRefs, 't')
    expect(md).not.toContain('Relative to human')
  })

  it('writeLeaderboard writes the rendered markdown to disk', () => {
    const dir = createTempProject({ 'keep.txt': 'x' })
    try {
      const file = `${dir}/BENCHMARK_RESULTS.md`
      writeLeaderboard(file, runs, '2026-08-03T03:00:00.000Z')
      const content = readFileSync(file, 'utf-8')
      expect(content).toContain('# RN Coding Tests — Model Leaderboard')
      expect(content).toContain('Generated: 2026-08-03T03:00:00.000Z')
    } finally {
      cleanup(dir)
    }
  })
})

describe('leaderboard PR comment', () => {
  const prRuns = [
    {
      model: 'openai',
      summary: summary({ overallComposite: 0.88, overallGuardrails: 1, overallReferenceComposite: 0.92, overallRelativeComposite: 0.96 }),
    },
    {
      model: 'local',
      summary: summary({ overallComposite: 0.7, overallGuardrails: 0.65, overallReferenceComposite: 0.92, overallRelativeComposite: 0.76 }),
    },
  ]

  it('renders a compact comment with the upsert marker and overall rows', () => {
    const comment = renderLeaderboardPrComment(prRuns, '2026-08-03T03:00:00.000Z')
    expect(comment).toContain(LEADERBOARD_PR_COMMENT_MARKER)
    expect(comment).toContain('## 📊 RN coding tests — model leaderboard')
    expect(comment).toContain('Generated: 2026-08-03T03:00:00.000Z')
    expect(comment).toContain('2 model(s)')
    expect(comment).toContain('1 scenario(s)')
    expect(comment).toContain('| Model | Overall | Guardrails | vs Human |')
    expect(comment).toContain('| openai | 88% | 100% | 96% |')
    expect(comment).toContain('| local | 70% | 65% | 76% |')
    // Links the full leaderboard rather than duplicating it
    expect(comment).toContain('[full results](BENCHMARK_RESULTS.md)')
  })

  it('omits the vs-human column when no run has references', () => {
    const noRefs = [{ model: 'openai', summary: summary({ overallReferenceComposite: null, overallRelativeComposite: null }) }]
    const comment = renderLeaderboardPrComment(noRefs, 't')
    expect(comment).toContain('| Model | Overall | Guardrails |')
    expect(comment).not.toContain('| Model | Overall | Guardrails | vs Human |')
    expect(comment).not.toContain('| openai | 88% | 100% | 96% |')
    expect(comment).toContain('| openai | 88% | 100% |')
  })

  it('renders a friendly notice when there are no runs', () => {
    const comment = renderLeaderboardPrComment([], 't')
    expect(comment).toContain(LEADERBOARD_PR_COMMENT_MARKER)
    expect(comment).toContain('No leaderboard results available yet')
  })
})
