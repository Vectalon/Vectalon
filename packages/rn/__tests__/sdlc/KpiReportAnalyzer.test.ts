import { KpiReportAnalyzer } from '../../src/sdlc/KpiReportAnalyzer'

const METRICS = [
  { name: 'Retention', current: 65, previous: 60, target: 70 },
  { name: 'Signups', current: 100, previous: 90 },
  { name: 'Churn', current: 5 },
]

describe('KpiReportAnalyzer', () => {
  it('computes change and change percentage from a baseline', () => {
    const metrics = new KpiReportAnalyzer().analyze(METRICS).metrics
    const retention = metrics.find(m => m.name === 'Retention')
    expect(retention?.change).toBe(5)
    expect(retention?.changePercent).toBeCloseTo(8.33, 1)
  })

  it('marks target met metrics as on-track', () => {
    const metrics = new KpiReportAnalyzer().analyze([{ name: 'Retention', current: 75, previous: 60, target: 70 }]).metrics
    expect(metrics[0].status).toBe('on-track')
  })

  it('marks target missed metrics as below-target', () => {
    const metrics = new KpiReportAnalyzer().analyze([{ name: 'Retention', current: 65, previous: 60, target: 70 }]).metrics
    expect(metrics[0].status).toBe('below-target')
  })

  it('flags metrics without a baseline', () => {
    const metrics = new KpiReportAnalyzer().analyze([{ name: 'Churn', current: 5 }]).metrics
    expect(metrics[0].status).toBe('no-baseline')
    expect(metrics[0].change).toBeNull()
  })

  it('marks metrics without a target as no-target', () => {
    const metrics = new KpiReportAnalyzer().analyze([{ name: 'Signups', current: 100, previous: 90 }]).metrics
    expect(metrics[0].status).toBe('no-target')
  })

  it('renders a KPI report', () => {
    const analyzer = new KpiReportAnalyzer()
    const report = analyzer.render(analyzer.analyze([{ name: 'Retention', current: 75, previous: 60, target: 70 }]))
    expect(report).toContain('KPI Report')
    expect(report).toContain('Retention')
    expect(report).toContain('on-track')
  })
})
