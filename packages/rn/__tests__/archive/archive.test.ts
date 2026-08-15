import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createTempProject, cleanup } from '../helpers/tmp'
import { parseGradleProductFlavors, parseXcodeSchemes, parseEasProfiles, detectFlavors, resolveFlavor, FLAVORS_CONFIG_PATH } from '../../src/archive/FlavorDetector'
import { validateBuildManifest, createBuildManifest, assertValidBuildManifest } from '../../src/archive/BuildManifest'
import { ArchiveStore, buildsIndexPath } from '../../src/archive/ArchiveStore'
import { archiveBuild, computeChecksum, nextBuildNumber, readProjectId, readProjectVersion, loadEnvFile } from '../../src/archive'
import { detectProjectType, planBuild } from '../../src/archive/BuildExecutor'
import type { BuildManifest } from '../../src/archive/types'

function manifest(overrides: Partial<BuildManifest> = {}): BuildManifest {
  return createBuildManifest({
    projectId: 'test-app',
    version: '1.0.0',
    buildNumber: 1,
    flavor: 'staging',
    environment: 'release',
    platform: 'android',
    artifactType: 'apk',
    artifactPath: 'app.apk',
    artifactSize: 100,
    checksum: 'a'.repeat(64),
    gitCommit: 'abc123',
    gitBranch: 'main',
    builtBy: 'tester@example.com',
    metadata: { nodeVersion: process.version, nativeConfig: {} },
    ...overrides,
  })
}

describe('FlavorDetector', () => {
  afterEach(() => process.env.RN_VECTALON_CONFIG_DIR && delete process.env.RN_VECTALON_CONFIG_DIR)

  it('parses gradle productFlavors block names', () => {
    const gradle = `android {
  defaultConfig { applicationId "com.app" }
  productFlavors {
    dev { applicationId "com.app.dev" }
    staging { applicationId "com.app.staging" }
    production { applicationId "com.app" }
  }
  buildTypes {
    release { minifyEnabled true }
  }
}`
    expect(parseGradleProductFlavors(gradle)).toEqual(['dev', 'staging', 'production'])
  })

  it('parses Xcode scheme names from .xcscheme files', () => {
    const scheme = `<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1500" version="1.7">
  <BuildAction>
    <BuildActionEntries>
      <BuildActionEntry buildForTesting="YES" buildForRunning="YES">
        <BuildableReference BuildableIdentifier="primary" BlueprintName="Staging" BuildableName="App.app" BlueprintIdentifier="ABC123" ReferencedContainer="container:App.xcodeproj" />
      </BuildActionEntry>
    </BuildActionEntries>
  </BuildAction>
</Scheme>`
    expect(parseXcodeSchemes(scheme)).toEqual(['Staging'])
  })

  it('parses eas.json build profiles', () => {
    const eas = JSON.stringify({
      cli: { version: '>= 8.0.0' },
      build: {
        development: { developmentClient: true, distribution: 'internal' },
        preview: { distribution: 'internal' },
        production: { autoIncrement: true },
      },
    })
    expect(parseEasProfiles(eas)).toEqual(['development', 'preview', 'production'])
  })

  it('auto-detects flavors from gradle + xcscheme in a temp project', () => {
    const dir = createTempProject({
      'android/app/build.gradle': `android {
  productFlavors {
    dev { applicationId "com.app.dev" }
    prod { applicationId "com.app" }
  }
}`,
      'ios/App.xcodeproj/xcshareddata/xcschemes/Prod.xcscheme': '<Scheme LastUpgradeVersion="1" name="Prod" version="1.7"></Scheme>',
    })
    try {
      const result = detectFlavors(dir)
      expect(result.source).toBe('auto-detected')
      expect(result.flavors.map(f => f.name).sort()).toEqual(['Prod', 'dev', 'prod'])
      const prod = result.flavors.find(f => f.name === 'Prod')
      expect(prod?.ios).toBe('Prod')
    } finally {
      cleanup(dir)
    }
  })

  it('merges user-config flavors.json overrides (user wins)', () => {
    const dir = createTempProject({
      'android/app/build.gradle': `productFlavors {
  dev {}
  prod {}
}`,
      [FLAVORS_CONFIG_PATH]: JSON.stringify({
        $schema: 'https://vectalon.in/schemas/flavors.json',
        flavors: [
          { name: 'dev', android: 'dev', ios: 'Dev', envFile: '.env.dev', isDefault: true },
          { name: 'staging', android: 'staging', ios: 'Staging', envFile: '.env.staging' },
        ],
      }),
    })
    try {
      const result = detectFlavors(dir)
      expect(result.source).toBe('mixed')
      const names = result.flavors.map(f => f.name)
      expect(names).toContain('dev')
      expect(names).toContain('staging') // user-only flavor kept
      expect(names).toContain('prod') // auto flavor not in user file kept
      const dev = result.flavors.find(f => f.name === 'dev')
      expect(dev?.envFile).toBe('.env.dev')
      expect(resolveFlavor(result.flavors)?.name).toBe('dev') // isDefault honored
      expect(resolveFlavor(result.flavors, 'staging')?.name).toBe('staging')
      expect(resolveFlavor(result.flavors, 'missing')).toBeNull()
    } finally {
      cleanup(dir)
    }
  })
})

