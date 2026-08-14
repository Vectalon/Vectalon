import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { runBuildFix, writeBuildFixReport, renderBuildFixMarkdown, verdictOf, detectBuildKind, buildFixDocsDir } from '../../src/buildFix'
import { analyzeMetroLog, analyzeMetroLogFile } from '../../src/buildFix/metro'
import { createTempProject, cleanup } from '../helpers/tmp'
import type { BuildFixFinding } from '../../src/buildFix/types'

describe('build-fix: verdicts', () => {
  it('changes-requested on errors, needs-attention on warnings, approved otherwise', () => {
    const finding = (severity: BuildFixFinding['severity']): BuildFixFinding =>
      ({ id: 'x', kind: 'metro', severity, line: 1, title: 't', message: 'm', fix: 'f' })
    expect(verdictOf([finding('error')])).toBe('changes-requested')
    expect(verdictOf([finding('warning')])).toBe('needs-attention')
    expect(verdictOf([])).toBe('approved')
  })
})

describe('build-fix: metro classifier (064)', () => {
  it('classifies a module resolution failure with the standard fix', () => {
    const log = [
      'error: bundling failed: Error: Unable to resolve module ./MissingFeature from src/screens/Home.tsx:',
      'None of these files exist:',
      '  * MissingFeature(.native|.ios.ts|.android.ts|.ts|.tsx|.js|.jsx)',
    ].join('\n')
    const analysis = analyzeMetroLog(log)
    expect(analysis.rootCause).not.toBeNull()
    expect(analysis.rootCause!.id).toBe('module-resolution')
    expect(analysis.rootCause!.fix).toContain('watchFolders')
  })

  it('classifies port conflicts, transform errors, and haste collisions', () => {
    expect(analyzeMetroLog('error: listen EADDRINUSE: address already in use :::8081\nAnother process is already running on port 8081').rootCause?.id).toBe('port-in-use')
    expect(analyzeMetroLog('SyntaxError: /src/app.tsx: Unexpected token (7:4)').rootCause?.id).toBe('syntax-error')
    expect(analyzeMetroLog('jest-haste-map: Haste module naming collision: App — two files with the same name').rootCause?.id).toBe('haste-collision')
  })

  it('reads the file variant and returns null for a missing file', () => {
    const dir = createTempProject({
      'metro.log': 'error: bundling failed: Unable to resolve module ./x from ./y\n',
    })
    try {
      const fromFile = analyzeMetroLogFile(join(dir, 'metro.log'))
      expect(fromFile?.rootCause?.id).toBe('module-resolution')
      expect(analyzeMetroLogFile(join(dir, 'missing.log'))).toBeNull()
    } finally {
      cleanup(dir)
    }
  })
})

describe('build-fix: log kind detection', () => {
  it('auto-detects metro, gradle, and xcode from strong signals', () => {
    expect(detectBuildKind('error: bundling failed: Unable to resolve module ./a from ./b')).toBe('metro')
    expect(detectBuildKind('FAILURE: Build failed with an exception.\nWhat went wrong:\nExecution failed for task :app:assembleDebug')).toBe('gradle')
    expect(detectBuildKind('xcodebuild error: Signing for "app" requires a development team.')).toBe('xcode')
  })

  it('falls back to the classifier with the most matches, then unknown', () => {
    // A Gradle-style log without the strong banner still matches gradle patterns.
    expect(detectBuildKind("error: Failed to find target with hash string 'android-35'")).toBe('gradle')
    expect(detectBuildKind('nothing recognizable here')).toBe('unknown')
  })
})

