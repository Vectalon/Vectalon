import {
  SCENARIO_SPEC_VERSION,
  validateScenario,
  loadScenarios,
  defaultScenariosDir,
  compositeScore,
  guardrailPassRate,
  deterministicGenerate,
  runScenario,
  runBenchmark,
  runBenchmarkFromDir,
  formatBenchmarkReport,
  AXIS_WEIGHTS,
} from '../../src/bench'
import type { BenchScenario } from '../../src/bench'
import { createTempProject, cleanup } from '../helpers/tmp'

function validScenario(overrides: Partial<BenchScenario> = {}): BenchScenario {
  return {
    id: 'rn-test',
    specVersion: SCENARIO_SPEC_VERSION,
    suite: 'core-ui',
    title: 'Test scenario',
    prompt: 'Create a test screen',
    scaffoldable: true,
    fixtures: {
      'package.json': '{"name":"app","version":"1.0.0","scripts":{"test":"jest"}}',
    },
    expect: { files: ['src/screens/TestScreen.tsx'], behaviors: ['loading state'] },
    correctness: { tests: true, typecheck: true, lint: true },
    axes: ['correctness', 'adherence', 'guardrails'],
    ...overrides,
  }
}

describe('bench scenario spec validation', () => {
  it('accepts a fully valid scenario', () => {
    expect(validateScenario(validScenario())).toEqual([])
  })

  it('rejects a wrong specVersion', () => {
    const problems = validateScenario(validScenario({ specVersion: 999 }))
    expect(problems.some(p => p.includes('specVersion'))).toBe(true)
  })

  it('rejects missing required fields', () => {
    const problems = validateScenario({ id: 'x', specVersion: SCENARIO_SPEC_VERSION })
    expect(problems.length).toBeGreaterThan(0)
    expect(problems.some(p => p.includes('suite'))).toBe(true)
    expect(problems.some(p => p.includes('fixtures'))).toBe(true)
    expect(problems.some(p => p.includes('axes'))).toBe(true)
  })

  it('rejects unknown axes and non-boolean correctness flags', () => {
    const problems = validateScenario(validScenario({ axes: ['bogus'] as never }))
    expect(problems.some(p => p.includes('unknown axis'))).toBe(true)

    const badCorrectness = validateScenario(
      validScenario({ correctness: { tests: 'yes' as never, typecheck: true, lint: true } })
    )
    expect(badCorrectness.some(p => p.includes('correctness.tests'))).toBe(true)
  })

  it('rejects non-string fixtures', () => {
    const problems = validateScenario(validScenario({ fixtures: { 'a.ts': 42 as never } }))
    expect(problems.some(p => p.includes('must be a string'))).toBe(true)
  })
})

describe('bench scenario loader', () => {
  it('loads and validates the shipped scenarios', () => {
    const dir = defaultScenariosDir()
    const loaded = loadScenarios(dir)
    expect(loaded.problems).toEqual([])
    expect(loaded.scenarios.length).toBe(10)
    for (const s of loaded.scenarios) {
      expect(validateScenario(s)).toEqual([])
    }
    // The deterministic baseline covers the scaffold-able subset (rn-01/02/05/06).
    const scaffoldable = loaded.scenarios.filter(s => s.scaffoldable).map(s => s.id)
    expect(isScaffoldableSubset(scaffoldable)).toBe(true)
  })

  it('returns a problem for a missing directory', () => {
    const loaded = loadScenarios('/nonexistent/scenarios')
    expect(loaded.scenarios).toEqual([])
    expect(loaded.problems.length).toBeGreaterThan(0)
  })

  it('skips invalid scenario files', () => {
    const dir = createTempProject({
      'good.json': JSON.stringify(validScenario({ id: 'rn-good' })),
      'bad.json': JSON.stringify({ id: 'rn-bad', specVersion: 2 }),
      'garbage.json': 'not json{{',
    })
    try {
      const loaded = loadScenarios(dir)
      expect(loaded.scenarios.map(s => s.id)).toEqual(['rn-good'])
      expect(loaded.problems.length).toBe(2)
    } finally {
      cleanup(dir)
    }
  })
})

