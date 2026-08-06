import { BugTriageAnalyzer } from '../../src/sdlc/BugTriageAnalyzer'

describe('BugTriageAnalyzer', () => {
  it('flags crash bugs as critical / p0', () => {
    const [bug] = new BugTriageAnalyzer().triage(['App crashes on startup'])
    expect(bug.severity).toBe('critical')
    expect(bug.priority).toBe('p0')
    expect(bug.recommendation).toContain('immediately')
  })

  it('flags cosmetic issues as low / p3', () => {
    const [bug] = new BugTriageAnalyzer().triage(['Fix the typo on the settings screen'])
    expect(bug.severity).toBe('low')
    expect(bug.priority).toBe('p3')
  })

  it('assigns stable ids', () => {
    const bugs = new BugTriageAnalyzer().triage(['crashed', 'typo'])
    expect(bugs[0].id).toMatch(/^B-\d+$/)
    expect(bugs[1].id).toBe('B-2')
  })

  it('sorts critical bugs first', () => {
    const bugs = new BugTriageAnalyzer().triage(['Fix typo', 'App crashes', 'Slow loading'])
    expect(bugs[0].priority).toBe('p0')
    expect(bugs[bugs.length - 1].priority).toBe('p3')
  })

  it('renders a triage report', () => {
    const report = new BugTriageAnalyzer().render(new BugTriageAnalyzer().triage(['crashed']))
    expect(report).toContain('Bug Triage')
    expect(report).toContain('B-1')
    expect(report).toContain('critical')
  })
})
