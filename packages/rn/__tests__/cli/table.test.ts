// Color support is forced globally via jest.setup.js (FORCE_COLOR=1), so the
// ANSI width-accounting assertions below are deterministic in CI as well.
import pc from 'picocolors'
import { renderTable, visibleWidth } from '../../src/cli/table'

// Strip ANSI codes so layout assertions compare visible content regardless of
// color support. Built dynamically to avoid the no-control-regex lint rule.
function stripAnsi(value: string): string {
  const esc = String.fromCharCode(27)
  return value.replace(new RegExp(`${esc}\\[[0-9;]*m`, 'g'), '')
}

describe('renderTable', () => {
  it('word-wraps long cells instead of truncating them', () => {
    const out = renderTable(
      [['rn-diff-purge', 'rn-cli', 'fetches the official template diffs live from GitHub so upgrade steps are never stale']],
      { head: ['ID', 'Flavor', 'Detail'], colWidths: [16, 10, 30] }
    )
    // The full sentence survives (no '…' elision), split across wrapped lines.
    expect(out).not.toContain('…')
    // Each fragment exists on its wrapped line.
    expect(out).toContain('fetches the official template')
    expect(out).toContain('diffs live from GitHub so')
    expect(out).toContain('upgrade steps are never stale')
  })

  it('does not count ANSI color codes toward column width', () => {
    const out = renderTable([[pc.green('OK'), 'zustand', 'installed locally']], {
      head: ['Status', 'ID', 'Detail'],
      colWidths: [8, 12, 20],
    })
    // The colored cell keeps its exact codes and its visible width (2) — the
    // Status column must not grow past 8 because of the escape sequences.
    expect(out).toContain(pc.green('OK'))
    // Layout-wise, OK sits alone in the Status column (width 8, padded).
    expect(stripAnsi(out)).toContain('│ OK     │ zustand')
  })

  it('produces a header separator between the head and the body', () => {
    const out = renderTable([['a', 'b']], { head: ['X', 'Y'] })
    const lines = out.split('\n')
    expect(lines[0].startsWith('┌')).toBe(true)
    // Header row then a `├` separator.
    expect(lines[1]).toContain('X')
    expect(lines[2].startsWith('├')).toBe(true)
    expect(lines[lines.length - 1].startsWith('└')).toBe(true)
  })

  it('renders rows of differing heights without padding blank lines', () => {
    const out = renderTable([
      ['short', 'a'],
      ['a very long cell that will wrap onto multiple lines', 'b'],
    ], { head: ['A', 'B'], colWidths: [20, 5] })
    const lines = out.split('\n')
    // No interior separator repeated for padding-only rows.
    expect(lines.filter(l => l.startsWith('├')).length).toBe(2)
  })

  it('preserves exact ANSI sequences per cell (opening and reset codes)', () => {
    const out = renderTable([[pc.green('OK'), 'zustand', 'installed locally']], {
      head: ['Status', 'ID', 'Detail'],
      colWidths: [8, 12, 20],
    })
    // Regression: the renderer once reused the *opening* code as the closing
    // one, emitting ESC[32mOK ESC[32m (visible green on a TTY, broken bytes).
    // The reset must be the original ESC[39m — i.e. the exact input sequence
    // survives byte-for-byte.
    expect(out).toContain(pc.green('OK')) // \x1b[32mOK\x1b[39m
  })

  it('visibleWidth strips ANSI codes', () => {
    expect(visibleWidth(pc.green('OK'))).toBe(2)
    expect(visibleWidth('plain')).toBe(5)
  })
})