import { RootCauseAnalyzer } from '../../src/sdlc/RootCauseAnalyzer'
import { IncidentAnalyzer } from '../../src/sdlc/IncidentAnalyzer'
import { KpiReportAnalyzer } from '../../src/sdlc/KpiReportAnalyzer'
import { parseTelemetryContent } from '../../src/knowledge/telemetry'
import type { ParsedCrash, ParsedTrace, TelemetryEvent } from '../../src/knowledge/telemetry'

function crash(overrides: Partial<ParsedCrash> = {}): ParsedCrash {
  return {
    kind: 'crash',
    id: `c-${Math.random().toString(36).slice(2, 8)}`,
    source: 'sentry',
    exceptionType: 'TypeError',
    message: 'Cannot read property of undefined',
    frames: [],
    ...overrides,
  }
}

describe('RootCauseAnalyzer.analyzeCrash', () => {
  it('classifies a native crash from the exception type', () => {
    const result = new RootCauseAnalyzer().analyzeCrash(crash({ exceptionType: 'java.lang.NullPointerException', message: 'Fatal Exception: java.lang.NullPointerException' }))
    expect(result.bucket).toBe('native-crash')
    expect(result.crashFacts.eventId).toBeTruthy()
  })

  it('classifies an out-of-memory crash', () => {
    const result = new RootCauseAnalyzer().analyzeCrash(crash({ exceptionType: 'OSError', message: 'Out of memory: failed to allocate 512 MB' }))
    expect(result.bucket).toBe('memory-pressure')
  })

  it('classifies an ANR from the message', () => {
    const result = new RootCauseAnalyzer().analyzeCrash(crash({ exceptionType: 'ANR', message: 'Input dispatching timed out' }))
    expect(result.bucket).toBe('anr')
  })

  it('classifies null-reference crashes', () => {
    const result = new RootCauseAnalyzer().analyzeCrash(crash({ message: "TypeError: null is not an object (evaluating 'user.name')" }))
    expect(result.bucket).toBe('null-reference')
  })

  it('enriches the investigation with crash facts and top frames', () => {
    const result = new RootCauseAnalyzer().analyzeCrash(
      crash({
        release: '2.3.0',
        environment: 'production',
        frames: [
          { filename: 'src/screens/Profile.tsx', function: 'ProfileScreen', lineno: 88, inApp: true },
          { filename: 'src/api/client.ts', function: 'fetchProfile', lineno: 21, inApp: true },
          { filename: 'node_modules/foo/index.js', function: 'x', inApp: false },
        ],
      })
    )
    const joined = result.investigation.join('\n')
    expect(joined).toContain('release 2.3.0')
    expect(joined).toContain('production')
    expect(joined).toContain('ProfileScreen')
    expect(joined).toContain('src/screens/Profile.tsx:88')
    // Non-app frames are deprioritized in the leads list.
    expect(joined).not.toContain('node_modules/foo')
  })

  it('renderCrash includes runtime facts', () => {
    const rendered = new RootCauseAnalyzer().renderCrash(
      new RootCauseAnalyzer().analyzeCrash(crash({ exceptionType: 'TypeError', release: '1.0.0' }))
    )
    expect(rendered).toContain('Event:')
    expect(rendered).toContain('Release: 1.0.0')
    expect(rendered).toContain('Bucket:')
  })
})

