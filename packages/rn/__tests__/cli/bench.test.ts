import { benchCommand } from '../../src/cli/commands/bench'
import { SCENARIO_SPEC_VERSION } from '../../src/bench'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('benchCommand', () => {
  beforeEach(() => {
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('exits when given an unknown model provider', async () => {
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })

    await expect(benchCommand({ model: 'bogus' })).rejects.toThrow('exit')
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('runs the deterministic baseline and prints a markdown report', async () => {
    await expect(benchCommand({})).resolves.toBeUndefined()

    const stdout = process.stdout.write as jest.Mock
    const report = stdout.mock.calls
      .map((call: unknown[]) => (typeof call[0] === 'string' ? call[0] : ''))
      .join('')

    expect(report).toContain('# RN Coding Tests — Benchmark report')
    expect(report).toContain('Overall composite:')
    expect(process.stderr.write as jest.Mock).toHaveBeenCalled()
  })

  it('prints a JSON summary when --json is passed', async () => {
    await expect(benchCommand({ json: true })).resolves.toBeUndefined()

    const stdout = process.stdout.write as jest.Mock
    const out = stdout.mock.calls
      .map((call: unknown[]) => (typeof call[0] === 'string' ? call[0] : ''))
      .join('')
      .trim()

    expect(() => JSON.parse(out)).not.toThrow()
    const parsed = JSON.parse(out) as { overallComposite: number | null; runs: unknown[] }
    expect(parsed.overallComposite).not.toBeNull()
    expect(parsed.runs.length).toBeGreaterThan(0)
  })

  it('exits non-zero when no scenarios run (empty scenarios dir)', async () => {
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })

    await expect(benchCommand({ scenarios: '/nonexistent/bench-scenarios' })).rejects.toThrow('exit')
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('filters to a single suite with --suite', async () => {
    await expect(benchCommand({ suite: 'forms-security' })).resolves.toBeUndefined()

    const stdout = process.stdout.write as jest.Mock
    const report = stdout.mock.calls
      .map((call: unknown[]) => (typeof call[0] === 'string' ? call[0] : ''))
      .join('')

    expect(report).toContain('## forms-security')
    expect(report).not.toContain('## core-ui')
  })

  it('runs scenarios from a custom directory with --scenarios', async () => {
    const dir = createTempProject({
      'my-pack/forms/my-form.json': JSON.stringify({
        id: 'my-form',
        specVersion: SCENARIO_SPEC_VERSION,
        suite: 'my-forms',
        title: 'Custom form eval',
        prompt: 'Create a custom form screen',
        scaffoldable: true,
        fixtures: {},
        expect: { files: [], behaviors: [] },
        correctness: { tests: false, typecheck: false, lint: false },
        axes: ['adherence', 'guardrails'],
      }),
    })
    try {
      await expect(benchCommand({ scenarios: dir })).resolves.toBeUndefined()

      const stdout = process.stdout.write as jest.Mock
      const report = stdout.mock.calls
        .map((call: unknown[]) => (typeof call[0] === 'string' ? call[0] : ''))
        .join('')

      expect(report).toContain('## my-forms')
      expect(report).toContain('my-form — Custom form eval')
      expect(report).toContain('Overall composite:')
    } finally {
      cleanup(dir)
    }
  })

  it('loads custom references with --references for relative scoring', async () => {
    const scenariosDir = createTempProject({
      'my-form.json': JSON.stringify({
        id: 'my-form',
        specVersion: SCENARIO_SPEC_VERSION,
        suite: 'my-forms',
        title: 'Custom form eval',
        prompt: 'Create a custom form screen',
        scaffoldable: true,
        fixtures: {},
        expect: { files: [], behaviors: [] },
        correctness: { tests: false, typecheck: false, lint: false },
        axes: ['adherence', 'guardrails'],
      }),
    })
    const referencesDir = createTempProject({
      'my-form.json': JSON.stringify({
        id: 'my-form',
        files: [{ path: 'src/screens/FormScreen.tsx', content: 'export const FormScreen = () => null;' }],
      }),
    })
    try {
      await expect(benchCommand({ scenarios: scenariosDir, references: referencesDir })).resolves.toBeUndefined()

      const stdout = process.stdout.write as jest.Mock
      const report = stdout.mock.calls
        .map((call: unknown[]) => (typeof call[0] === 'string' ? call[0] : ''))
        .join('')

      expect(report).toContain('Relative to human reference')
    } finally {
      cleanup(scenariosDir)
      cleanup(referencesDir)
    }
  })

  it('exits non-zero with a validation hint when a custom dir has only invalid scenarios', async () => {
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })
    const dir = createTempProject({
      'bad.json': JSON.stringify({ id: 'rn-bad', specVersion: 999 }),
    })
    try {
      await expect(benchCommand({ scenarios: dir })).rejects.toThrow('exit')
      expect(exit).toHaveBeenCalledWith(1)
      const stderr = (process.stderr.write as jest.Mock).mock.calls
        .map((call: unknown[]) => (typeof call[0] === 'string' ? call[0] : ''))
        .join('')
      expect(stderr).toContain('failed validation')
      expect(stderr).toContain('specVersion')
    } finally {
      cleanup(dir)
    }
  })

  it('exits non-zero when --baseline is combined with --model', async () => {
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })
    await expect(benchCommand({ baseline: 'bench/baseline.json', model: 'local' })).rejects.toThrow('exit')
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('exits non-zero when --preset is passed without --model local', async () => {
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })
    // No --model at all.
    await expect(benchCommand({ preset: 'balanced' })).rejects.toThrow('exit')
    expect(exit).toHaveBeenCalledWith(1)
    // Remote provider — preset only applies to local GGUFs.
    await expect(benchCommand({ model: 'openai', preset: 'balanced' })).rejects.toThrow('exit')
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('exits non-zero for an unknown preset value', async () => {
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })
    await expect(benchCommand({ model: 'local', preset: 'bogus' })).rejects.toThrow('exit')
    expect(exit).toHaveBeenCalledWith(1)
    const stderr = (process.stderr.write as jest.Mock).mock.calls
      .map((call: unknown[]) => (typeof call[0] === 'string' ? call[0] : ''))
      .join('')
    expect(stderr).toContain('Unknown preset')
    expect(stderr).toContain('fast')
    expect(stderr).toContain('quality')
  })

  it('exits non-zero when the baseline file is missing', async () => {
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })
    await expect(benchCommand({ baseline: '/nonexistent/baseline.json' })).rejects.toThrow('exit')
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('passes the CI gate against the committed baseline', async () => {
    await expect(benchCommand({ baseline: 'bench/baseline.json' })).resolves.toBeUndefined()
    const stderr = (process.stderr.write as jest.Mock).mock.calls
      .map((call: unknown[]) => (typeof call[0] === 'string' ? call[0] : ''))
      .join('')
    expect(stderr).toContain('Baseline OK')
  })

  it('fails the CI gate when an axis regresses', async () => {
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })
    // The deterministic scaffold scores 1.0 on every scored axis, so an
    // inflated-axis baseline can no longer regress — instead, list a scenario
    // the current run does not produce, which fails the gate as "baseline
    // scenario no longer runs".
    const dir = createTempProject({
      'baseline.json': JSON.stringify({
        specVersion: 1,
        runs: [
          {
            id: 'rn-99-baseline-only',
            title: 'Baseline-only scenario',
            suite: 'core-ui',
            scaffoldable: true,
            generatedFiles: [],
            guardrail: [],
            axes: { correctness: null, adherence: 1, guardrails: 1 },
            composite: 1,
          },
        ],
        suites: [{ suite: 'core-ui', scenarioIds: ['rn-99-baseline-only'], composite: 1, guardrails: 1 }],
        overallComposite: 1,
        overallGuardrails: 1,
        overallReferenceComposite: 1,
        overallRelativeComposite: 1,
      }),
    })
    try {
      await expect(benchCommand({ baseline: `${dir}/baseline.json` })).rejects.toThrow('exit')
      expect(exit).toHaveBeenCalledWith(1)
      const stderr = (process.stderr.write as jest.Mock).mock.calls
        .map((call: unknown[]) => (typeof call[0] === 'string' ? call[0] : ''))
        .join('')
      expect(stderr).toContain('Baseline FAILED')
      // The comparison text goes to stdout in markdown mode; the verdict to stderr.
      const stdout = (process.stdout.write as jest.Mock).mock.calls
        .map((call: unknown[]) => (typeof call[0] === 'string' ? call[0] : ''))
        .join('')
      expect(stdout).toContain('rn-99-baseline-only')
    } finally {
      cleanup(dir)
    }
  })
})
