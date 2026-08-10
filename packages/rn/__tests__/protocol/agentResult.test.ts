import { renderAgentResult } from '../../src/protocol/tools/CoreTools'

describe('renderAgentResult', () => {
  it('renders the answer with counts and a tool-call table', () => {
    const out = renderAgentResult({
      answer: 'The project uses react-native.',
      iterations: 3,
      calls: [
        { tool: 'get_project_context', result: 'context snapshot' },
        { tool: 'review_code', result: 'no issues\nfound' },
      ],
    })

    expect(out).toContain('## Agent result')
    expect(out).toContain('The project uses react-native.')
    expect(out).toContain('Tool calls: 2 executed · 0 skipped · 3 iteration(s)')
    expect(out).toContain('| # | Tool | Status | Result (truncated) |')
    expect(out).toContain('| 1 | `get_project_context` | ✅ executed | context snapshot |')
    expect(out).toContain('| 2 | `review_code` | ✅ executed | no issues found |')
    // Multi-line results are flattened into a single table cell.
    expect(out).not.toContain('\nfound |')
  })

  it('marks skipped repeat calls with a warning', () => {
    const out = renderAgentResult({
      answer: 'done',
      iterations: 2,
      calls: [
        { tool: 'get_project_context', result: 'context' },
        { tool: 'get_project_context', result: '[Vectalon] already called', skipped: true },
      ],
    })

    expect(out).toContain('Tool calls: 1 executed · 1 skipped · 2 iteration(s)')
    expect(out).toContain('⚠️ skipped (repeat)')
    expect(out).toContain('✅ executed')
  })

  it('renders no table when no tools were called', () => {
    const out = renderAgentResult({ answer: 'no tools needed', iterations: 1, calls: [] })
    expect(out).toContain('Tool calls: 0 executed · 0 skipped · 1 iteration(s)')
    expect(out).not.toContain('| # | Tool |')
  })

  it('truncates long results to 120 characters', () => {
    const long = 'x'.repeat(500)
    const out = renderAgentResult({ answer: 'a', iterations: 1, calls: [{ tool: 'sandbox_run', result: long }] })
    expect(out).toContain('x'.repeat(120))
    expect(out).not.toContain('x'.repeat(121))
  })
})
