import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { generateKeyPairSync, sign } from 'crypto'
import { join } from 'path'
import {
  createCustomerLicenseVerifier,
  LicenseLifecycleStore,
  describeLicenseStatus,
  type LicenseCredentialVerifier,
} from '../../src/auth/licenseLifecycle'
import { authCommand } from '../../src/cli/commands/auth'
import { cleanup, createTempProject } from '../helpers/tmp'

const accepted: LicenseCredentialVerifier = () => ({
  ok: true,
  tier: 'team',
  state: 'active',
  expiresAt: 1_900_000_000_000,
})

const NOW = 1_800_000_000_000
const DAY = 86_400_000

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

/** A real RS256 V2 credential. The private key exists only for this test process. */
function v2Fixture() {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const key = { id: 'test-key', algorithm: 'RS256' as const, status: 'active' as const, publicKey: pair.publicKey }
  const claims = {
    license_version: 2, jti: 'license-123', iss: 'https://licenses.vectalon.dev', aud: 'vectalon-cli',
    sub: 'customer-123', product: ['rn'], tier: 'team', seats: 4, state: 'active',
    iat: NOW / 1000, nbf: NOW / 1000, exp: (NOW + 30 * DAY) / 1000,
  }
  const token = (patch: Record<string, unknown> = {}, header: Record<string, unknown> = {}) => {
    const input = `${encode({ alg: 'RS256', kid: key.id, typ: 'vectalon-license+jwt', ...header })}.${encode({ ...claims, ...patch })}`
    return `${input}.${sign('RSA-SHA256', Buffer.from(input, 'ascii'), pair.privateKey).toString('base64url')}`
  }
  return { key, claims, token }
}

describe('versioned license lifecycle storage', () => {
  let directory: string

  beforeEach(() => { directory = createTempProject({}) })
  afterEach(() => cleanup(directory))

  it('migrates a compatible legacy credential only after it is verified and retains a recoverable record', () => {
    const legacy = join(directory, 'license.json')
    mkdirSync(directory, { recursive: true })
    writeFileSync(legacy, JSON.stringify({ key: 'legacy-credential', tier: 'team', product: 'rn', issuedAt: 1, expiresAt: 2 }))

    const store = new LicenseLifecycleStore({ directory, legacyPaths: [legacy] })
    const result = store.migrateLegacy(accepted, 1_800_000_000_000)

    expect(result).toMatchObject({ ok: true, migrated: true })
    expect(store.read()).toMatchObject({ ok: true, record: { token: 'legacy-credential', revision: 1 } })
    expect(existsSync(join(directory, 'license-v2.json'))).toBe(true)
  })

  it('keeps a prior verified record when a replacement credential is rejected', () => {
    const store = new LicenseLifecycleStore({ directory, legacyPaths: [] })
    expect(store.save('credential-one', accepted, 1_800_000_000_000)).toMatchObject({ ok: true })

    const rejected: LicenseCredentialVerifier = () => ({ ok: false, code: 'invalid_signature' })
    expect(store.save('credential-two', rejected, 1_800_000_000_001)).toEqual({ ok: false, code: 'invalid_signature' })
    expect(store.read()).toMatchObject({ ok: true, record: { token: 'credential-one' } })
  })

  it('recovers the prior record when the current record is corrupt', () => {
    const store = new LicenseLifecycleStore({ directory, legacyPaths: [] })
    expect(store.save('credential-one', accepted, 1_800_000_000_000)).toMatchObject({ ok: true })
    expect(store.save('credential-two', accepted, 1_800_000_000_001)).toMatchObject({ ok: true })
    writeFileSync(join(directory, 'license-v2.json'), '{broken')

    expect(store.read()).toMatchObject({ ok: true, recovered: true, record: { token: 'credential-one' } })
    expect(readFileSync(join(directory, 'license-v2.json.previous'), 'utf8')).not.toContain('credential-two')
  })

  it('recovers a verified previous record when the current structurally valid record is policy-incompatible', () => {
    const f = v2Fixture()
    const verify = createCustomerLicenseVerifier({ keys: [f.key], now: () => NOW })
    const store = new LicenseLifecycleStore({ directory, legacyPaths: [] })
    expect(store.save(f.token(), verify, NOW)).toEqual({ ok: true })
    expect(store.save(f.token({ aud: 'previous-product-version' }), () => ({ ok: true, tier: 'team', state: 'active', expiresAt: NOW + DAY }), NOW + 1)).toEqual({ ok: true })

    expect(store.readVerified(verify)).toMatchObject({ ok: true, recovered: true, record: { revision: 1 }, check: { ok: true, tier: 'team' } })
  })
})

