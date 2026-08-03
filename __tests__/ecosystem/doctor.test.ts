import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  runEcosystemDoctor,
  runDoctor,
  checkEcosystemItem,
  checkNativeToolchain,
  type DoctorCheckers,
} from '../../src/ecosystem'
import { listEcosystemItems, getEcosystemItem } from '../../src/ecosystem'

function makeCheckers(overrides: Partial<DoctorCheckers> = {}): DoctorCheckers {
  return {
    packageInstalled: () => false,
    run: () => ({ success: false, output: '' }),
    dirExists: () => false,
    env: () => undefined,
    portOpen: () => false,
    platform: 'darwin',
    ...overrides,
  }
}

function resultFor(id: string, checks: ReturnType<typeof checkNativeToolchain>): (typeof checks)[number] {
  return checks.find(c => c.id === id)!
}

describe('ecosystem doctor', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vectalon-doctor-'))
  })

  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('reports a locally installed tool as OK', () => {
    const item = getEcosystemItem('zustand')!
    const result = checkEcosystemItem(item, dir, makeCheckers({ packageInstalled: () => true }))
    expect(result.status).toBe('ok')
    expect(result.detail).toContain('installed locally')
  })

  it('reports a missing npm tool with an install hint', () => {
    const item = getEcosystemItem('zustand')!
    const result = checkEcosystemItem(item, dir, makeCheckers())
    expect(result.status).toBe('missing')
    expect(result.hint).toContain('npm install')
  })

  it('reports an npx MCP as OK when its package resolves or the binary responds', () => {
    const item = getEcosystemItem('metro-mcp')!
    // Binary probe succeeds (e.g. npx --no-install found it on PATH)
    const result = checkEcosystemItem(item, dir, makeCheckers({ run: () => ({ success: true, output: 'v1.0.0' }) }))
    expect(result.status).toBe('ok')
  })

  it('reports a missing MCP with the install command as hint', () => {
    const item = getEcosystemItem('metro-mcp')!
    const result = checkEcosystemItem(item, dir, makeCheckers())
    expect(result.status).toBe('missing')
    expect(result.hint).toContain('npx')
  })

  it('checks expo-mcp via the expo CLI instead of a standalone package', () => {
    const item = getEcosystemItem('expo-mcp')!
    // expo package installed locally → OK
    const okLocal = checkEcosystemItem(item, dir, makeCheckers({ packageInstalled: name => name === 'expo' }))
    expect(okLocal.status).toBe('ok')
    expect(okLocal.detail).toContain('expo')
    // expo CLI responds on PATH → OK
    const okPath = checkEcosystemItem(item, dir, makeCheckers({ run: () => ({ success: true, output: '0.99.0' }) }))
    expect(okPath.status).toBe('ok')
    // neither → missing with an actionable hint
    const missing = checkEcosystemItem(item, dir, makeCheckers())
    expect(missing.status).toBe('missing')
    expect(missing.hint).toContain('npx expo mcp')
  })

  it('reports a global binary tool (fastlane) by probing PATH', () => {
    const item = getEcosystemItem('fastlane')!
    const ok = checkEcosystemItem(item, dir, makeCheckers({ run: () => ({ success: true, output: 'fastlane 2.220.0' }) }))
    expect(ok.status).toBe('ok')
    const missing = checkEcosystemItem(item, dir, makeCheckers())
    expect(missing.status).toBe('missing')
    expect(missing.hint).toContain('gem install')
  })

  it('reports a skill as OK when its install directory exists', () => {
    const item = getEcosystemItem('expo-router')!
    const result = checkEcosystemItem(item, dir, makeCheckers({ dirExists: d => d.includes('expo-router') }))
    expect(result.status).toBe('ok')
  })

  it('reports a skill as missing with the skills add hint when no dir exists', () => {
    const item = getEcosystemItem('expo-router')!
    const result = checkEcosystemItem(item, dir, makeCheckers())
    expect(result.status).toBe('missing')
    expect(result.hint).toContain('npx skills')
  })

  it('aggregates enabled items into a report with counts', () => {
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
    writeFileSync(
      join(dir, '.vectalon', 'ecosystem.json'),
      JSON.stringify({ version: '1.0.0', enabled: ['zustand', 'fastlane', 'metro-mcp', 'expo-router'] })
    )
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'app', version: '1.0.0' }))

    // zustand installed; fastlane on PATH; metro-mcp + expo-router missing
    const report = runEcosystemDoctor(dir, makeCheckers({
      packageInstalled: name => name === 'zustand',
      run: () => ({ success: true, output: 'ok' }),
    }))
    expect(report.enabledCount).toBe(4)
    expect(report.okCount).toBeGreaterThanOrEqual(2)
    expect(report.missingCount).toBeGreaterThanOrEqual(1)
    expect(report.checks.map(c => c.id)).toEqual(expect.arrayContaining(['zustand', 'fastlane', 'metro-mcp', 'expo-router']))
  })

  it('returns an empty report when nothing is enabled', () => {
    mkdirSync(join(dir, '.vectalon'), { recursive: true })
    writeFileSync(
      join(dir, '.vectalon', 'ecosystem.json'),
      JSON.stringify({ version: '1.0.0', enabled: [] })
    )
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'app', version: '1.0.0' }))
    const report = runEcosystemDoctor(dir, makeCheckers())
    expect(report.enabledCount).toBe(0)
    expect(report.checks).toEqual([])
  })

  it('covers every catalog item with a check (no unhandled category)', () => {
    const items = listEcosystemItems()
    for (const item of items) {
      const result = checkEcosystemItem(item, dir, makeCheckers())
      expect(['ok', 'missing', 'warning']).toContain(result.status)
    }
  })

  describe('native toolchain', () => {
    it('reports a modern Node as OK and an old Node as missing with an upgrade hint', () => {
      const ok = resultFor('node', checkNativeToolchain(dir, makeCheckers({ run: () => ({ success: true, output: 'v20.11.0' }) })))
      expect(ok.status).toBe('ok')
      const old = resultFor('node', checkNativeToolchain(dir, makeCheckers({ run: () => ({ success: true, output: 'v16.14.0' }) })))
      expect(old.status).toBe('missing')
      expect(old.hint).toContain('nvm')
    })

    it('warns for Node 18-19 (works but 20+ recommended)', () => {
      const check = resultFor('node', checkNativeToolchain(dir, makeCheckers({ run: () => ({ success: true, output: 'v18.19.0' }) })))
      expect(check.status).toBe('warning')
    })

    it('reports a missing node binary with an install hint', () => {
      const check = resultFor('node', checkNativeToolchain(dir, makeCheckers({ run: () => ({ success: false, output: '' }) })))
      expect(check.status).toBe('missing')
      expect(check.hint).toContain('nvm install')
    })

    it('reports a JDK 17+ as OK and an older JDK as missing', () => {
      const ok = resultFor('jdk', checkNativeToolchain(dir, makeCheckers({ run: () => ({ success: true, output: 'openjdk version "17.0.9" 2023-10-17' }) })))
      expect(ok.status).toBe('ok')
      const old = resultFor('jdk', checkNativeToolchain(dir, makeCheckers({ run: () => ({ success: true, output: 'openjdk version "11.0.21"' }) })))
      expect(old.status).toBe('missing')
      expect(old.hint).toContain('JDK')
    })

    it('resolves the Android SDK from ANDROID_HOME', () => {
      const check = resultFor('android-sdk', checkNativeToolchain(dir, makeCheckers({
        env: name => (name === 'ANDROID_HOME' ? '/sdk' : undefined),
        dirExists: d => d === '/sdk',
      })))
      expect(check.status).toBe('ok')
      expect(check.detail).toContain('/sdk')
    })

    it('falls back to adb on PATH for the Android SDK', () => {
      const check = resultFor('android-sdk', checkNativeToolchain(dir, makeCheckers({
        run: (cmd) => (cmd === 'adb' ? { success: true, output: 'Android Debug Bridge version 1.0.41' } : { success: false, output: '' }),
      })))
      expect(check.status).toBe('ok')
    })

    it('flags a missing Android SDK as missing when android/ is present', () => {
      const check = resultFor('android-sdk', checkNativeToolchain(dir, makeCheckers({
        dirExists: d => d === join(dir, 'android'),
      })))
      expect(check.status).toBe('missing')
      expect(check.hint).toContain('ANDROID_HOME')
    })

    it('reports emulator AVDs when the emulator binary responds', () => {
      const check = resultFor('android-emulator', checkNativeToolchain(dir, makeCheckers({
        run: (cmd) => (cmd === 'emulator' ? { success: true, output: 'Pixel_9\nPixel_7' } : { success: false, output: '' }),
      })))
      expect(check.status).toBe('ok')
      expect(check.detail).toContain('Pixel_9')
    })

    it('reports Xcode OK on darwin and skips on other platforms', () => {
      const ok = resultFor('xcode', checkNativeToolchain(dir, makeCheckers({
        platform: 'darwin',
        run: (cmd) => (cmd === 'xcodebuild' ? { success: true, output: 'Xcode 16.0' } : { success: false, output: '' }),
      })))
      expect(ok.status).toBe('ok')
      const skip = resultFor('xcode', checkNativeToolchain(dir, makeCheckers({ platform: 'linux' })))
      expect(skip.status).toBe('warning')
    })

    it('reports CocoaPods OK on darwin and skips elsewhere', () => {
      const ok = resultFor('cocoapods', checkNativeToolchain(dir, makeCheckers({
        platform: 'darwin',
        run: (cmd) => (cmd === 'pod' ? { success: true, output: '1.15.2' } : { success: false, output: '' }),
      })))
      expect(ok.status).toBe('ok')
      const skip = resultFor('cocoapods', checkNativeToolchain(dir, makeCheckers({ platform: 'win32' })))
      expect(skip.status).toBe('warning')
    })

    it('reports the Metro dev-server port as OK when listening, warning otherwise', () => {
      const ok = resultFor('metro-port', checkNativeToolchain(dir, makeCheckers({ portOpen: () => true })))
      expect(ok.status).toBe('ok')
      const closed = resultFor('metro-port', checkNativeToolchain(dir, makeCheckers({ portOpen: () => false })))
      expect(closed.status).toBe('warning')
      expect(closed.hint).toContain('react-native start')
    })

    it('respects a custom Metro port via options', () => {
      const checks = checkNativeToolchain(dir, makeCheckers({ portOpen: p => p === 8088 }), { metroPort: 8088 })
      expect(resultFor('metro-port', checks).status).toBe('ok')
    })

    it('merges ecosystem and toolchain checks in runDoctor with combined counts', () => {
      mkdirSync(join(dir, '.vectalon'), { recursive: true })
      writeFileSync(
        join(dir, '.vectalon', 'ecosystem.json'),
        JSON.stringify({ version: '1.0.0', enabled: ['zustand'] })
      )
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'app', version: '1.0.0' }))
      const report = runDoctor(dir, makeCheckers({
        packageInstalled: () => true, // zustand OK
        run: () => ({ success: true, output: 'v20.11.0' }), // node/jdk/etc OK
        platform: 'linux', // xcode/pods skipped as warnings
      }))
      expect(report.checks.length).toBe(1)
      expect(report.toolchain.length).toBeGreaterThan(0)
      expect(report.okCount).toBeGreaterThan(0)
      expect(report.checks[0].id).toBe('zustand')
      // toolchain ids are all present
      for (const id of ['node', 'jdk', 'android-sdk', 'android-emulator', 'xcode', 'cocoapods', 'metro-port']) {
        expect(report.toolchain.some(c => c.id === id)).toBe(true)
      }
    })
  })
})
