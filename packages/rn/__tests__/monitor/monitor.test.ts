/**
 * vectalon monitor — Observability Dashboard Agent (Roadmap 094) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { runMonitor } from '../../src/monitor'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('monitor: runMonitor', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('aggregates surfaces with no reports into an approved state', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = runMonitor(dir)
    expect(report.surfaces).toHaveLength(4)
    expect(report.surfaces.every(s => s.verdict === 'no-data')).toBe(true)
    expect(report.crashClasses).toBe(0)
    expect(report.telemetryEvents).toBe(0)
    expect(report.verdict).toBe('approved')
  })

  it('warns when telemetry surfaces are entirely missing', () => {
    dir = createTempProject({})
    const report = runMonitor(dir)
    expect(report.findings.some(f => f.id === 'telemetry-missing')).toBe(true)
  })

  it('folds report verdicts and telemetry event counts into one view', () => {
    dir = createTempProject({
      'docs/vectalon/sentry/report.json': JSON.stringify({
        verdict: 'needs-attention',
        crashClasses: [{ id: 'NullPointer' }, { id: 'OOM' }],
      }),
      'docs/vectalon/observability/report.json': JSON.stringify({ verdict: 'approved', findings: [{ id: 'x' }] }),
      'docs/vectalon/crash/report.json': JSON.stringify({ verdict: 'needs-attention', finding: { bucket: 'null-reference' } }),
      'docs/vectalon/dashboard/report.json': JSON.stringify({ verdict: 'approved' }),
      '.vectalon/telemetry/events.jsonl': '{"t":1}\n{"t":2}\n{"t":3}\n',
    })
    const report = runMonitor(dir)
    expect(report.crashClasses).toBe(2)
    expect(report.telemetryEvents).toBe(3)
    expect(report.surfaces.find(s => s.id === 'sentry')?.verdict).toBe('needs-attention')
    expect(report.surfaces.find(s => s.id === 'crash')?.summary).toContain('null-reference')
    expect(report.verdict).toBe('needs-attention')
  })

  it('escalates to changes-requested when a surface requires it', () => {
    dir = createTempProject({
      'docs/vectalon/sentry/report.json': JSON.stringify({ verdict: 'changes-requested', crashClasses: 1 }),
      'docs/vectalon/observability/report.json': JSON.stringify({ verdict: 'approved' }),
    })
    const report = runMonitor(dir)
    expect(report.verdict).toBe('changes-requested')
  })
})