describe('BuildManifest', () => {
  it('accepts a valid manifest', () => {
    const m = manifest()
    expect(validateBuildManifest(m)).toEqual([])
    expect(() => assertValidBuildManifest(m)).not.toThrow()
  })

  it('rejects invalid manifests with specific errors', () => {
    expect(validateBuildManifest(null)).toContain('BuildManifest must be an object')
    const good = manifest()
    const m: BuildManifest = {
      ...good,
      platform: 'windows' as never,
      buildNumber: -1,
      artifactSize: Number.NaN,
    }
    const errors = validateBuildManifest(m)
    expect(errors).toContain('platform must be one of: ios, android')
    expect(errors.some(e => e.startsWith('buildNumber'))).toBe(true)
    expect(errors.some(e => e.startsWith('artifactSize'))).toBe(true)
  })

  it('generates buildId + buildTimestamp when absent', () => {
    const m = manifest()
    expect(m.buildId).toMatch(/^[0-9a-f-]{36}$/)
    expect(m.buildTimestamp).toBeTruthy()
  })
})

describe('ArchiveStore', () => {
  it('adds, lists, dedupes by checksum, and resolves latest', () => {
    const dir = createTempProject({})
    try {
      const store = new ArchiveStore(dir)
      const a = manifest({ buildNumber: 1, checksum: 'a'.repeat(64) })
      const b = manifest({ buildNumber: 2, checksum: 'b'.repeat(64) })
      store.addBuild(a)
      const dup = store.addBuild(manifest({ buildNumber: 3, checksum: 'a'.repeat(64) }))
      expect(dup.duplicated).toBe(true)
      expect(dup.existingBuildId).toBe(a.buildId)
      store.addBuild(b)

      expect(store.listBuilds({}).length).toBe(2)
      expect(store.getBuild(b.buildId)?.buildNumber).toBe(2)
      expect(store.resolveLatest({ flavor: 'staging' })?.buildNumber).toBe(2)
      expect(store.resolveLatest({ flavor: 'other' })).toBeUndefined()
      expect(existsSync(buildsIndexPath(dir))).toBe(true)
    } finally {
      cleanup(dir)
    }
  })

  it('skips corrupt entries when loading', () => {
    const dir = createTempProject({})
    try {
      const store = new ArchiveStore(dir)
      store.addBuild(manifest())
      writeFileSync(buildsIndexPath(dir), '[{"buildId": "broken"}, "not-an-object"]')
      expect(store.listBuilds({})).toEqual([])
    } finally {
      cleanup(dir)
    }
  })
})

