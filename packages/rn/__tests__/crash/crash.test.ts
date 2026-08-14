/**
 * vectalon crash — Crash Intelligence Agent (Roadmap 071) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { readFileSync } from 'fs'
import { runCrashAnalysis, detectCrashPlatform, parseCrashLog, writeCrashReport } from '../../src/crash'
import { createTempProject, cleanup } from '../helpers/tmp'

const IOS_NULL_LOG = `2026-08-01 10:00:00.000 MyApp[123:456] *** Terminating app due to uncaught exception 'NSInvalidArgumentException', reason: '-[MyViewController tableView] null is not an object'
* First throw call stack:
(
	0   CoreFoundation  __exceptionPreprocess + 220
	1   MyApp 0x0000000104a1d000 -[MyViewController viewDidLoad] (/Users/dev/MyApp/src/screens/Home.tsx:42)
	2   UIKitCore  -[UIApplication _run] + 1024
)
`

const ANDROID_OOM_LOG = `FATAL EXCEPTION: main
Process: com.example.app, PID: 12345
java.lang.OutOfMemoryError: Failed to allocate a 12345678 byte allocation
	at com.example.app.MainActivity.onCreate(MainActivity.java:33)
	at android.app.Activity.performCreate(Activity.java:8000)
`

describe('crash: detection + parsing', () => {
  it('auto-detects iOS from First throw call stack', () => {
    expect(detectCrashPlatform(IOS_NULL_LOG)).toBe('ios')
  })
  it('auto-detects Android from FATAL EXCEPTION', () => {
    expect(detectCrashPlatform(ANDROID_OOM_LOG)).toBe('android')
  })
  it('falls back to javascript for unknown formats', () => {
    expect(detectCrashPlatform('at render (App.tsx:12:3)')).toBe('javascript')
  })
  it('parses exception type and frames', () => {
    const parsed = parseCrashLog(IOS_NULL_LOG)
    expect(parsed.platform).toBe('ios')
    expect(parsed.exceptionType).toContain('NSInvalidArgumentException')
    expect(parsed.frames.length).toBeGreaterThan(0)
    expect(parsed.frames[0].function).toBeDefined()
  })
})

describe('crash: classification', () => {
  it('buckets a null-reference crash as changes-requested with a fix', () => {
    const report = runCrashAnalysis(IOS_NULL_LOG)
    expect(report.platform).toBe('ios')
    expect(report.finding.bucket).toBe('null-reference')
    expect(report.finding.severity).toBe('error')
    expect(report.finding.fix).toContain('optional chaining')
    expect(report.verdict).toBe('changes-requested')
  })

  it('buckets an OOM as resource with investigation steps', () => {
    const report = runCrashAnalysis(ANDROID_OOM_LOG, { platform: 'android' })
    expect(report.finding.fix.length).toBeGreaterThan(10)
    expect(report.topFrames.length).toBeGreaterThan(0)
  })

  it('unknown crashes degrade to a warning bucket', () => {
    const report = runCrashAnalysis('some cryptic log without signatures')
    expect(report.finding.bucket).toBe('unknown')
    expect(report.finding.severity).toBe('warning')
    expect(report.verdict).toBe('needs-attention')
  })

  it('writes report.md and report.json', () => {
    const dir = createTempProject({ 'package.json': '{}' })
    try {
      const report = runCrashAnalysis(IOS_NULL_LOG)
      const { mdPath, jsonPath } = writeCrashReport(dir, report)
      expect(readFileSync(mdPath, 'utf-8')).toContain('vectalon crash')
      expect(readFileSync(jsonPath, 'utf-8')).toContain('"bucket"')
    } finally {
      cleanup(dir)
    }
  })
})
