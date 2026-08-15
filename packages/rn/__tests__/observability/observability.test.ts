/**
 * vectalon observability — Mobile Observability Agent (Roadmap 082) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { runObsScan, scanInstrumentation, scanTraces, SLOW_TRACE_THRESHOLD_MS, writeObsReport } from '../../src/observability'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('observability: scanInstrumentation', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('flags missing instrumentation when nothing is wired', () => {
    dir = createTempProject({
      'package.json': '{}',
      'src/App.tsx':        'export const App = () => null\n',
    })
    const findings = scanInstrumentation(dir)
    expect(findings.some(f => f.id === 'no-sentry-init')).toBe(true)
    expect(findings.some(f => f.id === 'no-crash-handler')).toBe(true)
    expect(findings.some(f => f.id === 'no-analytics-sdk')).toBe(true)
  })

  it('passes when Sentry init + crash handler + analytics are present', () => {
    dir = createTempProject({
      'package.json': '{}',
      'src/index.ts': [
        "import * as Sentry from '@sentry/react-native'",
        'Sentry.init({ dsn: "https://x@sentry.io/1" })',
        'ErrorUtils.setGlobalHandler(() => undefined)',
        'firebase.analytics().logEvent("app_open")',
        'Sentry.startTransaction({ name: "boot" })',
        'Sentry.addBreadcrumb({ message: "hi" })',
      ].join('\n') + '\n',
    })
    const findings = scanInstrumentation(dir)
    expect(findings).toHaveLength(0)
  })
})

describe('observability: scanTraces', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('flags slow traces above the threshold', () => {
    dir = createTempProject({
      'package.json': '{}',
      '.vectalon/telemetry/traces.jsonl': [
        JSON.stringify({ name: 'screen_load', durationMs: SLOW_TRACE_THRESHOLD_MS + 500, spans: [{ op: 'db', durationMs: 600 }] }),
        JSON.stringify({ name: 'fast', durationMs: 50 }),
      ].join('\n') + '\n',
    })
    const { traces, slow } = scanTraces(dir)
    expect(traces).toHaveLength(2)
    expect(slow.length).toBe(1)
    expect(slow[0].name).toBe('screen_load')
    expect(slow[0].spans.some(s => s.op === 'db')).toBe(true)
  })
})

describe('observability: runObsScan', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('combines instrumentation gaps and slow traces into a verdict', () => {
    dir = createTempProject({
      'package.json': '{}',
      'src/App.tsx':        'export const App = () => null\n',
      '.vectalon/telemetry/traces.jsonl': JSON.stringify({ name: 'boot', durationMs: SLOW_TRACE_THRESHOLD_MS * 6 }) + '\n',
    })
    const report = runObsScan(dir)
    expect(report.findings.some(f => f.id === 'no-sentry-init')).toBe(true)
    expect(report.findings.some(f => f.id === 'slow-trace')).toBe(true)
    expect(report.slowTraces.length).toBe(1)
    expect(report.verdict).toBe('needs-attention')
  })

  it('writes report.md and report.json', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = runObsScan(dir)
    const { mdPath, jsonPath } = writeObsReport(dir, report)
    expect(mdPath).toContain('observability')
    expect(jsonPath).toContain('report.json')
  })
})
