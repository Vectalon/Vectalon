import { IncidentAnalyzer } from '../../src/sdlc/IncidentAnalyzer'

describe('IncidentAnalyzer', () => {
  it('detects sev1 for outages', () => {
    const analysis = new IncidentAnalyzer().analyze({ title: 'Nightly outage', description: 'App is down for all users' })
    expect(analysis.severity).toBe('sev1')
  })

  it('detects sev2 for degraded service', () => {
    const analysis = new IncidentAnalyzer().analyze({ title: 'Slow API', description: 'API responses are slow and degraded' })
    expect(analysis.severity).toBe('sev2')
  })

  it('reuses the root cause analyzer to classify the cause', () => {
    const analysis = new IncidentAnalyzer().analyze({ title: 'Crash', description: 'null is not an object' })
    expect(analysis.causeBucket).toBe('null-reference')
    expect(analysis.actions.length).toBeGreaterThan(0)
  })

  it('respects an explicit severity override', () => {
    const analysis = new IncidentAnalyzer().analyze({ title: 'Typo', description: 'minor cosmetic issue', severity: 'sev3' })
    expect(analysis.severity).toBe('sev3')
  })

  it('renders an incident analysis report', () => {
    const analyzer = new IncidentAnalyzer()
    const report = analyzer.render(analyzer.analyze({ title: 'Nightly outage', description: 'App is down for all users' }))
    expect(report).toContain('Incident Analysis')
    expect(report).toContain('Nightly outage')
    expect(report).toContain('sev1')
    expect(report).toContain('Timeline')
  })
})
