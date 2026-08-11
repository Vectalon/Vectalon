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
  formatScenarioSection,
  formatBenchmarkOverall,
  formatBenchmarkHeader,
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

  it('accepts a removedDependencies string array and rejects bad shapes', () => {
    expect(validateScenario(validScenario({ removedDependencies: ['appcenter'] }))).toEqual([])
    const bad = validateScenario(validScenario({ removedDependencies: ['appcenter', 42] as never }))
    expect(bad.some(p => p.includes('removedDependencies'))).toBe(true)
  })
})

describe('bench scenario loader', () => {
  it('loads and validates the shipped scenarios', () => {
    const dir = defaultScenariosDir()
    const loaded = loadScenarios(dir)
    expect(loaded.problems).toEqual([])
    expect(loaded.scenarios.length).toBe(11)
    for (const s of loaded.scenarios) {
      expect(validateScenario(s)).toEqual([])
    }
    // The deterministic baseline covers the scaffold-able subset (rn-01/02/05/06).
    const scaffoldable = loaded.scenarios.filter(s => s.scaffoldable).map(s => s.id)
    expect(isScaffoldableSubset(scaffoldable)).toBe(true)
    // The dependency-removal scenario declares what it removes.
    expect(loaded.scenarios.find(s => s.id === 'rn-11-remove-dependency-native')?.removedDependencies).toEqual(['appcenter'])
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

  it('loads scenarios from nested subdirectories (custom packs)', () => {
    const dir = createTempProject({
      'forms/rn-form.json': JSON.stringify(validScenario({ id: 'rn-form', suite: 'forms-security' })),
      'nav/rn-nav.json': JSON.stringify(validScenario({ id: 'rn-nav', suite: 'navigation' })),
      'readme.md': '# my eval pack',
    })
    try {
      const loaded = loadScenarios(dir)
      expect(loaded.problems).toEqual([])
      expect(loaded.scenarios.map(s => s.id).sort()).toEqual(['rn-form', 'rn-nav'])
    } finally {
      cleanup(dir)
    }
  })

  it('flags duplicate scenario ids and keeps the first', () => {
    const dir = createTempProject({
      'a/rn-dup.json': JSON.stringify(validScenario({ id: 'rn-dup' })),
      'b/rn-dup.json': JSON.stringify(validScenario({ id: 'rn-dup', title: 'Duplicate' })),
    })
    try {
      const loaded = loadScenarios(dir)
      expect(loaded.scenarios.map(s => s.id)).toEqual(['rn-dup'])
      expect(loaded.problems.length).toBe(1)
      expect(loaded.problems[0].problems[0]).toContain('duplicate scenario id: rn-dup')
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

  it('installs deps in the temp project before live checks when install is set', async () => {
    const calls: Array<{ cmd: string; args: string[] }> = []
    const run = await runScenario(
      validScenario({ correctness: { tests: true, typecheck: true, lint: true } }),
      {
        live: true,
        install: true,
        runCommand: async (cmd, args) => {
          calls.push({ cmd, args })
          return { success: true, exitCode: 0, stdout: '', stderr: '' }
        },
      }
    )
    expect(calls[0].cmd).toBe('npm')
    expect(calls[0].args[0]).toBe('install')
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

  it('reports live per-scenario progress (start before complete, 1-based index, total)', async () => {
    const scenarios: BenchScenario[] = [
      validScenario({ id: 'rn-a', suite: 'core-ui' }),
      validScenario({ id: 'rn-b', suite: 'data-flow' }),
      validScenario({ id: 'rn-c', suite: 'core-ui' }),
      validScenario({ id: 'rn-d', suite: 'navigation' }),
    ]
    const events: Array<{ kind: string; index: number; total: number; id: string; composite: number | null }> = []
    const summary = await runBenchmark(scenarios, {
      generate: () => [{ path: 'src/x.tsx', content: 'export const x = 1;' }],
      onScenarioStart: ({ index, total, scenario }) => {
        events.push({ kind: 'start', index, total, id: scenario.id, composite: null })
      },
      onScenarioComplete: ({ index, total, scenario, run }) => {
        events.push({ kind: 'done', index, total, id: scenario.id, composite: run.composite })
      },
    })

    expect(summary.runs).toHaveLength(4)
    // Each scenario starts then completes, in order, with correct 1-based indices.
    expect(events.map(e => `${e.kind}:${e.index}/${e.total}:${e.id}`)).toEqual([
      'start:1/4:rn-a',
      'done:1/4:rn-a',
      'start:2/4:rn-b',
      'done:2/4:rn-b',
      'start:3/4:rn-c',
      'done:3/4:rn-c',
      'start:4/4:rn-d',
      'done:4/4:rn-d',
    ])
    // Every completed run reports a numeric composite.
    for (const e of events.filter(e => e.kind === 'done')) {
      expect(e.composite).not.toBeNull()
    }
  })

  it('reports progress only for the scenarios that pass the filter', async () => {
    const scenarios: BenchScenario[] = [
      validScenario({ id: 'rn-a', suite: 'core-ui' }),
      validScenario({ id: 'rn-b', suite: 'data-flow' }),
      validScenario({ id: 'rn-c', suite: 'core-ui' }),
    ]
    const started: string[] = []
    await runBenchmark(scenarios, {
      filter: { suite: 'core-ui' },
      generate: () => [{ path: 'src/x.tsx', content: 'export const x = 1;' }],
      onScenarioStart: ({ index, total, scenario }) => {
        started.push(`${index}/${total} ${scenario.id}`)
      },
    })
    expect(started).toEqual(['1/2 rn-a', '2/2 rn-c'])
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

  it('formatBenchmarkReport composes header + per-suite sections + overall block', async () => {
    const { summary } = await runBenchmarkFromDir({})
    const report = formatBenchmarkReport(summary)
    // The full report is exactly: header, then a blank-separated list of
    // streamable section blocks, then the overall block.
    expect(report.startsWith(formatBenchmarkHeader(summary))).toBe(true)
    // The overall block closes the report (a trailing blank line follows).
    expect(report.endsWith(formatBenchmarkOverall(summary) + '\n')).toBe(true)
    expect(report).toContain('## ')
    // Every run's streamable section appears verbatim inside the full report.
    for (const run of summary.runs) {
      expect(report).toContain(formatScenarioSection(run))
    }
  })

  it('formatScenarioSection is a self-contained, streamable block', async () => {
    const { summary } = await runBenchmarkFromDir({})
    const run = summary.runs[0]
    const section = formatScenarioSection(run)
    expect(section.startsWith(`### ${run.id} — ${run.title}`)).toBe(true)
    expect(section).toContain('Composite:')
    expect(section).toContain(`\`${run.generatedFiles[0]}\``)
    // No trailing blank: the streamer adds the separator itself.
    expect(section.endsWith('\n')).toBe(false)
  })

  it('formatBenchmarkOverall closes with the composite summary line', async () => {
    const { summary } = await runBenchmarkFromDir({})
    const overall = formatBenchmarkOverall(summary)
    expect(overall.startsWith('---')).toBe(true)
    expect(overall).toContain('Overall composite:')
    expect(overall).toContain('Overall guardrails:')
  })

  it('runBenchmarkFromDir runs every scenario when a generate seam is provided', async () => {
    const { summary } = await runBenchmarkFromDir({
      generate: scenario => [{ path: `src/${scenario.id}.tsx`, content: 'export const x = 1;' }],
    })
    expect(summary.runs.length).toBe(11)
  })

  it('runBenchmarkFromDir honors an explicit scaffoldable filter override', async () => {
    const { summary } = await runBenchmarkFromDir({ filter: { scaffoldable: false } })
    expect(summary.runs.length).toBe(7)
    expect(summary.runs.every(r => !r.scaffoldable)).toBe(true)
  })

  it('scores removed-dependency scenarios on native traces via the rubric', async () => {
    const removal = validScenario({
      id: 'rn-remove',
      suite: 'refactor',
      scaffoldable: false,
      removedDependencies: ['appcenter'],
    })

    // A generator that leaves the pod behind → the native-traces check fails.
    const dirty = await runScenario(removal, {
      generate: () => [{ path: 'ios/Podfile', content: "pod 'AppCenter', :path => '../node_modules/appcenter/ios'\n" }],
    })
    expect(dirty.axes.adherence).toBe(0)

    // A generator that cleans the native side → the check passes.
    const clean = await runScenario(removal, {
      generate: () => [{ path: 'ios/Podfile', content: "pod 'React', :path => '../node_modules/react-native/ReactCommon'\n" }],
    })
    expect(clean.axes.adherence).toBe(1)

    // Without removedDependencies the check is N/A and cannot tank adherence.
    const noDeps = await runScenario(validScenario({ id: 'rn-no-deps', scaffoldable: false }), {
      generate: () => [{ path: 'ios/Podfile', content: "pod 'AppCenter'\n" }],
    })
    expect(noDeps.axes.adherence).not.toBe(0)
  })
})

function isScaffoldableSubset(ids: string[]): boolean {
  const expected = ['rn-01-login-screen', 'rn-02-flatlist-fetch', 'rn-05-form-validation', 'rn-06-offline-queue']
  return expected.every(id => ids.includes(id)) && ids.every(id => expected.includes(id))
}
