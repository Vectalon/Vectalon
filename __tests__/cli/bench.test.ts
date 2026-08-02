import { benchCommand } from '../../src/cli/commands/bench'

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
})
