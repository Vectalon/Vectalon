import pc from 'picocolors'
import { renderTable, visibleWidth } from '../../src/cli/table'

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
    // The green OK must not make the Status column wider than its neighbors.
    expect(out).toContain(pc.green('OK'))
    expect(out).toContain('│ OK')
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

  it('visibleWidth strips ANSI codes', () => {
    expect(visibleWidth(pc.green('OK'))).toBe(2)
    expect(visibleWidth('plain')).toBe(5)
  })
})