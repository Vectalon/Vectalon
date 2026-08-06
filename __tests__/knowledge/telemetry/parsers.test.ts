import {
  parseTelemetryContent,
  parseSentryExport,
  parseCrashlyticsReport,
  parsePerformanceTrace,
  parseAnalyticsEvent,
  detectTelemetryFormat,
} from '../../../src/knowledge/telemetry'
import type { ParsedCrash } from '../../../src/knowledge/telemetry'

describe('telemetry parsers', () => {
  describe('detectTelemetryFormat', () => {
    it('detects sentry, crashlytics, performance, and analytics formats', () => {
      expect(detectTelemetryFormat({ event_id: 'e1', exception: { values: [] } })).toBe('sentry')
      expect(detectTelemetryFormat({ app_info: {}, exception: {} })).toBe('crashlytics')
      expect(detectTelemetryFormat({ type: 'transaction', transaction: 'Screen', spans: [] })).toBe('performance')
      expect(detectTelemetryFormat({ event_name: 'purchase', event_params: [] })).toBe('analytics')
      expect(detectTelemetryFormat({ foo: 1 })).toBe('unknown')
    })
  })

  describe('parseSentryExport', () => {
    it('parses a crash event with exception values and stack frames', () => {
      const crash = parseSentryExport({
        event_id: 'abc123',
        timestamp: 1700000000.5,
        message: 'TypeError: Cannot read property \'x\' of undefined',
        culprit: 'app/src/Bar.tsx in render',
        platform: 'javascript',
        release: '1.2.3 (42)',
        environment: 'production',
        fingerprint: ['group-a', 'group-b'],
        user: { id: 'u_1', email: 'a@b.c' },
        tags: { 'app.version': '1.2.3' },
        exception: {
          values: [
            {
              type: 'TypeError',
              value: "Cannot read property 'x' of undefined",
              stacktrace: {
                frames: [
                  { filename: 'app/src/Bar.tsx', function: 'render', lineno: 42, in_app: true },
                  { filename: 'app/src/App.tsx', function: 'App', lineno: 10, in_app: true },
                ],
              },
            },
          ],
        },
      }) as ParsedCrash | null

      expect(crash).not.toBeNull()
      expect(crash?.kind).toBe('crash')
      expect(crash?.id).toBe('abc123')
      expect(crash?.exceptionType).toBe('TypeError')
      expect(crash?.message).toContain('Cannot read property')
      expect(crash?.release).toBe('1.2.3 (42)')
      expect(crash?.environment).toBe('production')
      expect(crash?.timestamp).toBe(1700000000500)
      expect(crash?.frames).toHaveLength(2)
      expect(crash?.frames[0]).toMatchObject({ filename: 'app/src/Bar.tsx', lineno: 42, inApp: true })
      expect(crash?.user?.id).toBe('u_1')
      expect(crash?.fingerprint).toEqual(['group-a', 'group-b'])
    })

    it('does not classify exception-less log events as crashes', () => {
      const crash = parseSentryExport({ event_id: 'log-1', message: 'something happened', timestamp: 1700000000 })
      expect(crash).toBeNull()
    })

    it('parses sentry envelope payloads', () => {
      const crash = parseSentryExport({
        type: 'event',
        payload: { event_id: 'env-1', exception: { values: [{ type: 'Error', value: 'boom' }] } },
      }) as ParsedCrash | null
      expect(crash?.id).toBe('env-1')
      expect(crash?.exceptionType).toBe('Error')
    })

    it('parses a transaction as a performance trace', () => {
      const trace = parseSentryExport({
        type: 'transaction',
        transaction: 'Home Load',
        op: 'ui.load',
        start_timestamp: 1700000000,
        timestamp: 1700000001.25,
        spans: [
          { op: 'http', description: 'GET /api/home', start_timestamp: 1700000000.1, timestamp: 1700000000.4 },
        ],
        release: '1.2.3',
      })
      expect(trace?.kind).toBe('performance')
      if (trace?.kind === 'performance') {
        expect(trace.name).toBe('Home Load')
        expect(trace.durationMs).toBe(1250)
        expect(trace.spans?.[0]).toMatchObject({ op: 'http', durationMs: 300 })
      }
    })
  })

  describe('parseCrashlyticsReport', () => {
    it('parses a Firebase Crashlytics crash report', () => {
      const crash = parseCrashlyticsReport({
        app_info: { app_id: '1:2:android:abc', app_name: 'HVAC', app_version: '2.4.0', build_version: '81' },
        device_info: { device_name: 'Pixel 8', os_version: '14', os: 'ANDROID' },
        event: { id: 'crash-9', type: 'crash', timestamp: 1700000000123456, process_state: 'FOREGROUND' },
        metadata: { issue_id: 'issue-77' },
        user_info: { user_id: 'user_42' },
        exception: {
          reason: 'Fatal Exception: java.lang.NullPointerException: Attempt to invoke virtual method on null object',
          type: 'java.lang.NullPointerException',
          stackTrace: 'at com.app.Main.onCreate(Main.java:12)\nat android.app.Activity.performCreate',
        },
      }) as ParsedCrash | null

      expect(crash).not.toBeNull()
      expect(crash?.kind).toBe('crash')
      expect(crash?.source).toBe('crashlytics')
      expect(crash?.id).toBe('crash-9')
      expect(crash?.exceptionType).toBe('java.lang.NullPointerException')
      expect(crash?.message).toContain('Fatal Exception')
      expect(crash?.platform).toBe('android')
      expect(crash?.release).toBe('2.4.0 (81)')
      expect(crash?.timestamp).toBe(1700000000123)
      expect(crash?.fingerprint).toEqual(['issue-77'])
      expect(crash?.frames.length).toBeGreaterThan(1)
      expect(crash?.frames[0].filename).toContain('Main.onCreate')
    })

    it('handles a missing app version in the release string', () => {
      const crash = parseCrashlyticsReport({
        app_info: { build_version: '81' },
        event: { id: 'c2', type: 'crash' },
        exception: { reason: 'boom' },
      }) as ParsedCrash | null
      expect(crash?.release).toBe('81')
    })

    it('parses an ANR report and ignores non-crash events', () => {
      const anr = parseCrashlyticsReport({
        app_info: { app_version: '1.0' },
        event: { id: 'anr-1', type: 'anr', timestamp: 1700000000000000 },
        exception: { reason: 'Input dispatching timed out', type: 'ANR' },
      })
      expect(anr?.kind).toBe('crash')
      expect(anr?.exceptionType).toBe('ANR')

      const ignored = parseCrashlyticsReport({ app_info: {}, event: { type: 'something-else' } })
      expect(ignored).toBeNull()
    })
  })

  describe('parsePerformanceTrace', () => {
    it('parses a firebase-style trace with durationMs', () => {
      const trace = parsePerformanceTrace({
        name: 'screen_load',
        durationMs: 1234,
        attributes: { screen: 'home' },
        source: 'firebase',
      })
      expect(trace?.kind).toBe('performance')
      if (trace?.kind === 'performance') {
        expect(trace.name).toBe('screen_load')
        expect(trace.durationMs).toBe(1234)
        expect(trace.source).toBe('firebase')
      }
    })

    it('parses a generic trace with duration_ms', () => {
      const trace = parsePerformanceTrace({ trace: 'api_latency', duration_ms: 456 })
      expect(trace?.kind).toBe('performance')
      if (trace?.kind === 'performance') expect(trace.durationMs).toBe(456)
    })
  })

  describe('parseAnalyticsEvent', () => {
    it('parses a Firebase BigQuery export row', () => {
      const event = parseAnalyticsEvent({
        event_date: '20240101',
        event_timestamp: 1700000000000000,
        event_name: 'purchase',
        user_pseudo_id: 'pseudo-1',
        platform: 'ANDROID',
        event_params: [
          { key: 'currency', value: { string_value: 'USD' } },
          { key: 'value', value: { double_value: 9.99 } },
          { key: 'logged_in', value: { int_value: 1 } },
        ],
      })
      expect(event?.kind).toBe('analytics')
      expect(event?.name).toBe('purchase')
      expect(event?.source).toBe('firebase')
      expect(event?.platform).toBe('android')
      expect(event?.timestamp).toBe(1700000000000)
      expect(event?.properties).toEqual({ currency: 'USD', value: 9.99, logged_in: 1 })
    })

    it('parses a generic analytics event', () => {
      const event = parseAnalyticsEvent({ event: 'screen_view', properties: { screen: 'Home' }, timestamp: 1700000000 })
      expect(event?.name).toBe('screen_view')
      expect(event?.source).toBe('generic')
      expect(event?.properties).toEqual({ screen: 'Home' })
    })
  })

  describe('parseTelemetryContent', () => {
    it('parses JSONL crashlytics exports', () => {
      const line1 = JSON.stringify({ app_info: { app_version: '1.0' }, event: { id: 'c1', type: 'crash' }, exception: { reason: 'boom' } })
      const line2 = JSON.stringify({ event_name: 'session_start', event_params: [] })
      const events = parseTelemetryContent(`${line1}\n${line2}\n`)
      expect(events).toHaveLength(2)
      expect(events[0].kind).toBe('crash')
      expect(events[1].kind).toBe('analytics')
    })

    it('parses arrays of events', () => {
      const events = parseTelemetryContent(JSON.stringify([
        { event_id: 'a', exception: { values: [{ type: 'Error', value: 'x' }] } },
        { event: 'tap', properties: {} },
      ]))
      expect(events).toHaveLength(2)
    })

    it('returns nothing for invalid JSON', () => {
      expect(parseTelemetryContent('this is not json')).toHaveLength(0)
    })
  })
})