describe('bench scoring', () => {
  it('weights sum to 1.0', () => {
    const total = AXIS_WEIGHTS.correctness + AXIS_WEIGHTS.adherence + AXIS_WEIGHTS.guardrails
    expect(total).toBeCloseTo(1.0)
  })

  it('computes the weighted composite', () => {
    const score = compositeScore({ correctness: 0.8, adherence: 0.6, guardrails: 0.9 })
    expect(score).toBeCloseTo(0.4 * 0.8 + 0.3 * 0.6 + 0.3 * 0.9, 5)
  })

  it('renormalizes when correctness is N/A (simulated mode)', () => {
    const score = compositeScore({ correctness: null, adherence: 0.6, guardrails: 0.9 })
    // (0.3*0.6 + 0.3*0.9) / 0.6
    expect(score).toBeCloseTo((0.3 * 0.6 + 0.3 * 0.9) / 0.6, 5)
  })

  it('returns null when no axis is available', () => {
    expect(compositeScore({ correctness: null, adherence: null, guardrails: null })).toBeNull()
  })

  it('computes guardrail pass rate over generated files', () => {
    const files = [
      {
        path: 'src/Good.tsx',
        content: [
          "import { View, Text, StyleSheet } from 'react-native';",
          'export function Good(): JSX.Element {',
          '  return <View style={styles.c}><Text>hi</Text></View>;',
          '}',
          'const styles = StyleSheet.create({ c: { flex: 1 } });',
        ].join('\n'),
      },
      {
        path: 'src/Bad.ts',
        content: 'console.log("debug");\nconst api = "https://example.com";',
      },
    ]
    const rate = guardrailPassRate(files)
    expect(rate).not.toBeNull()
    expect(rate as number).toBeGreaterThan(0)
    expect(rate as number).toBeLessThan(1)
  })
})

describe('bench deterministic baseline runner', () => {
  it('generates a scaffold for a scaffoldable scenario', () => {
    const files = deterministicGenerate(validScenario({ prompt: 'create a login screen' }))
    expect(files.length).toBeGreaterThan(0)
    expect(files.some(f => f.path.includes('Screen'))).toBe(true)
  })

  it('runs a scenario offline with correctness N/A and renormalized composite', async () => {
    const run = await runScenario(validScenario())
    expect(run.axes.correctness).toBeNull()
    expect(run.axes.guardrails).not.toBeNull()
    expect(run.composite).not.toBeNull()
    expect(run.composite as number).toBeLessThanOrEqual(1)
    expect(run.composite as number).toBeGreaterThanOrEqual(0)
  })

  it('honors a custom generate seam and rubric', async () => {
    const run = await runScenario(validScenario(), {
      generate: () => [{ path: 'src/screens/TestScreen.tsx', content: 'export const x = 1;' }],
      rubric: () => 0.75,
    })
    expect(run.axes.adherence).toBe(0.75)
    expect(run.generatedFiles).toEqual(['src/screens/TestScreen.tsx'])
  })

  it('runs live correctness via the injected executor', async () => {
    const run = await runScenario(
      validScenario({
        correctness: { tests: true, typecheck: true, lint: true },
        fixtures: {
          'package.json': JSON.stringify({ name: 'app', version: '1.0.0', scripts: { test: 'jest' } }),
        },
      }),
      {
        live: true,
        runCommand: async () => ({ success: true, exitCode: 0, stdout: '', stderr: '' }),
      }
    )
    expect(run.axes.correctness).toBeCloseTo(1, 5)
  })

  it('respects filters and aggregates suites', async () => {
    const scenarios: BenchScenario[] = [
      validScenario({ id: 'rn-a', suite: 'core-ui' }),
      validScenario({ id: 'rn-b', suite: 'data-flow' }),
      validScenario({ id: 'rn-c', suite: 'core-ui' }),
    ]
    const filtered = await runBenchmark(scenarios, { filter: { suite: 'core-ui' } })
    expect(filtered.runs.map(r => r.id).sort()).toEqual(['rn-a', 'rn-c'])
    expect(filtered.suites.map(s => s.suite)).toEqual(['core-ui'])
  })

  it('runBenchmarkFromDir runs only the scaffold-able subset by default', async () => {
    const { summary, problems } = await runBenchmarkFromDir({})
    expect(problems).toEqual([])
    // Deterministic baseline (no generate seam) covers rn-01/02/05/06 only.
    expect(summary.runs.length).toBe(4)
    expect(summary.runs.every(r => r.scaffoldable)).toBe(true)
    expect(summary.overallComposite).not.toBeNull()
    expect(summary.suites.length).toBeGreaterThan(0)
    const report = formatBenchmarkReport(summary)
    expect(report).toContain('# RN Coding Tests')
    expect(report).toContain('rn-01-login-screen')
  })

  it('runBenchmarkFromDir runs every scenario when a generate seam is provided', async () => {
    const { summary } = await runBenchmarkFromDir({
      generate: scenario => [{ path: `src/${scenario.id}.tsx`, content: 'export const x = 1;' }],
    })
    expect(summary.runs.length).toBe(10)
  })

  it('runBenchmarkFromDir honors an explicit scaffoldable filter override', async () => {
    const { summary } = await runBenchmarkFromDir({ filter: { scaffoldable: false } })
    expect(summary.runs.length).toBe(6)
    expect(summary.runs.every(r => !r.scaffoldable)).toBe(true)
  })
})

function isScaffoldableSubset(ids: string[]): boolean {
  const expected = ['rn-01-login-screen', 'rn-02-flatlist-fetch', 'rn-05-form-validation', 'rn-06-offline-queue']
  return expected.every(id => ids.includes(id)) && ids.every(id => expected.includes(id))
}
