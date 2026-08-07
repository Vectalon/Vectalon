import { LiveProgressReporter } from '../../src/selftest/progress'
import { runSelfTest } from '../../src/selftest/runner'
import type { FeatureCheck } from '../../src/selftest/types'

function makeRun(status: 'pass' | 'fail' | 'warn', id: string, durationMs = 1) {
  return {
    check: { id, name: `Name ${id}`, category: 'cli' as const, description: 'd', run: () => ({ status: 'pass' }) },
    status,
    durationMs,
    detail: status === 'fail' ? 'boom' : undefined,
    error: status === 'fail' ? 'boom' : undefined,
    steps: [],
  }
}

describe('LiveProgressReporter', () => {
  it('streams a status line per completed check (non-TTY, no ANSI)', () => {
    const lines: string[] = []
    const reporter = new LiveProgressReporter({ out: l => lines.push(l), isTTY: false })
    reporter.start(2)
    reporter.onCheckStart({ id: 'a', name: 'A', category: 'cli', description: 'd', run: () => ({ status: 'pass' }) })
    reporter.onCheckDone(makeRun('pass', 'a') as never)
    reporter.onCheckStart({ id: 'b', name: 'B', category: 'cli', description: 'd', run: () => ({ status: 'fail' }) })
    reporter.onCheckDone(makeRun('fail', 'b') as never)
    reporter.finish()

    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('✔')
    expect(lines[0]).toContain('PASS')
    expect(lines[0]).toContain('a')
    expect(lines[1]).toContain('✖')
    expect(lines[1]).toContain('FAIL')
    expect(lines[1]).toContain('boom')
    // The non-TTY contract: no ANSI escape sequences in streamed lines.
    expect(lines.join('')).not.toContain('\x1b[')
  })

  it('renders a progress bar on the raw sink and clears the inline line in TTY mode', () => {
    const lines: string[] = []
    const raw: string[] = []
    const reporter = new LiveProgressReporter({ out: l => lines.push(l), raw: c => raw.push(c), isTTY: true })
    reporter.start(1)
    reporter.onCheckStart({ id: 'a', name: 'A', category: 'cli', description: 'd', run: () => ({ status: 'pass' }) })
    reporter.onCheckDone(makeRun('pass', 'a') as never)
    reporter.finish()

    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('PASS')
    // The inline progress line drew on the raw sink, then finish() cleared it.
    expect(raw.length).toBeGreaterThanOrEqual(2)
    expect(raw[0]).toContain('[0/1]')
    expect(raw[raw.length - 1]).toBe('\r\x1b[K')
  })

  it('truncates long detail lines', () => {
    const lines: string[] = []
    const reporter = new LiveProgressReporter({ out: l => lines.push(l), isTTY: false })
    reporter.start(1)
    const run = makeRun('fail', 'x')
    run.detail = 'e'.repeat(300)
    reporter.onCheckDone(run as never)
    reporter.finish()
    expect(lines[0].length).toBeLessThan(180)
    expect(lines[0]).toContain('…')
  })

  it('warns are streamed with the warn icon', () => {
    const lines: string[] = []
    const reporter = new LiveProgressReporter({ out: l => lines.push(l), isTTY: false })
    reporter.start(1)
    reporter.onCheckDone(makeRun('warn', 'w') as never)
    reporter.finish()
    expect(lines[0]).toContain('⚠')
    expect(lines[0]).toContain('WARN')
  })
})

describe('runSelfTest progress hooks', () => {
  it('fires onStart before each check and onDone as each completes', async () => {
    const order: string[] = []
    const starts: FeatureCheck[] = []
    const report = await runSelfTest(
      { only: 'cli-version' },
      {
        onStart: (check, index, total) => {
          starts.push(check)
          order.push(`start:${index}/${total}`)
        },
        onDone: (run, index, total) => order.push(`done:${run.check.id}:${index}/${total}`),
      }
    )
    expect(starts).toHaveLength(1)
    expect(starts[0].id).toBe('cli-version')
    expect(order).toEqual(['start:1/1', 'done:cli-version:1/1'])
    expect(report.totals.total).toBe(1)
  })

  it('fires hooks for every check in a full run', async () => {
    let starts = 0
    let dones = 0
    let lastTotal = 0
    await runSelfTest(
      {},
      {
        onStart: (_c, _i, total) => {
          starts += 1
          lastTotal = total
        },
        onDone: () => {
          dones += 1
        },
      }
    )
    expect(starts).toBeGreaterThan(30)
    expect(dones).toBe(starts)
    expect(lastTotal).toBe(starts)
  })
})
