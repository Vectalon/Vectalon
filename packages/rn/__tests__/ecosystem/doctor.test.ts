import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  runEcosystemDoctor,
  runDoctor,
  checkEcosystemItem,
  checkNativeToolchain,
  checkLeaderboardReadiness,
  checkModelAccess,
  fixForMissing,
  runDoctorFixes,
  MODEL_ACCESS_ITEM_IDS,
  type DoctorCheckers,
  type DoctorFixer,
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
    hasModel: () => false,
    writable: () => false,
    ...overrides,
  }
}

function resultFor(id: string, checks: ReturnType<typeof checkNativeToolchain>): (typeof checks)[number] {
  return checks.find(c => c.id === id)!
}

function makeFixer(overrides: Partial<DoctorFixer> = {}): DoctorFixer {
  return {
    run: () => ({ success: true, output: 'ok' }),
    ...overrides,
  }
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

  describe('nightly leaderboard readiness', () => {
    it('reports OK when API keys, the local model, and the results dir are ready', () => {
      const checks = checkLeaderboardReadiness(dir, makeCheckers({
        env: name => (name === 'OPENAI_API_KEY' || name === 'ANTHROPIC_API_KEY' ? 'sk-' : undefined),
        hasModel: () => true,
        writable: () => true,
      }))
      expect(checks.map(c => c.id)).toEqual(['lb-openai-key', 'lb-anthropic-key', 'lb-local-model', 'lb-results-dir'])
      expect(checks.every(c => c.status === 'ok')).toBe(true)
    })

    it('warns when a remote API key secret is unset', () => {
      const checks = checkLeaderboardReadiness(dir, makeCheckers({
        env: () => undefined,
        hasModel: () => true,
        writable: () => true,
      }))
      expect(checks.find(c => c.id === 'lb-openai-key')?.status).toBe('warning')
      expect(checks.find(c => c.id === 'lb-anthropic-key')?.status).toBe('warning')
      expect(checks.find(c => c.id === 'lb-openai-key')?.hint).toContain('OPENAI_API_KEY')
    })

    it('warns when the local model is not downloaded', () => {
      const checks = checkLeaderboardReadiness(dir, makeCheckers({ hasModel: () => false }))
      expect(checks.find(c => c.id === 'lb-local-model')?.status).toBe('warning')
      expect(checks.find(c => c.id === 'lb-local-model')?.hint).toContain('vectalon pull')
    })

    it('accepts a custom local model preset id', () => {
      const checks = checkLeaderboardReadiness(dir, makeCheckers({
        hasModel: id => id === 'qwen2.5-coder-3b',
        writable: () => true,
      }), { localModelPresetId: 'qwen2.5-coder-3b' })
      expect(checks.find(c => c.id === 'lb-local-model')?.status).toBe('ok')
      expect(checks.find(c => c.id === 'lb-local-model')?.detail).toContain('qwen2.5-coder-3b')
    })

    it('degrades the results-dir check to a warning in non-benchmark projects', () => {
      // No bench/scenarios → this project never runs the nightly leaderboard.
      const checks = checkLeaderboardReadiness(dir, makeCheckers({ writable: () => false }))
      expect(checks.find(c => c.id === 'lb-results-dir')?.status).toBe('warning')
    })

    it('flags a missing/unwritable results dir as missing on a benchmark host', () => {
      // The repo itself has bench/scenarios — the leaderboard workflow runs there.
      mkdirSync(join(dir, 'bench', 'scenarios'), { recursive: true })
      const checks = checkLeaderboardReadiness(dir, makeCheckers({
        dirExists: d => d === join(dir, 'bench', 'scenarios'),
        writable: () => false,
      }))
      expect(checks.find(c => c.id === 'lb-results-dir')?.status).toBe('missing')
      expect(checks.find(c => c.id === 'lb-results-dir')?.hint).toContain('mkdir -p bench/results')
    })

    it('fixes a missing results dir with mkdir -p on a benchmark host', () => {
      mkdirSync(join(dir, 'bench', 'scenarios'), { recursive: true })
      const checks = checkLeaderboardReadiness(dir, makeCheckers({
        dirExists: d => d === join(dir, 'bench', 'scenarios'),
        writable: () => false,
      }))
      const check = checks.find(c => c.id === 'lb-results-dir')!
      const fix = fixForMissing(check, dir)!
      expect(fix.command).toBe('mkdir')
      expect(fix.args).toEqual(['-p', 'bench/results'])
      expect(fix.manual).toBe(false)
    })

    it('does not auto-fix API-key or model checks (user/environment actions)', () => {
      const checks = checkLeaderboardReadiness(dir, makeCheckers({
        env: () => undefined,
        hasModel: () => false,
        writable: () => true,
      }))
      for (const check of checks.filter(c => c.status === 'warning')) {
        expect(fixForMissing(check, dir)).toBeNull()
      }
    })

    it('includes leaderboard checks in the runDoctor report and counts', () => {
      mkdirSync(join(dir, '.vectalon'), { recursive: true })
      mkdirSync(join(dir, 'bench', 'scenarios'), { recursive: true })
      writeFileSync(join(dir, '.vectalon', 'ecosystem.json'), JSON.stringify({ version: '1.0.0', enabled: [] }))
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'app', version: '1.0.0' }))
      const report = runDoctor(dir, makeCheckers({
        run: () => ({ success: true, output: 'v20.11.0' }),
        platform: 'linux',
        dirExists: d => d === join(dir, 'bench', 'scenarios'),
        writable: () => false,
      }))
      expect(report.leaderboard.map(c => c.id)).toEqual(['lb-openai-key', 'lb-anthropic-key', 'lb-local-model', 'lb-results-dir'])
      expect(report.missingCount).toBeGreaterThanOrEqual(1)
    })
  })

  describe('model access', () => {
    it('reports the local model as missing when it is not downloaded', () => {
      const checks = checkModelAccess(dir, makeCheckers()) // hasModel: false, default provider local
      const model = checks.find(c => c.id === 'ma-model')!
      expect(model.status).toBe('missing')
      expect(model.hint).toContain('vectalon pull')
    })

    it('reports the local model as OK when downloaded', () => {
      const checks = checkModelAccess(dir, makeCheckers({ hasModel: () => true }))
      expect(checks.find(c => c.id === 'ma-model')!.status).toBe('ok')
    })

    it('warns for a remote provider without its API key and passes with one', () => {
      const without = checkModelAccess(dir, makeCheckers(), { provider: 'openai' })
      const missing = without.find(c => c.id === 'ma-model')!
      expect(missing.status).toBe('warning')
      expect(missing.hint).toContain('OPENAI_API_KEY')

      const withKey = checkModelAccess(dir, makeCheckers({ env: n => (n === 'OPENAI_API_KEY' ? 'sk-' : undefined) }), { provider: 'openai' })
      expect(withKey.find(c => c.id === 'ma-model')!.status).toBe('ok')
    })

    it('warns when no ecosystem items are enabled', () => {
      const checks = checkModelAccess(dir, makeCheckers({ hasModel: () => true }))
      expect(checks.find(c => c.id === 'ma-ecosystem')!.status).toBe('warning')
    })

    it('reports enabled skills as OK only when their install dirs exist', () => {
      const dirWithConfig = mkdtempSync(join(tmpdir(), 'vectalon-ma-'))
      try {
        mkdirSync(join(dirWithConfig, '.vectalon', 'skills', 'expo-router'), { recursive: true })
        writeFileSync(join(dirWithConfig, '.vectalon', 'ecosystem.json'), JSON.stringify({ enabled: ['expo-router'] }))
        const checkers = makeCheckers({ hasModel: () => true, dirExists: d => existsSync(d) })

        const checks = checkModelAccess(dirWithConfig, checkers)
        expect(checks.find(c => c.id === 'ma-skills')!.status).toBe('ok')
      } finally {
        rmSync(dirWithConfig, { recursive: true, force: true })
      }
    })

    it('warns when an enabled skill is not installed', () => {
      const dirWithConfig = mkdtempSync(join(tmpdir(), 'vectalon-ma-'))
      try {
        mkdirSync(join(dirWithConfig, '.vectalon'), { recursive: true })
        writeFileSync(join(dirWithConfig, '.vectalon', 'ecosystem.json'), JSON.stringify({ enabled: ['expo-router'] }))
        const checks = checkModelAccess(dirWithConfig, makeCheckers({ hasModel: () => true })) // dirExists: false
        const skills = checks.find(c => c.id === 'ma-skills')!
        expect(skills.status).toBe('warning')
        expect(skills.hint).toContain('npx skills')
      } finally {
        rmSync(dirWithConfig, { recursive: true, force: true })
      }
    })

    it('reports MCP reachability from the ecosystem checks when provided', () => {
      const dirWithConfig = mkdtempSync(join(tmpdir(), 'vectalon-ma-'))
      try {
        mkdirSync(join(dirWithConfig, '.vectalon'), { recursive: true })
        writeFileSync(join(dirWithConfig, '.vectalon', 'ecosystem.json'), JSON.stringify({ enabled: ['metro-mcp', 'expo-mcp'] }))
        const checkers = makeCheckers({ hasModel: () => true })

        // metro-mcp ok, expo-mcp missing — the summary warns and names one.
        const checks = checkModelAccess(dirWithConfig, checkers, {}, [
          { id: 'metro-mcp', status: 'ok' } as never,
          { id: 'expo-mcp', status: 'missing' } as never,
        ])
        const mcps = checks.find(c => c.id === 'ma-mcp')!
        expect(mcps.status).toBe('warning')
        expect(mcps.detail).toContain('1/2')
      } finally {
        rmSync(dirWithConfig, { recursive: true, force: true })
      }
    })

    it('exposes exactly the four model-access check ids', () => {
      expect(MODEL_ACCESS_ITEM_IDS).toEqual(['ma-model', 'ma-ecosystem', 'ma-skills', 'ma-mcp'])
    })

    it('runDoctor includes the model section in its report', () => {
      const report = runDoctor(dir, makeCheckers())
      expect(report.model.map(c => c.id)).toEqual(['ma-model', 'ma-ecosystem', 'ma-skills', 'ma-mcp'])
      expect(report.missingCount).toBeGreaterThanOrEqual(1) // ma-model missing
    })
  })

  describe('doctor --fix', () => {
    it('builds an npm install fix for a missing npm tool', () => {
      const item = getEcosystemItem('zustand')!
      const check = checkEcosystemItem(item, dir, makeCheckers())
      expect(check.status).toBe('missing')
      const fix = fixForMissing(check, dir)!
      expect(fix.command).toBe('npm')
      expect(fix.args).toEqual(['install', 'zustand'])
      expect(fix.manual).toBe(false)
    })

    it('installs MCP packages as devDependencies', () => {
      const item = getEcosystemItem('metro-mcp')!
      const check = checkEcosystemItem(item, dir, makeCheckers())
      const fix = fixForMissing(check, dir)!
      expect(fix.args).toEqual(['install', '-D', '@steve228uk/metro-mcp'])
    })

    it('installs dev-time hooks with -D per the catalog install string', () => {
      const item = getEcosystemItem('husky')!
      const check = checkEcosystemItem(item, dir, makeCheckers())
      const fix = fixForMissing(check, dir)!
      expect(fix.command).toBe('npm')
      expect(fix.args).toEqual(['install', '-D', 'husky'])
      // runtime libraries install as regular dependencies
      const zustand = fixForMissing(checkEcosystemItem(getEcosystemItem('zustand')!, dir, makeCheckers()), dir)!
      expect(zustand.args).toEqual(['install', 'zustand'])
    })

    it('strips quotes from npx skills add args (all-in-one skill)', () => {
      const item = getEcosystemItem('expo-skills')!
      const check = checkEcosystemItem(item, dir, makeCheckers())
      const fix = fixForMissing(check, dir)!
      expect(fix.command).toBe('npx')
      expect(fix.args.some(a => a.includes("'"))).toBe(false)
      expect(fix.args).toContain('*')
    })

    it('builds an npx skills add fix for a missing skill', () => {
      const item = getEcosystemItem('expo-router')!
      const check = checkEcosystemItem(item, dir, makeCheckers())
      const fix = fixForMissing(check, dir)!
      expect(fix.command).toBe('npx')
      expect(fix.label).toContain('skills')
    })

    it('fixes a missing JDK with brew cask', () => {
      const checks = checkNativeToolchain(dir, makeCheckers())
      const check = resultFor('jdk', checks)
      const fix = fixForMissing(check, dir)!
      expect(fix.command).toBe('brew')
      expect(fix.args).toContain('temurin@17')
    })

    it('fixes CocoaPods via brew and flags Xcode as manual', () => {
      const checks = checkNativeToolchain(dir, makeCheckers())
      const pod = fixForMissing(resultFor('cocoapods', checks), dir)!
      expect(pod.command).toBe('brew')
      const xcode = fixForMissing(resultFor('xcode', checks), dir)!
      expect(xcode.manual).toBe(true)
    })

    it('flags manual-only fixes (node, android-sdk, android-emulator)', () => {
      // android/ present so the SDK/emulator checks report missing, not warning
      mkdirSync(join(dir, 'android'), { recursive: true })
      const checks = checkNativeToolchain(dir, makeCheckers({ dirExists: d => d === join(dir, 'android') }))
      expect(resultFor('android-sdk', checks).status).toBe('missing')
      for (const id of ['node', 'android-sdk', 'android-emulator']) {
        const fix = fixForMissing(resultFor(id, checks), dir)!
        expect(fix.manual).toBe(true)
      }
    })

    it('returns null for OK checks', () => {
      const item = getEcosystemItem('zustand')!
      const ok = checkEcosystemItem(item, dir, makeCheckers({ packageInstalled: () => true }))
      expect(ok.status).toBe('ok')
      expect(fixForMissing(ok, dir)).toBeNull()
    })

    it('runs auto-fixes, skips manual ones, and re-checks', () => {
      mkdirSync(join(dir, '.vectalon'), { recursive: true })
      writeFileSync(
        join(dir, '.vectalon', 'ecosystem.json'),
        JSON.stringify({ version: '1.0.0', enabled: ['zustand'] })
      )
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'app', version: '1.0.0' }))

      const report = runDoctor(dir, makeCheckers())
      const calls: Array<{ command: string; args: string[] }> = []
      const fixer = makeFixer({
        run: (command, args) => {
          calls.push({ command, args })
          return { success: true, output: 'ok' }
        },
      })

      const { attempts, before, after } = runDoctorFixes(dir, report, fixer)
      expect(before).toBeGreaterThan(0)
      expect(calls.some(c => c.command === 'npm' && c.args.includes('zustand'))).toBe(true)
      expect(attempts.some(a => a.status === 'fixed')).toBe(true)
      expect(attempts.some(a => a.status === 'skipped-manual')).toBe(true)
      expect(after).toBeLessThan(before)
    })

    it('reports failures with the first error line', () => {
      const item = getEcosystemItem('zustand')!
      const check = checkEcosystemItem(item, dir, makeCheckers())
      const fix = fixForMissing(check, dir)!
      const fixer = makeFixer({ run: () => ({ success: false, output: 'EACCES: permission denied\nline2' }) })
      const result = fixer.run(fix.command, fix.args, dir)
      expect(result.success).toBe(false)
      expect(result.output.split(/\r?\n/)[0]).toContain('EACCES')
    })
  })
})
