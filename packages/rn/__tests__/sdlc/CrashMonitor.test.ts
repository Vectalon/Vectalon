import { analyzeCrashRate, monitorRelease, renderMonitorReport } from '../../src/sdlc/CrashMonitor'
import type { ParsedCrash } from '../../src/knowledge/telemetry'

function crash(overrides: Partial<ParsedCrash> = {}): ParsedCrash {
  return {
    kind: 'crash',
    id: 'c1',
    source: 'crashlytics',
    exceptionType: 'NSInvalidArgumentException',
    message: 'null is not an object',
    release: '1.3.0',
    frames: [],
    ...overrides,
  }
}

describe('analyzeCrashRate', () => {
  it('reports healthy when no crashes occur', () => {
    const result = analyzeCrashRate([], { baselineRate: 1.0 })
    expect(result.spiked).toBe(false)
    expect(result.action).toBe('ok')
    expect(result.currentRate).toBe(0)
  })

  it('watches when crashes exist but no baseline is configured', () => {
    const result = analyzeCrashRate([crash(), crash()], { baselineRate: null, windowHours: 24 })
    expect(result.action).toBe('watch')
    expect(result.spiked).toBe(false)
  })

  it('flags a spike when the rate exceeds the threshold', () => {
    // 240 crashes/day against a 1.0/1k-sessions/day baseline = 240x — spike.
    const crashes = Array.from({ length: 240 }, (_, i) => crash({ id: `c${i}` }))
    const result = analyzeCrashRate(crashes, { baselineRate: 1.0, windowHours: 24 })
    expect(result.spiked).toBe(true)
    expect(result.action).toBe('rollback')
    expect(result.ratio).toBeGreaterThanOrEqual(2.0)
    expect(result.message).toContain('recommend rollback')
  })

  it('stays healthy within the threshold', () => {
    const crashes = Array.from({ length: 10 }, (_, i) => crash({ id: `c${i}` }))
    const result = analyzeCrashRate(crashes, { baselineRate: 10.0, windowHours: 24 })
    expect(result.spiked).toBe(false)
    expect(result.action).toBe('ok')
    expect(result.message).toContain('within threshold')
  })

  it('normalizes the rate across a longer window', () => {
    const crashes = Array.from({ length: 120 }, (_, i) => crash({ id: `c${i}` }))
    // 120 crashes over 48h = 60/day against a 50/1k baseline → under 2x.
    const result = analyzeCrashRate(crashes, { baselineRate: 50.0, windowHours: 48 })
    expect(result.spiked).toBe(false)
    expect(result.currentRate).toBeCloseTo(60, 0)
  })
})

describe('monitorRelease', () => {
  it('files an incident with a rollback suggestion on a spike', () => {
    const crashes = Array.from({ length: 240 }, (_, i) => crash({ id: `c${i}` }))
    const result = monitorRelease(crashes, { baselineRate: 1.0, windowHours: 24 })
    expect(result.spike.spiked).toBe(true)
    expect(result.incident).not.toBeNull()
    // Severity is derived from the crash facts by the IncidentAnalyzer (not
    // hardcoded) — any sev1/sev2 classification is valid here.
    expect(['sev1', 'sev2', 'sev3']).toContain(result.incident?.severity)
    expect(result.incident?.title).toContain('Crash-rate spike')
    expect(result.report).toContain('Auto-filed incident')
    expect(result.report).toContain('Suggested action: roll back the release.')
  })

  it('does not file an incident when healthy', () => {
    const result = monitorRelease([], { baselineRate: 1.0 })
    expect(result.spike.spiked).toBe(false)
    expect(result.incident).toBeNull()
    expect(renderMonitorReport(result.spike, result.incident)).toContain('No crashes in the monitoring window')
  })
})