describe('versioned customer credential policy', () => {
  it('activates a verified V2 credential through the auth command and leaves it authoritative for recovery', async () => {
    const f = v2Fixture()
    const verify = createCustomerLicenseVerifier({ keys: [f.key], now: () => NOW })
    const temp = createTempProject({})
    try {
      const store = new LicenseLifecycleStore({ directory: temp, legacyPaths: [] })
      jest.spyOn(Date, 'now').mockReturnValue(NOW)
      await authCommand({ license: f.token() }, { store, verify })
      expect(store.readVerified(verify)).toMatchObject({ ok: true, recovered: false, check: { tier: 'team', state: 'active' } })
    } finally { cleanup(temp) }
  })

  it.each([
    ['inactive lifecycle', { state: 'revoked' }, 'inactive_lifecycle'],
    ['wrong issuer', { iss: 'https://attacker.example' }, 'wrong_issuer'],
    ['wrong audience', { aud: 'not-vectalon' }, 'wrong_audience'],
    ['wrong product', { product: ['python'] }, 'wrong_product'],
    ['expired offline lease', {}, 'offline_lease_expired'],
  ])('keeps a recognized V2 %s failure terminal instead of accepting it as legacy', (_name, patch, expected) => {
    const f = v2Fixture()
    const record = expected === 'offline_lease_expired' ? { lastTrustedTime: NOW, lastOnlineAt: NOW - 35 * DAY - 1 } : undefined
    const verify = createCustomerLicenseVerifier({ keys: [f.key], now: () => NOW })
    expect(verify(f.token(patch), record)).toEqual(expect.objectContaining({ ok: false, code: expected }))
  })

  it.each([
    ['unknown', [], 'unknown_key'],
    ['retired', ['retired'] as const, 'retired_key'],
    ['compromised', ['compromised'] as const, 'compromised_key'],
  ])('keeps a recognized V2 %s key failure terminal', (_name, statuses, expected) => {
    const f = v2Fixture()
    const keys = statuses.length === 0 ? [] : [{ ...f.key, status: statuses[0] }]
    const verify = createCustomerLicenseVerifier({ keys, now: () => NOW })
    expect(verify(f.token())).toEqual(expect.objectContaining({ ok: false, code: expected }))
  })

  it('keeps V2 algorithm confusion terminal', () => {
    const f = v2Fixture()
    const verify = createCustomerLicenseVerifier({ keys: [f.key], now: () => NOW })
    expect(verify(f.token({}, { alg: 'HS256' }))).toEqual(expect.objectContaining({ ok: false, code: 'unsupported_algorithm' }))
  })
})

describe('license lifecycle UX', () => {
  it('does not silently grant access when a paid credential is stale, revoked, or inactive', () => {
    expect(describeLicenseStatus({ ok: false, code: 'offline_lease_expired' })).toMatchObject({ access: 'blocked', state: 'stale' })
    expect(describeLicenseStatus({ ok: false, code: 'inactive_lifecycle', lifecycle: 'revoked' })).toMatchObject({ access: 'blocked', state: 'revoked' })
    expect(describeLicenseStatus({ ok: true, tier: 'pro', state: 'grace', expiresAt: 1_900_000_000_000 })).toMatchObject({ access: 'warning', state: 'grace' })
  })

  it('exposes explicit status, refresh, and recovery lifecycle actions', () => {
    const command = readFileSync(join(__dirname, '../../src/cli/index.ts'), 'utf8')
    expect(command).toContain(".option('--status'")
    expect(command).toContain(".option('--refresh'")
    expect(command).toContain(".option('--recover'")
  })

})
