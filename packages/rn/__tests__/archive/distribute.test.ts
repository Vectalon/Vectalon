import { createVerify, generateKeyPairSync } from 'crypto'
import { join } from 'path'
import { createTempProject, cleanup } from '../helpers/tmp'
import { detectCredentials } from '../../src/distribute/CredentialDelegator'
import { mintAscJwt, derToRawJwt } from '../../src/distribute/StoreConnect'
import { mintServiceAccountJwt, loadServiceAccount } from '../../src/distribute/PlayPublisher'
import { SaasClient, resolveApiKey } from '../../src/distribute/SaasClient'
import { distributeBuild, listTargets } from '../../src/distribute'
import { ArchiveStore } from '../../src/archive/ArchiveStore'
import { createBuildManifest } from '../../src/archive/BuildManifest'
import type { BuildManifest } from '../../src/archive/types'

function seedBuild(dir: string, platform: 'ios' | 'android' = 'ios'): BuildManifest {
  const store = new ArchiveStore(dir)
  const m = createBuildManifest({
    projectId: 'test-app',
    version: '1.0.0',
    buildNumber: 1,
    flavor: 'staging',
    environment: 'release',
    platform,
    artifactType: platform === 'ios' ? 'ipa' : 'apk',
    artifactPath: 'build/app.ipa',
    artifactSize: 100,
    checksum: 'c'.repeat(64),
    gitCommit: 'abc',
    gitBranch: 'main',
    builtBy: 'tester@example.com',
    metadata: { nodeVersion: process.version, nativeConfig: {} },
  })
  store.addBuild(m)
  return m
}

describe('CredentialDelegator', () => {
  afterEach(() => {
    delete process.env.APP_STORE_CONNECT_API_KEY
    delete process.env.APP_STORE_CONNECT_ISSUER_ID
    delete process.env.APP_STORE_CONNECT_KEY_ID
    delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT
  })

  it('detects fastlane from a Gemfile', () => {
    const dir = createTempProject({ Gemfile: 'source "https://rubygems.org"\ngem "fastlane"\n' })
    try {
      const info = detectCredentials({ root: dir, platform: 'ios', target: 'testflight' })
      expect(info.provider).toBe('fastlane')
      expect(info.delegationCommand).toBe('fastlane pilot upload')
    } finally {
      cleanup(dir)
    }
  })

  it('detects the ASC direct-API path from env vars', () => {
    const dir = createTempProject({})
    process.env.APP_STORE_CONNECT_API_KEY = '/tmp/key.p8'
    process.env.APP_STORE_CONNECT_ISSUER_ID = 'issuer'
    process.env.APP_STORE_CONNECT_KEY_ID = 'kid'
    try {
      const info = detectCredentials({ root: dir, platform: 'ios', target: 'testflight' })
      expect(info.provider).toBe('asc-api')
    } finally {
      cleanup(dir)
    }
  })

  it('returns actionable instructions when nothing is detected', () => {
    const dir = createTempProject({})
    try {
      const info = detectCredentials({ root: dir, platform: 'android', target: 'play-store' })
      expect(info.provider).toBe('none')
      expect(info.instructions).toContain('fastlane init')
      expect(info.instructions).toContain('GOOGLE_PLAY_SERVICE_ACCOUNT')
    } finally {
      cleanup(dir)
    }
  })
})

describe('StoreConnect JWT', () => {
  it('mints an ES256 JWT whose signature verifies round-trip', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    const dir = createTempProject({ 'AuthKey.p8': pem })
    try {
      const jwt = mintAscJwt({ keyPath: join(dir, 'AuthKey.p8'), issuerId: 'iss-123', keyId: 'kid-456' })
      const [h, p, sig] = jwt.split('.')
      const header = JSON.parse(Buffer.from(h, 'base64url').toString())
      const payload = JSON.parse(Buffer.from(p, 'base64url').toString())
      expect(header.alg).toBe('ES256')
      expect(header.kid).toBe('kid-456')
      expect(payload.iss).toBe('iss-123')
      expect(payload.aud).toBe('appstoreconnect-v1')
      expect(payload.exp - payload.iat).toBe(1200)

      // Verify: raw r||s back to DER, then createVerify('sha256').
      const raw = Buffer.from(sig, 'base64url')
      expect(raw.length).toBe(64)
      const toDer = (rawSig: Buffer): Buffer => {
        const r = rawSig.subarray(0, 32)
        const s = rawSig.subarray(32)
        const int = (buf: Buffer): Buffer => {
          let b = buf
          while (b.length > 1 && b[0] === 0) b = b.subarray(1)
          const prefix = b[0] & 0x80 ? Buffer.from([0, ...b]) : b
          return Buffer.concat([Buffer.from([0x02, prefix.length]), prefix])
        }
        const body = Buffer.concat([int(r), int(s)])
        return Buffer.concat([Buffer.from([0x30, body.length]), body])
      }
      const verifier = createVerify('sha256')
      verifier.update(`${h}.${p}`)
      verifier.end()
      expect(verifier.verify(publicKey, toDer(raw))).toBe(true)
    } finally {
      cleanup(dir)
    }
  })

  it('derToRawJwt rejects malformed DER', () => {
    expect(() => derToRawJwt(Buffer.from([0x00, 0x01]))).toThrow()
  })
})

