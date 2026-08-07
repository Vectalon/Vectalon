import {
  renderTerminalReport,
  renderTerminalSummary,
  renderActivityLog,
  renderHtmlReport,
  renderJsonReport,
} from '../../src/selftest/reporters'
import { runSelfTest } from '../../src/selftest/runner'

// CI environments (e.g. GitHub Actions sets FORCE_COLOR) make picocolors emit
// ANSI codes even when piped, so strip them before asserting on text.
function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, '')
}

describe('self-test reporters', () => {
  let report: Awaited<ReturnType<typeof runSelfTest>>

  beforeAll(async () => {
    // adapters-run-command runs a real command, so its trace has steps.
    report = await runSelfTest({ only: 'adapters-run-command' })
  })

  it('terminal report shows the check and a summary', () => {
    const out = stripAnsi(renderTerminalReport(report))
    expect(out).toContain('adapters-run-command')
    expect(out).toContain('1 passed')
    expect(out).toContain('Summary:')
  })

  it('terminal summary shows totals and activity without the per-check table', () => {
    const out = stripAnsi(renderTerminalSummary(report))
    expect(out).toContain('Summary: 1 passed')
    expect(out).toContain('Activity:')
    expect(out).not.toContain('adapters-run-command')
  })

  it('activity log lists steps with a result header', () => {
    const out = renderActivityLog(report)
    expect(out).toContain('# vectalon self-test')
    expect(out).toContain('[PASS] adapters-run-command')
    expect(out).toContain('Result: 1 passed')
    expect(out).toContain('$ node --version')
  })

  it('JSON report round-trips', () => {
    const parsed = JSON.parse(renderJsonReport(report))
    expect(parsed.version).toBe(report.version)
    expect(parsed.totals.pass).toBe(1)
    expect(parsed.runs[0].check.id).toBe('adapters-run-command')
  })

  it('HTML dashboard is self-contained and escapes user content', () => {
    const html = renderHtmlReport(report)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('adapters-run-command')
    expect(html).toContain('Activity trace')
    // No external assets.
    expect(html).not.toContain('src="http')
    expect(html).not.toContain('<link rel="stylesheet" href="http')

    const evil: Awaited<ReturnType<typeof runSelfTest>> = {
      ...report,
      runs: [
        {
          check: {
            id: 'x',
            name: '<script>alert("x")</script>',
            category: 'cli',
            description: '<img src=x onerror=alert(1)>',
            run: () => ({ status: 'pass' }),
          },
          status: 'pass',
          durationMs: 1,
          steps: [{ kind: 'step', message: '<b>bold</b> & "quoted"' }],
        },
      ],
      totals: { pass: 1, fail: 0, warn: 0, total: 1 },
    }
    const safe = renderHtmlReport(evil)
    expect(safe).not.toContain('<script>alert("x")</script>')
    expect(safe).toContain('&lt;script&gt;')
    expect(safe).toContain('&lt;b&gt;bold&lt;/b&gt;')
  })
})
