/**
 * vectalon play-store — Deep Play Store Readiness Agent (Roadmap 087) — hermetic tests.
 * Business Source License 1.1 (BSL-1.1)
 */
import { writeFileSync } from 'fs'
import { join } from 'path'
import { runPlayScan, pngDimensions, writePlayReport } from '../../src/playStore'
import { createTempProject, cleanup } from '../helpers/tmp'

/** Minimal valid PNG header (signature + IHDR) with the given dimensions. */
function fakePng(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24)
  buf.writeUInt32BE(0x89504e47, 0)
  buf.writeUInt32BE(0x0d0a1a0a, 4)
  buf.writeUInt32BE(13, 8) // IHDR length
  buf.write('IHDR', 12)
  buf.writeUInt32BE(width, 16)
  buf.writeUInt32BE(height, 20)
  return buf
}

const MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.example.app">
  <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
  <uses-permission android:name="android.permission.INTERNET" />
  <application android:allowBackup="false">
    <activity android:name=".MainActivity" android:exported="true" />
  </application>
</manifest>`

const GRADLE = `android {
  namespace = "com.example.app"
  compileSdk 35
  defaultConfig {
    applicationId "com.example.app"
    minSdk 24
    targetSdk 35
    versionCode 12
    versionName "2.1.0"
  }
  signingConfigs { release { storeFile file("keystore.jks") } }
}`

describe('playStore: pngDimensions', () => {
  it('reads PNG width and height from the IHDR chunk', () => {
    expect(pngDimensions(fakePng(512, 512))).toEqual({ width: 512, height: 512 })
  })

  it('returns null for non-PNG buffers', () => {
    expect(pngDimensions(Buffer.from('not a png'))).toBeNull()
  })
})

describe('playStore: runPlayScan', () => {
  let dir: string
  afterEach(() => cleanup(dir))

  it('passes a well-prepared Play surface', () => {
    dir = createTempProject({
      'package.json': '{}',
      'android/app/src/main/AndroidManifest.xml': MANIFEST,
      'android/app/build.gradle': GRADLE,
      'play/short_description.txt': 'A short description',
      'play/full_description.txt': 'A full description. '.repeat(20),
    })
    writeFileSync(join(dir, 'play/icon-512.png'), fakePng(512, 512))
    writeFileSync(join(dir, 'play/feature-graphic.png'), fakePng(1024, 500))
    writeFileSync(join(dir, 'play/phone-1.png'), fakePng(1080, 2340))
    writeFileSync(join(dir, 'play/phone-2.png'), fakePng(1080, 2340))
    const report = runPlayScan(dir)
    expect(report.checks.find(c => c.id === 'package')?.status).toBe('pass')
    expect(report.checks.find(c => c.id === 'target-sdk')?.status).toBe('pass')
    expect(report.checks.find(c => c.id === 'icon')?.status).toBe('pass')
    expect(report.checks.find(c => c.id === 'feature-graphic')?.status).toBe('pass')
    expect(report.checks.find(c => c.id === 'signing')?.status).toBe('pass')
    expect(report.findings.filter(f => f.severity === 'error')).toHaveLength(0)
  })

  it('flags data-safety permissions, missing assets, and cleartext', () => {
    dir = createTempProject({
      'package.json': '{}',
      'android/app/src/main/AndroidManifest.xml': MANIFEST.replace('android:allowBackup="false"', 'android:allowBackup="true" android:usesCleartextTraffic="true"'),
      'android/app/build.gradle': GRADLE.replace('targetSdk 35', 'targetSdk 33'),
    })
    const report = runPlayScan(dir)
    expect(report.checks.find(c => c.id === 'data-safety')?.status).toBe('warn')
    expect(report.checks.find(c => c.id === 'backup')?.status).toBe('warn')
    expect(report.checks.find(c => c.id === 'cleartext')?.status).toBe('warn')
    expect(report.checks.find(c => c.id === 'target-sdk')?.status).toBe('warn')
    expect(report.checks.find(c => c.id === 'icon')?.status).toBe('warn')
    expect(report.checks.find(c => c.id === 'signing')?.status).toBe('pass')
    expect(report.verdict).toBe('needs-attention')
  })

  it('errors when the manifest is missing', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = runPlayScan(dir)
    expect(report.checks.find(c => c.id === 'manifest')?.status).toBe('fail')
    expect(report.verdict).toBe('changes-requested')
  })

  it('writes report.md and report.json', () => {
    dir = createTempProject({ 'package.json': '{}' })
    const report = runPlayScan(dir)
    const { mdPath, jsonPath } = writePlayReport(dir, report)
    expect(mdPath).toContain('play-store')
    expect(jsonPath).toContain('report.json')
  })
})
