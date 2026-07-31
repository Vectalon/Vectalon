import { ThreatModeler } from '../../src/sdlc/ThreatModeler'

describe('ThreatModeler', () => {
  it('produces the six STRIDE threat categories', () => {
    const threats = new ThreatModeler().threatModel(['Login'])
    expect(threats).toHaveLength(6)
    const categories = threats.map(t => t.category)
    expect(categories).toEqual(
      expect.arrayContaining(['Spoofing', 'Tampering', 'Repudiation', 'Information Disclosure', 'Denial of Service', 'Elevation of Privilege'])
    )
  })

  it('assigns stable ids and mitigations per threat', () => {
    const threats = new ThreatModeler().threatModel(['Login'])
    expect(threats[0].id).toMatch(/^T\d+$/)
    expect(threats[0].mitigations.length).toBeGreaterThan(0)
  })

  it('references the affected feature or component', () => {
    const threats = new ThreatModeler().threatModel(['Login'], ['auth-service'])
    expect(threats[0].description).toContain('Login')
    expect(threats[0].mitigations.length).toBeGreaterThan(0)
  })

  it('renders a threat model report', () => {
    const model = new ThreatModeler()
    const report = model.render(model.threatModel(['Login']))
    expect(report).toContain('Threat Model')
    expect(report).toContain('Spoofing')
    expect(report).toContain('Login')
  })
})