describe('IncidentAnalyzer with telemetry', () => {
  it('derives severity, impact, and cause from crash reports', () => {
    const crashes = [
      crash({ exceptionType: 'java.lang.NullPointerException', message: 'Fatal Exception: java.lang.NullPointerException', release: '2.4.0', user: { id: 'u1' } }),
      crash({ exceptionType: 'java.lang.NullPointerException', message: 'Fatal Exception: java.lang.NullPointerException', release: '2.4.0', user: { id: 'u2' } }),
      crash({ exceptionType: 'java.lang.NullPointerException', message: 'Fatal Exception: java.lang.NullPointerException', release: '2.4.0', user: { id: 'u3' } }),
      crash({ exceptionType: 'java.lang.NullPointerException', message: 'Fatal Exception: java.lang.NullPointerException', release: '2.4.0', user: { id: 'u4' } }),
      crash({ exceptionType: 'java.lang.NullPointerException', message: 'Fatal Exception: java.lang.NullPointerException', release: '2.4.0', user: { id: 'u5' } }),
    ]
    const analysis = new IncidentAnalyzer().analyze({
      title: 'Crash wave',
      description: 'Users report the app closing on the profile screen',
      crashes,
    })

    expect(analysis.severity).toBe('sev1')
    expect(analysis.impact).toContain('5 crash report(s)')
    expect(analysis.impact).toContain('5 user(s)')
    expect(analysis.impact).toContain('release 2.4.0')
    expect(analysis.causeBucket).toBe('native-crash')
  })

  it('uses the earliest crash timestamp in the timeline', () => {
    const analysis = new IncidentAnalyzer().analyze({
      title: 't',
      description: 'x',
      crashes: [crash({ timestamp: 1700000000000 }), crash({ timestamp: 1700000500000 })],
    })
    expect(analysis.timeline[0]).toContain('Detected: 2023-11-14T22:13:20.000Z')
  })

  it('reports slow traces in the actions', () => {
    const traces: ParsedTrace[] = [
      { kind: 'performance', name: 'Home Load', durationMs: 4500, source: 'generic' },
      { kind: 'performance', name: 'Fast', durationMs: 50, source: 'generic' },
    ]
    const analysis = new IncidentAnalyzer().analyze({
      title: 't',
      description: 'Slow startup',
      crashes: [crash()],
      traces,
    })
    expect(analysis.actions.some(a => a.includes('Home Load') && a.includes('4500 ms'))).toBe(true)
  })

  it('falls back to text-only analysis without telemetry', () => {
    const analysis = new IncidentAnalyzer().analyze({ title: 't', description: 'App is down for all users' })
    expect(analysis.severity).toBe('sev1')
    expect(analysis.impact).toBe('Unknown — assess affected users and services.')
  })
})

describe('KpiReportAnalyzer.analyzeFromEvents', () => {
  function events(crashesCount: number, traces: number[], analyticsNames: string[]): TelemetryEvent[] {
    const out: TelemetryEvent[] = []
    for (let i = 0; i < crashesCount; i++) out.push(crash({ id: `k${i}`, user: { id: `user-${i}` } }))
    for (const d of traces) out.push({ kind: 'performance', name: 'load', durationMs: d, source: 'generic' })
    for (const name of analyticsNames) out.push({ kind: 'analytics', name, source: 'generic' })
    return out
  }

  it('computes crash counts, affected users, and crash-free rate from sessions', () => {
    const result = new KpiReportAnalyzer().analyzeFromEvents(
      events(2, [], ['session_start', 'session_start', 'session_start', 'session_start', 'session_start']),
      { target: { 'crash-free-sessions': 99 }, previous: { 'crash-free-sessions': 95 } }
    )
    const byName = new Map(result.metrics.map(m => [m.name, m]))
    expect(byName.get('crashes')?.current).toBe(2)
    expect(byName.get('affected-users')?.current).toBe(2)
    expect(byName.get('crash-free-sessions')?.current).toBe(60)
    expect(byName.get('crash-free-sessions')?.status).toBe('below-target')
  })

  it('averages trace durations', () => {
    const result = new KpiReportAnalyzer().analyzeFromEvents(events(0, [100, 300], []))
    const byName = new Map(result.metrics.map(m => [m.name, m]))
    expect(byName.get('avg-trace-duration-ms')?.current).toBe(200)
  })

  it('reports the top analytics event', () => {
    const result = new KpiReportAnalyzer().analyzeFromEvents(events(0, [], ['tap', 'tap', 'screen_view']))
    const byName = new Map(result.metrics.map(m => [m.name, m]))
    expect(byName.get('top-event-tap')?.current).toBe(2)
  })

  it('works with raw parsed telemetry content end-to-end', () => {
    const parsed = parseTelemetryContent(JSON.stringify([
      { event_id: 'x', exception: { values: [{ type: 'Error', value: 'boom' }] } },
      { trace: 'load', durationMs: 250 },
      { event: 'session_start', properties: {} },
    ]))
    const result = new KpiReportAnalyzer().analyzeFromEvents(parsed)
    expect(result.metrics.length).toBeGreaterThan(0)
  })
})
