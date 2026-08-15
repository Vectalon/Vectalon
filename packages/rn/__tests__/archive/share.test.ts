import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { createTempProject, cleanup } from '../helpers/tmp'
import { startShareServer } from '../../src/share/LocalServer'
import { renderInstallPage } from '../../src/share/PortalPage'
import { planTunnel } from '../../src/share/TunnelAdapter'
import { startShare } from '../../src/share'
import { generatePortal } from '../../src/portal'
import { ArchiveStore } from '../../src/archive/ArchiveStore'
import { createBuildManifest } from '../../src/archive/BuildManifest'
import type { BuildManifest } from '../../src/archive/types'

function seedBuild(dir: string): BuildManifest {
  const store = new ArchiveStore(dir)
  const m = createBuildManifest({
    projectId: 'test-app',
    version: '1.0.0',
    buildNumber: 3,
    flavor: 'staging',
    environment: 'release',
    platform: 'android',
    artifactType: 'apk',
    artifactPath: '.vectalon/builds/test-app/staging/release/1.0.0/3/android/app.apk',
    artifactSize: 42,
    checksum: 'd'.repeat(64),
    gitCommit: 'abc',
    gitBranch: 'main',
    builtBy: 'tester@example.com',
    metadata: { nodeVersion: process.version, nativeConfig: {} },
  })
  store.addBuild(m)
  mkdirSync(dirname(join(dir, m.artifactPath)), { recursive: true })
  writeFileSync(join(dir, m.artifactPath), 'fake-apk')
  writeFileSync(`${join(dir, m.artifactPath)}.sha256`, `${m.checksum}  app.apk\n`)
  return m
}

describe('PortalPage', () => {
  it('renders a self-contained install page with metadata + download link', () => {
    const m = seedBuild(createTempProject({}))
    const html = renderInstallPage({ build: m, baseUrl: 'http://127.0.0.1:4000' })
    expect(html).toContain('Download .apk')
    expect(html).toContain('http://127.0.0.1:4000/downloads')
    expect(html).toContain(m.checksum)
    expect(html).toContain('staging')
    expect(html).toContain('Install')
  })
})

describe('LocalServer', () => {
  it('serves the install page and the artifact, then stops', async () => {
    const dir = createTempProject({})
    try {
      const m = seedBuild(dir)
      const handle = await startShareServer({ build: m, port: 0, storeRoot: dir })
      try {
        const page = await fetch(`${handle.url}/`)
        expect(page.status).toBe(200)
        const text = await page.text()
        expect(text).toContain('Download .apk')

        const artifact = await fetch(`${handle.url}/downloads/${m.buildId}.apk`)
        expect(artifact.status).toBe(200)
        expect(await artifact.text()).toBe('fake-apk')

        const checksum = await fetch(`${handle.url}/downloads/${m.buildId}.sha256`)
        expect(await checksum.text()).toContain(m.checksum)

        const missing = await fetch(`${handle.url}/nope`)
        expect(missing.status).toBe(404)

        // Access log written.
        expect(readFileSync(join(dir, '.vectalon', 'share', 'access.log'), 'utf-8')).toContain('GET /')
      } finally {
        await handle.close()
      }
    } finally {
      cleanup(dir)
    }
  })
})

describe('startShare', () => {
  it('returns an error result when no build is archived', async () => {
    const dir = createTempProject({})
    try {
      const result = await startShare(dir, {})
      expect(result.ok).toBe(false)
      expect(result.error).toContain('No archived build found')
    } finally {
      cleanup(dir)
    }
  })

  it('serves the latest build', async () => {
    const dir = createTempProject({})
    try {
      const m = seedBuild(dir)
      const result = await startShare(dir, {})
      try {
        expect(result.ok).toBe(true)
        expect(result.buildId).toBe(m.buildId)
        const res = await fetch(`${result.url}/`)
        expect(res.status).toBe(200)
      } finally {
        await result.stop()
      }
    } finally {
      cleanup(dir)
    }
  })
})

describe('TunnelAdapter', () => {
  it('degrades to a warning when ngrok and localtunnel are absent', () => {
    const plan = planTunnel(3000)
    if (plan.available) {
      expect(plan.command).toBeTruthy()
    } else {
      expect(plan.warning).toContain('ngrok')
    }
  })
})

describe('PortalGenerator', () => {
  it('generates the SSG file tree with embedded builds.json', () => {
    const dir = createTempProject({})
    try {
      const builds = [seedBuild(dir)]
      const out = join(dir, 'portal-site')
      const result = generatePortal({ out, domain: 'builds.acme.com', builds })
      expect(result.builds).toBe(1)
      expect(result.fileCount).toBeGreaterThanOrEqual(4)
      expect(existsSync(join(out, 'index.html'))).toBe(true)
      expect(existsSync(join(out, 'builds.json'))).toBe(true)
      expect(existsSync(join(out, 'build', builds[0].buildId, 'index.html'))).toBe(true)

      const listing = readFileSync(join(out, 'index.html'), 'utf-8')
      expect(listing).toContain('builds.acme.com')
      expect(listing).toContain('Builds (1)')
      expect(listing).toContain('staging')

      const embedded = JSON.parse(readFileSync(join(out, 'builds.json'), 'utf-8'))
      expect(embedded).toHaveLength(1)
      expect(embedded[0].checksum).toBe(builds[0].checksum)

      const detail = readFileSync(join(out, 'build', builds[0].buildId, 'index.html'), 'utf-8')
      expect(detail).toContain('adb install -r')
      expect(detail).toContain('sha256')
    } finally {
      cleanup(dir)
    }
  })

  it('renders iOS install instructions for ipa builds', () => {
    const dir = createTempProject({})
    try {
      const m = createBuildManifest({
        projectId: 'test-app',
        version: '1.0.0',
        buildNumber: 1,
        flavor: 'prod',
        environment: 'release',
        platform: 'ios',
        artifactType: 'ipa',
        artifactPath: 'app.ipa',
        artifactSize: 10,
        checksum: 'e'.repeat(64),
        gitCommit: 'abc',
        gitBranch: 'main',
        builtBy: 'x',
        metadata: { nodeVersion: process.version, nativeConfig: {} },
      })
      const out = join(dir, 'portal-ios')
      generatePortal({ out, builds: [m] })
      const detail = readFileSync(join(out, 'build', m.buildId, 'index.html'), 'utf-8')
      expect(detail).toContain('xcrun devicectl device install')
    } finally {
      cleanup(dir)
    }
  })
})
