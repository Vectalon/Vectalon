import { selftestCommand } from '../../src/cli/commands/selftest'
import { listFeatureChecks } from '../../src/selftest'

describe('selftest CLI command', () => {
  const originalExit = process.exit
  const originalStdout = process.stdout.write

  afterEach(() => {
    process.exit = originalExit
    process.stdout.write = originalStdout
  })

  it('lists every check without exiting', async () => {
    let exited = false
    process.exit = (() => {
      exited = true
      return undefined as never
    }) as typeof process.exit
    const out: string[] = []
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write

    await selftestCommand('', { list: true })
    expect(exited).toBe(false)
    const printed = out.join('')
    expect(printed).toContain('checks across')
    expect(listFeatureChecks().length).toBeGreaterThan(30)
  })

  it('prints JSON for a single deterministic check', async () => {
    const out: string[] = []
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    process.exit = (() => undefined) as typeof process.exit

    await selftestCommand('', { json: true, only: 'cli-version' })
    const parsed = JSON.parse(out.join(''))
    expect(parsed.totals.total).toBe(1)
    expect(parsed.totals.pass).toBe(1)
  })

  it('rejects an unknown category and unknown check id', async () => {
    let exitCode: number | undefined
    process.exit = ((code?: number) => {
      exitCode = code
      return undefined as never
    }) as typeof process.exit

    await selftestCommand('', { category: 'bogus' })
    expect(exitCode).toBe(1)
    exitCode = undefined
    await selftestCommand('', { only: 'does-not-exist' })
    expect(exitCode).toBe(1)
  })
})
