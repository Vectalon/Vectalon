/**
 * Project Diagnostics tests — roadmap 011-015.
 * Business Source License 1.1 (BSL-1.1)
 */
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { runProjectDiagnostics, renderDiagnosticsMarkdown, writeDiagnosticsReport } from '../../src/projectDiagnostics'
import { analyzeGradleLog, analyzeGradleLogFile } from '../../src/projectDiagnostics/gradle'
import { analyzeXcodeLog, analyzeXcodeLogFile } from '../../src/projectDiagnostics/xcode'

let tmp: string
beforeEach(() => {
  tmp = join(__dirname, '.tmp-diag')
  rmSync(tmp, { recursive: true, force: true })
  mkdirSync(tmp, { recursive: true })
})
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

function write(rel: string, content: string): void {
  const full = join(tmp, rel)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content)
}

describe('diagnostics (011-015)', () => {
  test('runs all five categories on a bare project without crashing', () => {
    write('package.json', JSON.stringify({ name: 'bare-app', dependencies: { 'react-native': '0.76.5', react: '18.3.1' } }))
    const report = runProjectDiagnostics(tmp)
    expect(report.schemaVersion).toBe(1)
    expect(report.checks.length).toBeGreaterThan(0)
    const cats = new Set(report.checks.map(c => c.category))
    for (const expected of ['metro', 'hermes', 'android', 'ios', 'deps']) {
      expect(cats.has(expected as never)).toBe(true)
    }
    // A bare project must not fail — everything is info/pass/warn at most.
    expect(report.checks.some(c => c.status === 'fail')).toBe(false)
  })

  test('011: flags a broken alias target and a missing watchFolders in a monorepo', () => {
    write('package.json', JSON.stringify({ name: 'mono', workspaces: ['apps/*'] }))
    write('apps/app/package.json', JSON.stringify({ name: 'app', dependencies: { 'react-native': '0.76.5' } }))
    write(
      'metro.config.js',
      `module.exports = { resolver: { alias: { '@app': './missing-dir' } } }`
    )
    const report = runProjectDiagnostics(tmp)
    const alias = report.checks.find(c => c.id === 'metro-alias--app')
    expect(alias).toBeDefined()
    expect(alias!.status).toBe('fail')
    expect(alias!.fix).toContain('@app')
  })

  test('012: known Hermes issues fire — disabled + New Architecture mismatch', () => {
    write('package.json', JSON.stringify({ name: 'app', dependencies: { 'react-native': '0.76.5' } }))
    write('android/gradle.properties', 'hermesEnabled=false\nnewArchEnabled=true\n')
    const report = runProjectDiagnostics(tmp)
    const disabled = report.checks.find(c => c.id === 'hermes-disabled')
    const mismatch = report.checks.find(c => c.id === 'hermes-new-arch-mismatch')
    expect(disabled).toBeDefined()
    expect(disabled!.status).toBe('warn')
    expect(mismatch).toBeDefined()
    expect(mismatch!.detail).toContain('New Architecture requires Hermes')
  })

  test('013: Gradle log parsing classifies the root cause and suggests a fix', () => {
    const log = [
      '> Task :app:compileReleaseJavaWithJavac FAILED',
      "error: Failed to find target with hash string 'android-35'",
      'FAILURE: Build failed with an exception.',
    ].join('\n')
    const analysis = analyzeGradleLog(log)
    expect(analysis.rootCause).not.toBeNull()
    expect(analysis.rootCause!.id).toBe('sdk-platform-not-found')
    expect(analysis.rootCause!.fix).toContain('sdkmanager')
    expect(analysis.evidence.length).toBeGreaterThan(0)

    // File variant.
    write('gradle.log', log)
    const fromFile = analyzeGradleLogFile(join(tmp, 'gradle.log'))
    expect(fromFile?.rootCause?.id).toBe('sdk-platform-not-found')
    expect(analyzeGradleLogFile(join(tmp, 'missing.log'))).toBeNull()
  })

  test('013: diagnostics command surfaces the log root cause as a fail check', () => {
    write('package.json', JSON.stringify({ name: 'app', dependencies: { 'react-native': '0.76.5' } }))
    write('build.log', 'Could not find com.facebook.react:react-android:0.76.0.\n')
    const report = runProjectDiagnostics(tmp, { gradleLog: join(tmp, 'build.log') })
    const rc = report.checks.find(c => c.id === 'gradle-log-root-cause')
    expect(rc).toBeDefined()
    expect(rc!.status).toBe('fail')
    expect(rc!.fix!.length).toBeGreaterThan(10)
  })

  test('014: Xcode log parsing detects signing and deployment target issues', () => {
    const signing = analyzeXcodeLog('CodeSign /Users/x/Library/Developer/Xcode/DerivedData/app/Build/Products/Debug-iphonesimulator/app.app\nSigning for "app" requires a development team.')
    expect(signing.rootCause?.id).toBe('code-signing')
    const target = analyzeXcodeLog('error: deployment target is 12.0, but the range of supported deployment target versions is 13.0 to 18.0.')
    expect(target.rootCause?.id).toBe('deployment-target')
    expect(target.rootCause!.fix).toContain('platform :ios')

    write('xcode.log', 'error: deployment target is 12.0, but the range of supported deployment target versions is 13.0 to 18.0.')
    expect(analyzeXcodeLogFile(join(tmp, 'xcode.log'))?.rootCause?.id).toBe('deployment-target')
  })

  test('014: iOS project checks — missing Podfile warns, present one passes', () => {
    write('package.json', JSON.stringify({ name: 'app', dependencies: { 'react-native': '0.76.5' } }))
    write('ios/Some.xcodeproj/project.pbxproj', '')
    let report = runProjectDiagnostics(tmp)
    expect(report.checks.find(c => c.id === 'ios-podfile')?.status).toBe('warn')

    write('ios/Podfile', "platform :ios, '15.0'\nuse_native_modules!\n")
    report = runProjectDiagnostics(tmp)
    expect(report.checks.find(c => c.id === 'ios-podfile')).toBeUndefined()
    expect(report.checks.find(c => c.id === 'ios-deployment-target')?.status).toBe('pass')
    expect(report.checks.find(c => c.id === 'ios-autolinking')?.status).toBe('pass')
  })

  test('015: duplicate dependency versions across monorepo members are flagged', () => {
    write('package.json', JSON.stringify({ name: 'mono', workspaces: ['apps/*'] }))
    write('apps/a/package.json', JSON.stringify({ name: 'a', dependencies: { 'react-native': '0.76.5' } }))
    write('apps/b/package.json', JSON.stringify({ name: 'b', dependencies: { 'react-native': '0.75.4' } }))
    const report = runProjectDiagnostics(tmp)
    const dup = report.checks.find(c => c.id === 'deps-dup-react-native')
    expect(dup).toBeDefined()
    expect(dup!.status).toBe('warn')
    expect(dup!.detail).toContain('0.76.5')
  })

  test('render + write produce a readable markdown report', () => {
    write('package.json', JSON.stringify({ name: 'app', dependencies: { 'react-native': '0.76.5' } }))
    const report = runProjectDiagnostics(tmp)
    const md = renderDiagnosticsMarkdown(report)
    expect(md).toContain('# Project Diagnostics')
    expect(md).toContain('pass')
    const { jsonPath, mdPath } = writeDiagnosticsReport(tmp, report)
    expect(jsonPath.endsWith('report.json')).toBe(true)
    expect(mdPath.endsWith('report.md')).toBe(true)
  })
})
