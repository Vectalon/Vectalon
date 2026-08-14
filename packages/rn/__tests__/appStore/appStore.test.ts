/**
 * vectalon app-store — App Store Readiness Agent (Roadmap 074) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { readFileSync } from 'fs'
import { runStoreScan, writeStoreReport } from '../../src/appStore'
import { createTempProject, cleanup } from '../helpers/tmp'

describe('app-store: runStoreScan', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('flags a version mismatch between iOS and Android as an error', () => {
    dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', version: '1.2.0' }),
      'ios/App/Info.plist': '<dict><key>CFBundleShortVersionString</key><string>1.2.0</string><key>CFBundleVersion</key><string>7</string></dict>',
      'android/app/build.gradle': 'android {\n  versionCode 7\n  versionName "1.2.1"\n  applicationId "com.example.app"\n}\n',
    })
    const report = runStoreScan(dir)
    expect(report.platforms).toContain('ios')
    expect(report.platforms).toContain('android')
    expect(report.verdict).toBe('changes-requested')
    expect(report.findings.some(f => f.id === 'version')).toBe(true)
  })

  it('warns when iOS privacy manifest is missing', () => {
    dir = createTempProject({
      'package.json': '{}',
      'ios/App/Info.plist': '<dict><key>CFBundleShortVersionString</key><string>1.0.0</string><key>CFBundleVersion</key><string>1</string></dict>',
    })
    const report = runStoreScan(dir)
    expect(report.findings.some(f => f.id === 'ios' && f.severity === 'warning' && f.message.includes('privacy manifest'))).toBe(true)
  })

  it('approved when iOS and Android are consistent with icons', () => {
    dir = createTempProject({
      'package.json': JSON.stringify({ name: 'app', version: '2.0.0' }),
      'ios/App/Info.plist': '<dict><key>CFBundleShortVersionString</key><string>2.0.0</string><key>CFBundleVersion</key><string>3</string><key>CFBundleIcons</key><dict/></dict>',
      'android/app/build.gradle': 'android {\n  versionCode 3\n  versionName "2.0.0"\n  applicationId "com.example.app"\n  mipmap "ic_launcher"\n}\n',
    })
    const report = runStoreScan(dir)
    expect(report.findings.filter(f => f.severity === 'error')).toHaveLength(0)
    expect(report.verdict).not.toBe('changes-requested')
  })

  it('writes report.md and report.json', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = runStoreScan(dir)
    const { mdPath, jsonPath } = writeStoreReport(dir, report)
    expect(readFileSync(mdPath, 'utf-8')).toContain('app-store')
    expect(readFileSync(jsonPath, 'utf-8')).toContain('"verdict"')
  })
})