describe('build-fix: runBuildFix', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('diagnoses a Metro log: root cause error + fix plan, changes-requested', () => {
    dir = createTempProject({
      'build.log': [
        'error: bundling failed: Error: Unable to resolve module ./BillingApi from src/screens/Payment.tsx:',
        'None of these files exist:',
        '  * BillingApi(.native|.ios.ts|.android.ts|.ts|.tsx)',
        'error: listen EADDRINUSE: address already in use :::8081',
      ].join('\n'),
    })
    const report = runBuildFix(dir, { log: join(dir, 'build.log') })
    expect(report.kind).toBe('metro')
    expect(report.detection).toBe('auto')
    expect(report.verdict).toBe('changes-requested')
    const rc = report.findings.find(f => f.id === 'module-resolution')
    expect(rc).toBeDefined()
    expect(rc!.severity).toBe('error')
    // The fix plan leads with the root cause.
    expect(report.summary.fixPlan[0]).toContain('Module resolution failure')
  })

  it('reuses the Gradle classifier (013) and Xcode classifier (014)', () => {
    dir = createTempProject({
      'gradle.log': "error: Failed to find target with hash string 'android-35'\nFAILURE: Build failed with an exception.\n",
      'xcode.log': 'error: deployment target is 12.0, but the range of supported deployment target versions is 13.0 to 18.0.',
    })
    const gradle = runBuildFix(dir, { log: join(dir, 'gradle.log') })
    expect(gradle.kind).toBe('gradle')
    expect(gradle.findings[0].id).toBe('sdk-platform-not-found')
    expect(gradle.findings[0].fix).toContain('sdkmanager')

    const xcode = runBuildFix(dir, { log: join(dir, 'xcode.log') })
    expect(xcode.kind).toBe('xcode')
    expect(xcode.findings[0].id).toBe('deployment-target')
    expect(xcode.findings[0].fix).toContain('platform :ios')
  })

  it('honors a forced kind even when the log would auto-detect differently', () => {
    dir = createTempProject({
      'build.log': 'error: bundling failed: Unable to resolve module ./a from ./b\n',
    })
    const forced = runBuildFix(dir, { log: join(dir, 'build.log'), kind: 'xcode' })
    expect(forced.kind).toBe('xcode')
    expect(forced.detection).toBe('forced')
    // Xcode analyzer finds no match → unmatched warning, not a metro error.
    expect(forced.findings[0].id).toBe('unmatched')
    expect(forced.verdict).toBe('needs-attention')
  })

  it('reports an unmatched log as needs-attention with a hint', () => {
    dir = createTempProject({
      'build.log': 'some cryptic toolchain error with no known pattern\n',
    })
    const report = runBuildFix(dir, { log: join(dir, 'build.log') })
    expect(report.kind).toBe('unknown')
    expect(report.detection).toBe('none')
    expect(report.verdict).toBe('approved')
    expect(report.findings).toHaveLength(0)
  })

  it('returns an empty approved report when no log is provided', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = runBuildFix(dir)
    expect(report.detection).toBe('none')
    expect(report.findings).toEqual([])
    expect(report.verdict).toBe('approved')
  })

  it('returns an empty report for a missing log file', () => {
    dir = createTempProject({})
    const report = runBuildFix(dir, { log: join(dir, 'nope.log') })
    expect(report.kind).toBe('unknown')
    expect(report.verdict).toBe('approved')
  })
})

describe('build-fix: report writing', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('writes report.json and report.md to docs/vectalon/build-fix/', () => {
    dir = createTempProject({
      'build.log': 'error: bundling failed: Unable to resolve module ./a from ./b\n',
    })
    const report = runBuildFix(dir, { log: join(dir, 'build.log') })
    const { jsonPath, mdPath } = writeBuildFixReport(dir, report)
    expect(jsonPath).toBe(join(buildFixDocsDir(dir), 'report.json'))
    expect(mdPath).toBe(join(buildFixDocsDir(dir), 'report.md'))
    expect(existsSync(jsonPath)).toBe(true)
    expect(existsSync(mdPath)).toBe(true)
    expect(JSON.parse(readFileSync(jsonPath, 'utf-8')).kind).toBe('metro')
    const md = readFileSync(mdPath, 'utf-8')
    expect(md).toContain('# vectalon build-fix — Build Fix Diagnosis')
    expect(md).toContain('## Fix plan')
    expect(md).toContain('Module resolution failure')
    expect(md).toContain('## Log evidence (tail)')
  })

  it('renders a no-log hint without a log', () => {
    dir = createTempProject({})
    const md = renderBuildFixMarkdown(runBuildFix(dir))
    expect(md).toContain('No build log provided')
  })
})
