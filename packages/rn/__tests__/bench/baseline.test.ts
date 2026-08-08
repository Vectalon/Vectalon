import {
  SCENARIO_SPEC_VERSION,
  DEFAULT_BASELINE_TOLERANCE,
  loadBaselineFile,
  compareToBaseline,
  formatBaselineComparison,
  gateBenchRelease,
  overallAdherenceOf,
  guardrailFailedRateOf,
  RELATIVE_COMPOSITE_FLOOR,
  ADHERENCE_DROP_LIMIT,
  GUARDRAIL_FAILED_DELTA_LIMIT,
} from '../../src/bench'
import type { BenchScenarioRun, BenchSuiteSummary, BenchSummary } from '../../src/bench'
import { createTempProject, cleanup } from '../helpers/tmp'

function run(id: string, overrides: Partial<BenchScenarioRun> = {}): BenchScenarioRun {
  return {
    id,
    title: `Scenario ${id}`,
    suite: 'core-ui',
    scaffoldable: true,
    generatedFiles: [],
    guardrail: [],
    axes: { correctness: null, adherence: 0.67, guardrails: 1 },
    composite: 0.83,
    ...overrides,
  }
}

function suite(s: string, composite: number): BenchSuiteSummary {
  return { suite: s, scenarioIds: [`rn-${s}`], composite, guardrails: 1 }
}

function summary(overrides: Partial<BenchSummary> = {}): BenchSummary {
  return {
    specVersion: SCENARIO_SPEC_VERSION,
    runs: [run('rn-01-login-screen'), run('rn-02-flatlist-fetch')],
    suites: [suite('core-ui', 0.83)],
    overallComposite: 0.83,
    overallGuardrails: 1,
    overallReferenceComposite: 0.83,
    overallRelativeComposite: 1.02,
    ...overrides,
  }
}

describe('bench baseline (M4)', () => {
  it('loads a valid baseline file', () => {
    const dir = createTempProject({ 'baseline.json': JSON.stringify(summary()) })
    try {
      const baseline = loadBaselineFile(`${dir}/baseline.json`)
      expect(baseline).not.toBeNull()
      expect(baseline?.runs.length).toBe(2)
    } finally {
      cleanup(dir)
    }
  })

  it('returns null for a missing or invalid baseline file', () => {
    expect(loadBaselineFile('/nonexistent/baseline.json')).toBeNull()
    const dir = createTempProject({ 'bad.json': 'not json{{' })
    try {
      expect(loadBaselineFile(`${dir}/bad.json`)).toBeNull()
    } finally {
      cleanup(dir)
    }
  })

  it('rejects a run entry with a malformed axes shape instead of crashing', () => {
    const malformed = summary()
    ;(malformed.runs[0] as unknown as Record<string, unknown>).axes = undefined
    const dir = createTempProject({ 'baseline.json': JSON.stringify(malformed) })
    try {
      expect(loadBaselineFile(`${dir}/baseline.json`)).toBeNull()
    } finally {
      cleanup(dir)
    }
  })

  it('passes when scores match the baseline', () => {
    const comparison = compareToBaseline(summary(), summary())
    expect(comparison.ok).toBe(true)
    expect(comparison.regressions).toEqual([])
    expect(comparison.missing).toEqual([])
  })

  it('flags a per-axis regression beyond tolerance', () => {
    const current = summary()
    current.runs[0].axes.adherence = 0.4
    current.runs[0].composite = 0.6
    const comparison = compareToBaseline(current, summary())
    expect(comparison.ok).toBe(false)
    expect(comparison.regressions.some(r => r.scope === 'rn-01-login-screen' && r.axis === 'adherence')).toBe(true)
  })

  it('ignores a drop within tolerance', () => {
    const current = summary()
    // 0.005 drop < 0.01 tolerance
    current.overallComposite = 0.83 - 0.005
    const comparison = compareToBaseline(current, summary(), 0.01)
    expect(comparison.ok).toBe(true)
  })

  it('flags a suite composite regression', () => {
    const current = summary()
    current.suites[0].composite = 0.5
    const comparison = compareToBaseline(current, summary())
    expect(comparison.ok).toBe(false)
    expect(comparison.regressions.some(r => r.scope === 'suite:core-ui')).toBe(true)
  })

  it('flags an overall regression', () => {
    const current = summary()
    current.overallComposite = 0.5
    const comparison = compareToBaseline(current, summary())
    expect(comparison.ok).toBe(false)
    expect(comparison.regressions.some(r => r.scope === 'overall')).toBe(true)
  })

  it('reports missing baseline scenarios and added scenarios', () => {
    const baseline = summary()
    const current = summary({
      runs: [run('rn-01-login-screen'), run('rn-99-new-scenario')],
      suites: [suite('core-ui', 0.83)],
    })
    const comparison = compareToBaseline(current, baseline)
    expect(comparison.missing).toContain('rn-02-flatlist-fetch')
    expect(comparison.added).toContain('rn-99-new-scenario')
    expect(comparison.ok).toBe(false)
  })

  it('records improvements as informational, not regressions', () => {
    const current = summary()
    current.overallComposite = 0.95
    const comparison = compareToBaseline(current, summary())
    expect(comparison.ok).toBe(true)
    expect(comparison.improvements.some(r => r.scope === 'overall')).toBe(true)
  })

  it('formats a pass and a failure', () => {
    const pass = formatBaselineComparison(compareToBaseline(summary(), summary()), DEFAULT_BASELINE_TOLERANCE)
    expect(pass).toContain('Baseline OK')

    const failing = summary()
    failing.overallComposite = 0.5
    const fail = formatBaselineComparison(compareToBaseline(failing, summary()), DEFAULT_BASELINE_TOLERANCE)
    expect(fail).toContain('REGRESSIONS')
    expect(fail).toContain('Baseline FAILED')
  })
})

