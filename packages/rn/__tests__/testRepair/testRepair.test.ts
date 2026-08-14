import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  runTestRepair,
  writeTestRepairReport,
  renderTestRepairMarkdown,
  verdictOf,
  detectTestKind,
  testRepairDocsDir,
} from '../../src/testRepair'
import { analyzeJestLog, analyzeJestLogFile } from '../../src/testRepair/jest'
import { analyzeDetoxLog } from '../../src/testRepair/detox'
import { analyzeMaestroLog } from '../../src/testRepair/maestro'
import { createTempProject, cleanup } from '../helpers/tmp'
import type { TestRepairFinding } from '../../src/testRepair/types'

describe('test-repair: verdicts', () => {
  it('changes-requested on errors, needs-attention on warnings, approved otherwise', () => {
    const finding = (severity: TestRepairFinding['severity']): TestRepairFinding =>
      ({ id: 'x', kind: 'jest', severity, line: 1, title: 't', message: 'm', fix: 'f' })
    expect(verdictOf([finding('error')])).toBe('changes-requested')
    expect(verdictOf([finding('warning')])).toBe('needs-attention')
    expect(verdictOf([])).toBe('approved')
  })
})

describe('test-repair: Jest classifier (065)', () => {
  it('classifies an assertion failure with the standard fix', () => {
    const log = [
      '  ✕ renders the total (5 ms)',
      '    expect(received).toBe(expected)',
      '    Expected: 42',
      '    Received: 0',
      '      at Object.<anonymous> (src/__tests__/Cart.test.tsx:18:25)',
    ].join('\n')
    const analysis = analyzeJestLog(log)
    expect(analysis.rootCause).not.toBeNull()
    expect(analysis.rootCause!.id).toBe('assertion-failure')
    expect(analysis.rootCause!.fix).toContain('Expected vs Received')
  })

  it('classifies snapshots, open handles, timeouts, and missing modules', () => {
    expect(analyzeJestLog('Snapshot name: `Payment screen renders 1`\nReceived value does not match the stored snapshot').rootCause?.id).toBe('snapshot-mismatch')
    expect(analyzeJestLog('Jest did not exit one second after the test run has completed.').rootCause?.id).toBe('open-handle')
    expect(analyzeJestLog('Exceeded timeout of 5000 ms for a test.').rootCause?.id).toBe('async-timeout')
    expect(analyzeJestLog('Cannot find module \'./api/client\' from \'src/__tests__/api.test.ts\'').rootCause?.id).toBe('module-resolution')
    expect(analyzeJestLog('● Test suite failed to run\nReferenceError: fetch is not defined').rootCause?.id).toBe('test-suite-error')
  })

  it('reads the file variant and returns null for a missing file', () => {
    const dir = createTempProject({
      'jest.log': 'expect(received).toBe(expected)\nExpected: 1\nReceived: 2\n',
    })
    try {
      const fromFile = analyzeJestLogFile(join(dir, 'jest.log'))
      expect(fromFile?.rootCause?.id).toBe('assertion-failure')
      expect(analyzeJestLogFile(join(dir, 'missing.log'))).toBeNull()
    } finally {
      cleanup(dir)
    }
  })
})

describe('test-repair: Detox + Maestro classifiers', () => {
  it('classifies Detox launch, element, and TOCTOU failures', () => {
    expect(analyzeDetoxLog('DetoxRuntimeError: Failed to launch the app on simulator').rootCause?.id).toBe('launch-failure')
    expect(analyzeDetoxLog('Wait for element(by.id("checkout")) to exist, 15000 ms').rootCause?.id).toBe('element-not-found')
    expect(analyzeDetoxLog('TOCTOU: the assertion raced a state change').rootCause?.id).toBe('toctou')
    expect(analyzeDetoxLog('device.launchApp({ permissions: { location: \'YES\' } })')).not.toBeNull()
  })

  it('classifies Maestro assertion, element, and device failures', () => {
    expect(analyzeMaestroLog('Assertion failed: assertVisible: "Welcome" is not visible').rootCause?.id).toBe('assertion-failed')
    expect(analyzeMaestroLog('Element with id "checkout-button" not found on screen').rootCause?.id).toBe('element-not-found')
    expect(analyzeMaestroLog('The app is not running').rootCause?.id).toBe('app-not-running')
    expect(analyzeMaestroLog('Please update Maestro to the latest version').rootCause?.id).toBe('version-mismatch')
  })
})