describe('archive orchestrator', () => {
  it('dry-run plans the build command for a bare Android project without side effects', async () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'demo-app', version: '2.3.4' }),
      'android/app/build.gradle': `productFlavors {
  staging {}
  production {}
}`,
      'ios/App.xcworkspace': '',
    })
    try {
      const report = await archiveBuild(dir, { dryRun: true, flavor: 'staging' })
      expect(report.ok).toBe(true)
      expect(report.dryRun).toBe(true)
      expect(report.command).toContain('assembleStagingRelease')
      expect(report.command).toContain('bundleStagingRelease')
      expect(readProjectId(dir)).toBe('demo-app')
      expect(readProjectVersion(dir)).toBe('2.3.4')
      // No store writes in dry-run.
      expect(existsSync(join(dir, '.vectalon', 'builds.json'))).toBe(false)
    } finally {
      cleanup(dir)
    }
  })

  it('archives a pre-built artifact with checksum + store write (--no-build --artifact)', async () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'demo-app', version: '1.0.0' }),
      'android/app/build.gradle': `productFlavors {
  staging {}
}`,
    })
    try {
      writeFileSync(join(dir, 'app.apk'), 'fake-apk-bytes')
      const report = await archiveBuild(dir, { noBuild: true, artifact: './app.apk', flavor: 'staging', buildNumber: 42 })
      expect(report.ok).toBe(true)
      expect(report.duplicated).toBe(false)
      const m = report.manifest as BuildManifest
      expect(m.buildNumber).toBe(42)
      expect(m.flavor).toBe('staging')
      expect(m.platform).toBe('android')
      expect(m.artifactType).toBe('apk')
      expect(m.checksum).toBe(computeChecksum(join(dir, 'app.apk')))
      expect(existsSync(m.artifactPath)).toBe(true)
      expect(readFileSync(`${m.artifactPath}.sha256`, 'utf-8')).toContain(m.checksum)

      // Second archive of the same artifact dedupes.
      const dup = await archiveBuild(dir, { noBuild: true, artifact: './app.apk', flavor: 'staging' })
      expect(dup.duplicated).toBe(true)
      expect(dup.existingBuildId).toBe(m.buildId)
    } finally {
      cleanup(dir)
    }
  })

  it('reports an error when no flavor is detected', async () => {
    const dir = createTempProject({ 'package.json': JSON.stringify({ name: 'empty' }) })
    try {
      const report = await archiveBuild(dir, {})
      expect(report.ok).toBe(false)
      expect(report.error).toContain('No flavors detected')
    } finally {
      cleanup(dir)
    }
  })

  it('increments build numbers per flavor+platform', () => {
    const dir = createTempProject({})
    try {
      const store = new ArchiveStore(dir)
      store.addBuild(manifest({ buildNumber: 5, flavor: 'staging', checksum: '1'.repeat(64) }))
      store.addBuild(manifest({ buildNumber: 2, flavor: 'prod', checksum: '2'.repeat(64) }))
      expect(nextBuildNumber(store, 'staging', 'android')).toBe(6)
      expect(nextBuildNumber(store, 'prod', 'android')).toBe(3)
      expect(nextBuildNumber(store, 'prod', 'android', 99)).toBe(99)
    } finally {
      cleanup(dir)
    }
  })

  it('loads env files (KEY=VALUE) and ignores comments/blanks', () => {
    const dir = createTempProject({ '.env.staging': '# comment\nAPI_URL=https://staging.example.com\n\nDEBUG=true\n' })
    try {
      const vars = loadEnvFile(dir, '.env.staging')
      expect(vars.API_URL).toBe('https://staging.example.com')
      expect(vars.DEBUG).toBe('true')
      expect(Object.keys(vars)).toHaveLength(2)
    } finally {
      cleanup(dir)
    }
  })
})

describe('BuildExecutor', () => {
  it('detects project types', () => {
    const expo = createTempProject({ 'eas.json': '{}' })
    const bare = createTempProject({ android: '', ios: '' })
    const unknown = createTempProject({ 'package.json': '{}' })
    try {
      expect(detectProjectType(expo)).toBe('expo')
      expect(detectProjectType(bare)).toBe('bare')
      expect(detectProjectType(unknown)).toBe('unknown')
    } finally {
      cleanup(expo)
      cleanup(bare)
      cleanup(unknown)
    }
  })

  it('plans bare iOS and Expo builds', () => {
    const root = '/tmp/placeholder-root'
    expect(planBuild(root, 'expo', { name: 'staging' }, 'release', 'ios')?.command).toBe('eas build --platform ios --profile staging --non-interactive')
    expect(planBuild(root, 'bare', { name: 'staging' }, 'debug', 'android')?.command).toContain('assembleStagingDebug')
    expect(planBuild(root, 'unknown', { name: 'x' }, 'release', 'ios')).toBeNull()
  })
})
