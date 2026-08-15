/**
 * vectalon sentry — Sentry Intelligence Agent (Roadmap 081) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { groupCrashes, runSentryScan, findTelemetryDir, writeSentryReport } from '../../src/sentry'
import { parseSentryExport, parseTelemetryContent } from '../../src/knowledge/telemetry'
import { createTempProject, cleanup } from '../helpers/tmp'

const CRASH = {
  event_id: 'evt-1',
  timestamp: 1786450000,
  platform: 'javascript',
  release: '1.2.3',
  environment: 'production',
  exception: {
    values: [{ type: 'TypeError', value: 'Cannot read property "x" of undefined', stacktrace: { frames: [{ filename: 'App.js', function: 'render', lineno: 10, in_app: true }] } }],
  },
}

describe('sentry: parseSentryExport', () => {
  it('parses a crash export with exception data', () => {
    const parsed = parseSentryExport(CRASH)
    expect(parsed?.kind).toBe('crash')
    if (parsed && parsed.kind === 'crash') {
      expect(parsed.exceptionType).toBe('TypeError')
      expect(parsed.release).toBe('1.2.3')
      expect(parsed.frames.length).toBeGreaterThan(0)
    }
  })

  it('returns null for bare events without exceptions', () => {
    expect(parseSentryExport({ event_id: 'e2', message: 'hello' })).toBeNull()
  })
})

describe('sentry: groupCrashes', () => {
  it('groups crashes by exception type and ranks by volume', () => {
    const classes = groupCrashes([
      parseSentryExport(CRASH) as never,
      parseSentryExport(CRASH) as never,
      parseSentryExport({ ...CRASH, event_id: 'evt-2' }) as never,
      parseSentryExport({ ...CRASH, event_id: 'evt-3', exception: { values: [{ type: 'RangeError', value: 'x' }] } }) as never,
    ].filter(Boolean))
    expect(classes.length).toBe(2)
    const top = classes[0]
    expect(top.eventCount).toBe(3)
    expect(top.severity).toBe('warning')
    expect(top.bucket).toBe('null-reference')
  })
})

describe('sentry: runSentryScan', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('ranks crash classes from telemetry exports', () => {
    dir = createTempProject({
      'package.json': '{}',
      '.vectalon/telemetry/sentry-crash.json': JSON.stringify([CRASH, CRASH]),
    })
    const report = runSentryScan(dir)
    expect(findTelemetryDir(dir)).not.toBeNull()
    expect(report.events).toBe(2)
    expect(report.crashClasses.length).toBe(1)
    expect(report.crashClasses[0].exceptionType).toBe('TypeError')
  })

  it('reports when no telemetry directory exists', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = runSentryScan(dir)
    expect(findTelemetryDir(dir)).toBeNull()
    expect(report.findings.some(f => f.id === 'no-telemetry')).toBe(true)
  })

  it('writes report.md and report.json', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = runSentryScan(dir)
    const { mdPath, jsonPath } = writeSentryReport(dir, report)
    expect(mdPath).toContain('sentry')
    expect(jsonPath).toContain('report.json')
  })
})

describe('sentry: parseTelemetryContent roundtrip', () => {
  it('parses JSONL crash lines', () => {
    const events = parseTelemetryContent(`${JSON.stringify(CRASH)}\n${JSON.stringify({ ...CRASH, event_id: 'evt-9' })}\n`)
    expect(events.filter(e => e.kind === 'crash')).toHaveLength(2)
  })
})