describe('PlayPublisher JWT', () => {
  it('mints an RS256 service-account JWT', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    const dir = createTempProject({
      'sa.json': JSON.stringify({ client_email: 'bot@test.iam.gserviceaccount.com', private_key: pem, token_uri: 'https://oauth2.googleapis.com/token' }),
    })
    try {
      const account = loadServiceAccount(join(dir, 'sa.json'))
      const jwt = mintServiceAccountJwt(account, 'https://www.googleapis.com/auth/androidpublisher')
      const [h, p] = jwt.split('.')
      expect(JSON.parse(Buffer.from(h, 'base64url').toString()).alg).toBe('RS256')
      expect(JSON.parse(Buffer.from(p, 'base64url').toString()).scope).toContain('androidpublisher')
      expect(jwt.split('.')).toHaveLength(3)
    } finally {
      cleanup(dir)
    }
  })
})

describe('SaasClient', () => {
  afterEach(() => delete process.env.VECTALON_BUILDS_API_KEY)

  it('reads the API key from the environment', () => {
    process.env.VECTALON_BUILDS_API_KEY = 'secret-key'
    expect(resolveApiKey()).toBe('secret-key')
  })

  it('reads the API key from a file path', () => {
    const dir = createTempProject({ 'key.txt': 'file-key\n' })
    try {
      expect(resolveApiKey(join(dir, 'key.txt'))).toBe('file-key')
    } finally {
      cleanup(dir)
    }
  })

  it('degrades to a dry-run description without a key', async () => {
    const dir = createTempProject({})
    const saas = new SaasClient({ projectId: 'test' })
    const m = seedBuild(dir)
    expect(saas.ready).toBe(false)
    const plan = saas.describePush(m)
    expect(plan[0]).toContain('/builds/initiate')
    expect(plan.join(' ')).toContain(m.checksum.slice(0, 12))
    const result = await saas.uploadBuild(m, 'missing.ipa')
    expect(result.ok).toBe(false)
    expect(result.dryRun).toBe(true)
    expect(result.error).toContain('VECTALON_BUILDS_API_KEY')
  })
})

describe('distributeBuild (dry-run)', () => {
  it('lists targets with tier metadata', () => {
    const targets = listTargets()
    expect(targets.map(t => t.id)).toEqual(['testflight', 'play-store', 'saas', 'portal'])
    expect(targets.find(t => t.id === 'saas')?.tier).toBe('team')
    expect(targets.find(t => t.id === 'testflight')?.tier).toBe('pro')
  })

  it('plans a TestFlight dry run without credentials', async () => {
    const dir = createTempProject({})
    try {
      seedBuild(dir, 'ios')
      const report = await distributeBuild(dir, { target: 'testflight', dryRun: true })
      expect(report.ok).toBe(true)
      expect(report.dryRun).toBe(true)
      expect(report.plan?.join(' ')).toContain('fastlane')
    } finally {
      cleanup(dir)
    }
  })

  it('rejects an Android build for TestFlight', async () => {
    const dir = createTempProject({})
    try {
      seedBuild(dir, 'android')
      const report = await distributeBuild(dir, { target: 'testflight', dryRun: true })
      expect(report.ok).toBe(false)
      expect(report.error).toContain('requires an iOS')
    } finally {
      cleanup(dir)
    }
  })

  it('plans a Play Store dry run with a track', async () => {
    const dir = createTempProject({})
    try {
      seedBuild(dir, 'android')
      const report = await distributeBuild(dir, { target: 'play-store', track: 'beta', dryRun: true })
      expect(report.ok).toBe(true)
      expect(report.plan?.join(' ')).toContain('beta')
    } finally {
      cleanup(dir)
    }
  })

  it('errors when no build exists', async () => {
    const dir = createTempProject({})
    try {
      const report = await distributeBuild(dir, { target: 'saas', dryRun: true })
      expect(report.ok).toBe(false)
      expect(report.error).toContain('No archived build found')
    } finally {
      cleanup(dir)
    }
  })
})