describe('test-repair: kind detection', () => {
  it('auto-detects jest, detox, and maestro from strong signals', () => {
    expect(detectTestKind('FAIL src/__tests__/Cart.test.tsx\n● Cart › renders the total\nexpect(received).toBe(expected)')).toBe('jest')
    expect(detectTestKind('DetoxRuntimeError: waitFor(element(by.id("x"))).toExist() timed out')).toBe('detox')
    expect(detectTestKind('Maestro: Flow checkout.yaml failed\nCould not find element with id "pay"')).toBe('maestro')
  })

  it('falls back to the classifier with the most matches, then unknown', () => {
    expect(detectTestKind('expect(received).toBe(expected)\nExpected: 1\nReceived: 2')).toBe('jest')
    expect(detectTestKind('nothing recognizable here')).toBe('unknown')
  })
})

describe('test-repair: runTestRepair', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('diagnoses a Jest log: root cause error + fix plan, changes-requested', () => {
    dir = createTempProject({
      'test.log': [
        'FAIL src/__tests__/Cart.test.tsx',
        '  ● Cart › renders the total',
        '    expect(received).toBe(expected)',
        '    Expected: 42',
        '    Received: 0',
        '  ● Cart › keeps focus',
        '    Exceeded timeout of 5000 ms for a test.',
      ].join('\n'),
    })
    const report = runTestRepair(dir, { log: join(dir, 'test.log') })
    expect(report.kind).toBe('jest')
    expect(report.detection).toBe('auto')
    expect(report.verdict).toBe('changes-requested')
    const rc = report.findings.find(f => f.id === 'assertion-failure')
    expect(rc).toBeDefined()
    expect(rc!.severity).toBe('error')
    // Fix plan leads with the root cause; the timeout corroborates.
    expect(report.summary.fixPlan[0]).toContain('Assertion failure')
    expect(report.findings.some(f => f.id === 'async-timeout')).toBe(true)
  })

  it('diagnoses Detox and Maestro logs', () => {
    dir = createTempProject({
      'detox.log': 'DetoxRuntimeError: Failed to launch the app on simulator\n  at Object.<anonymous> (e2e/firstTest.e2e.js:12:5)',
      'maestro.log': 'Assertion failed: assertVisible: "Welcome" is not visible\n',
    })
    const detox = runTestRepair(dir, { log: join(dir, 'detox.log') })
    expect(detox.kind).toBe('detox')
    expect(detox.findings[0].id).toBe('launch-failure')

    const maestro = runTestRepair(dir, { log: join(dir, 'maestro.log') })
    expect(maestro.kind).toBe('maestro')
    expect(maestro.findings[0].id).toBe('assertion-failed')
    expect(maestro.verdict).toBe('changes-requested')
  })

  it('honors a forced kind even when the log would auto-detect differently', () => {
    dir = createTempProject({
      'test.log': 'FAIL src/__tests__/x.test.ts\nexpect(received).toBe(expected)',
    })
    const forced = runTestRepair(dir, { log: join(dir, 'test.log'), kind: 'maestro' })
    expect(forced.kind).toBe('maestro')
    expect(forced.detection).toBe('forced')
    expect(forced.findings[0].id).toBe('unmatched')
    expect(forced.verdict).toBe('needs-attention')
  })

  it('returns empty approved reports with no log or a missing log', () => {
    dir = createTempProject({ 'package.json': '{}' })
    expect(runTestRepair(dir).detection).toBe('none')
    expect(runTestRepair(dir, { log: join(dir, 'nope.log') }).verdict).toBe('approved')
  })

  it('reports an unmatched log as an approved empty report', () => {
    dir = createTempProject({ 'test.log': 'some cryptic test output\n' })
    const report = runTestRepair(dir, { log: join(dir, 'test.log') })
    expect(report.kind).toBe('unknown')
    expect(report.detection).toBe('none')
    expect(report.findings).toHaveLength(0)
    expect(report.verdict).toBe('approved')
  })
})

describe('test-repair: report writing', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('writes report.json and report.md to docs/vectalon/test-repair/', () => {
    dir = createTempProject({
      'test.log': 'expect(received).toBe(expected)\nExpected: 1\nReceived: 2\n',
    })
    const report = runTestRepair(dir, { log: join(dir, 'test.log') })
    const { jsonPath, mdPath } = writeTestRepairReport(dir, report)
    expect(jsonPath).toBe(join(testRepairDocsDir(dir), 'report.json'))
    expect(mdPath).toBe(join(testRepairDocsDir(dir), 'report.md'))
    expect(existsSync(jsonPath)).toBe(true)
    expect(existsSync(mdPath)).toBe(true)
    expect(JSON.parse(readFileSync(jsonPath, 'utf-8')).kind).toBe('jest')
    const md = readFileSync(mdPath, 'utf-8')
    expect(md).toContain('# vectalon test-repair — Test Fix Diagnosis')
    expect(md).toContain('## Fix plan')
    expect(md).toContain('Assertion failure')
  })

  it('renders a no-log hint without a log', () => {
    dir = createTempProject({})
    expect(renderTestRepairMarkdown(runTestRepair(dir))).toContain('No test log provided')
  })
})