describe('release gate (P1-11)', () => {
  it('passes when every budget is met', () => {
    const gate = gateBenchRelease(summary(), summary())
    expect(gate.ok).toBe(true)
    expect(gate.reasons).toHaveLength(0)
  })

  it('blocks when overallRelativeComposite drops below the floor', () => {
    const current = summary({ overallRelativeComposite: RELATIVE_COMPOSITE_FLOOR - 0.01 })
    const gate = gateBenchRelease(current, summary())
    expect(gate.ok).toBe(false)
    expect(gate.reasons.join(' ')).toContain('relative composite')
    expect(gate.reasons.join(' ')).toContain('release floor')
  })

  it('passes when relative composite sits exactly at the floor', () => {
    const gate = gateBenchRelease(summary({ overallRelativeComposite: RELATIVE_COMPOSITE_FLOOR }), summary())
    expect(gate.ok).toBe(true)
  })

  it('blocks when the guardrail failed rate increases beyond the delta limit', () => {
    const current = summary({ overallGuardrails: 1 - GUARDRAIL_FAILED_DELTA_LIMIT - 0.005 })
    const gate = gateBenchRelease(current, summary())
    expect(gate.ok).toBe(false)
    expect(gate.reasons.join(' ')).toContain('guardrail failed rate')
  })

  it('allows a guardrail failed-rate increase within the delta limit', () => {
    const current = summary({ overallGuardrails: 1 - GUARDRAIL_FAILED_DELTA_LIMIT + 0.005 })
    const gate = gateBenchRelease(current, summary())
    expect(gate.ok).toBe(true)
  })

  it('blocks when overall adherence drops more than the 5% limit', () => {
    const current = summary({
      runs: [
        run('rn-01-login-screen', { axes: { correctness: null, adherence: 0.6, guardrails: 1 } }),
        run('rn-02-flatlist-fetch', { axes: { correctness: null, adherence: 0.6, guardrails: 1 } }),
      ],
    })
    // baseline adherence is 0.67 → drop 0.07 > 0.05.
    expect(overallAdherenceOf(current)).toBeCloseTo(0.6, 5)
    const gate = gateBenchRelease(current, summary())
    expect(gate.ok).toBe(false)
    expect(gate.reasons.join(' ')).toContain('adherence')
  })

  it('allows an adherence drop at exactly the 5% limit', () => {
    const current = summary({
      runs: [
        run('rn-01-login-screen', { axes: { correctness: null, adherence: 0.67 - ADHERENCE_DROP_LIMIT, guardrails: 1 } }),
        run('rn-02-flatlist-fetch', { axes: { correctness: null, adherence: 0.67 - ADHERENCE_DROP_LIMIT, guardrails: 1 } }),
      ],
    })
    const gate = gateBenchRelease(current, summary())
    expect(gate.ok).toBe(true)
  })

  it('skips gates whose inputs are N/A (no false blocks on partial runs)', () => {
    const current = summary({ overallRelativeComposite: null, overallGuardrails: null })
    const baseline = summary({ overallRelativeComposite: null, overallGuardrails: null })
    const gate = gateBenchRelease(current, baseline)
    expect(gate.ok).toBe(true)
  })

  it('guardrailFailedRateOf inverts the pass rate', () => {
    expect(guardrailFailedRateOf(summary({ overallGuardrails: 0.97 }))).toBeCloseTo(0.03, 5)
    expect(guardrailFailedRateOf(summary({ overallGuardrails: null }))).toBeNull()
  })
})
