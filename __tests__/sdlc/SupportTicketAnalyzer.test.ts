import { SupportTicketAnalyzer } from '../../src/sdlc/SupportTicketAnalyzer'

describe('SupportTicketAnalyzer', () => {
  it('groups tickets by theme and counts them', () => {
    const analysis = new SupportTicketAnalyzer().analyze([
      'App crashed on startup',
      'App crashed again after login',
      'Password reset email not arriving',
    ])
    const crash = analysis.themes.find(t => t.theme === 'crash')
    const login = analysis.themes.find(t => t.theme === 'login')
    expect(crash?.count).toBe(2)
    expect(login?.count).toBe(1)
    expect(analysis.total).toBe(3)
  })

  it('identifies the top issue by volume', () => {
    const analysis = new SupportTicketAnalyzer().analyze(['crashed', 'crashed', 'slow app'])
    expect(analysis.topIssue).toBe('crash')
  })

  it('falls back to the other theme and still recommends for unmatched tickets', () => {
    const analysis = new SupportTicketAnalyzer().analyze(['weird one-off'])
    expect(analysis.topIssue).toBe('other')
    expect(analysis.recommendations.length).toBeGreaterThan(0)
  })

  it('sorts themes by count descending', () => {
    const analysis = new SupportTicketAnalyzer().analyze(['slow', 'slow', 'crashed'])
    expect(analysis.themes[0].theme).toBe('performance')
  })

  it('handles empty input with no top issue', () => {
    const analysis = new SupportTicketAnalyzer().analyze([])
    expect(analysis.total).toBe(0)
    expect(analysis.topIssue).toBeNull()
    expect(analysis.themes).toEqual([])
  })

  it('renders a readable report', () => {
    const analysis = new SupportTicketAnalyzer().analyze(['crashed'])
    const report = new SupportTicketAnalyzer().render(analysis)
    expect(report).toContain('Support Ticket Analysis')
    expect(report).toContain('crash')
  })
})
