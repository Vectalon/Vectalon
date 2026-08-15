/**
 * Carbon window renderer contract:
 *  - the window is a closed box: every body line carries the same visible
 *    width and both side borders, no matter how long the content is
 *  - long styled content wraps without breaking the box and without
 *    leaking or duplicating ANSI codes
 *  - the verdict chip renders in the title bar
 *  - `visibleWidth` ignores ANSI codes and counts CJK double-width
 */
import { renderCarbonWindow, verdictChip, visibleWidth, stripAnsi } from '../../src/cli/carbon'

const ESC = String.fromCharCode(27)

describe('carbon window renderer', () => {
  it('draws a closed box with the title and verdict chip in the top bar', () => {
    const out = renderCarbonWindow({
      title: 'vectalon sec — Security Review Agent',
      verdict: 'changes-requested',
      lines: ['project: demo', '', '  Verdict: changes-requested'],
    })
    const lines = out.split('\n')
    expect(lines[0]).toMatch(/^┌─● ● ● vectalon sec — Security Review Agent/)
    expect(lines[0]).toContain('changes-requested')
    expect(lines[0]).toMatch(/─┐$/)
    expect(lines[lines.length - 1]).toMatch(/^└─/)
    expect(lines[lines.length - 1]).toMatch(/─┘$/)
  })

  it('keeps every body line the same visible width with both borders', () => {
    const long =
      'Dependency audit: 19 advisories with 0 critical, 8 high, and 11 moderate — the repository is at high risk and should be patched before the next release window.'
    const out = renderCarbonWindow({ title: 'vectalon deps', lines: ['', long] })
    const body = out.split('\n').slice(1, -1)
    expect(body.length).toBeGreaterThan(1) // the long line wrapped
    const widths = body.map(l => visibleWidth(l))
    expect(new Set(widths).size).toBe(1) // all equal
    for (const l of body) {
      expect(l.startsWith('│')).toBe(true)
      expect(l.endsWith('│')).toBe(true)
    }
  })

  it('carries an open style onto wrapped continuation lines without duplicating codes', () => {
    const BOLD = `${ESC}[1m`
    const RESET = `${ESC}[0m`
    const styled =
      BOLD + 'A very long bold headline that absolutely must wrap across the full window width to prove the style carries onto the continuation line properly' + RESET
    const out = renderCarbonWindow({ title: 'vectalon wrap', lines: [styled] })
    const body = out.split('\n').slice(1, -1)
    // The first continuation line must carry the open bold code once…
    expect(body[1]).toMatch(new RegExp(`│ ${ESC}\\[1m[^${ESC}]`))
    // …and no line may contain a doubled open code
    for (const l of body) {
      expect(l.indexOf(BOLD + BOLD)).toBe(-1)
    }
  })

  it('renders the three verdict chips with the verdict label present', () => {
    for (const v of ['approved', 'needs-attention', 'changes-requested']) {
      expect(stripAnsi(verdictChip(v)).trim()).toBe(v)
    }
  })

  it('measures visible width ignoring ANSI codes and doubling CJK', () => {
    expect(visibleWidth('\u001b[1mhello\u001b[0m')).toBe(5)
    expect(visibleWidth('日本語')).toBe(6)
  })
})
