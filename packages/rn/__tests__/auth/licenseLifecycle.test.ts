import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { generateKeyPairSync, sign } from 'crypto'
import { join } from 'path'
import {
  createCustomerLicenseVerifier,
  evaluateCustomerTier,
  LicenseLifecycleStore,
  describeLicenseStatus,
  type LicenseCredentialVerifier,
} from '../../src/auth/licenseLifecycle'
import { authCommand } from '../../src/cli/commands/auth'
import { getLogLines } from '../../src/cli/logger'
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

  it.each(['revoked', 'superseded'] as const)('does not replace the atomic record when a refreshed credential is %s', lifecycle => {
    const store = new LicenseLifecycleStore({ directory, legacyPaths: [] })
    expect(store.save('credential-one', accepted, NOW)).toEqual({ ok: true })
    const rejected: LicenseCredentialVerifier = () => ({ ok: false, code: 'inactive_lifecycle', lifecycle })

    expect(store.save('credential-two', rejected, NOW + 1)).toEqual({ ok: false, code: 'inactive_lifecycle' })
    expect(store.read()).toMatchObject({ ok: true, record: { token: 'credential-one', revision: 1 } })
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

  it('retains the signed terminal lifecycle state when Core denies a revoked credential', () => {
    const f = v2Fixture()
    const verify = createCustomerLicenseVerifier({ keys: [f.key], now: () => NOW })

    expect(verify(f.token({ state: 'revoked' }))).toEqual({ ok: false, code: 'inactive_lifecycle', lifecycle: 'revoked' })
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

  it('refreshes through the injected gateway, commits only a verified replacement, and redacts credentials from output', async () => {
    const temp = createTempProject({})
    const store = new LicenseLifecycleStore({ directory: temp, legacyPaths: [] })
    try {
      expect(store.save('credential-one', accepted, NOW)).toEqual({ ok: true })
      const gateway = { refresh: jest.fn(async (token: string) => {
        expect(token).toBe('credential-one')
        return { ok: true as const, credential: 'credential-two' }
      }) }
      await authCommand({ refresh: true }, { store, verify: accepted, gateway })
      expect(store.read()).toMatchObject({ ok: true, record: { token: 'credential-two', revision: 2 } })
      expect(getLogLines().join('\n')).not.toContain('credential-two')
    } finally {
      cleanup(temp)
    }
  })

  it('accepts an online replacement after an offline lease became stale and records a fresh online time', async () => {
    const temp = createTempProject({})
    const store = new LicenseLifecycleStore({ directory: temp, legacyPaths: [] })
    const staleAt = NOW - 35 * DAY - 1
    const verify: LicenseCredentialVerifier = (token, record) => {
      if (token === 'replacement-license') {
        return record?.lastOnlineAt === NOW
          ? { ok: true, tier: 'team', state: 'active', expiresAt: NOW + 30 * DAY }
          : { ok: false, code: 'offline_lease_expired' }
      }
      return accepted(token, record)
    }
    try {
      expect(store.save('stale-license', verify, staleAt)).toEqual({ ok: true })
      jest.spyOn(Date, 'now').mockReturnValue(NOW)
      await authCommand({ refresh: true }, {
        store,
        verify,
        gateway: { refresh: async (token: string) => {
          expect(token).toBe('stale-license')
          return { ok: true, credential: 'replacement-license' }
        } },
      })
      expect(store.read()).toMatchObject({
        ok: true,
        record: { token: 'replacement-license', revision: 2, lastTrustedTime: NOW, lastOnlineAt: NOW },
      })
    } finally {
      jest.restoreAllMocks()
      cleanup(temp)
    }
  })

  it('retains clock-rollback protection while saving an online replacement', () => {
    const temp = createTempProject({})
    try {
      const store = new LicenseLifecycleStore({ directory: temp, legacyPaths: [] })
      expect(store.save('credential-one', accepted, NOW + 1)).toEqual({ ok: true })
      const selected = store.read()
      if (!selected.ok) throw new Error('test record was not stored')
      const rollback: LicenseCredentialVerifier = (_token, record) => record?.lastTrustedTime === NOW + 1
        ? { ok: false, code: 'clock_rollback' }
        : accepted('credential-two')

      expect(store.saveOnlineReplacement('credential-two', rollback, selected.record, NOW)).toEqual({ ok: false, code: 'clock_rollback' })
      expect(store.read()).toMatchObject({ ok: true, record: { token: 'credential-one', revision: 1 } })
    } finally {
      cleanup(temp)
    }
  })

  it('uses the same gateway after local recovery without failing usable offline recovery', async () => {
    const temp = createTempProject({})
    const store = new LicenseLifecycleStore({ directory: temp, legacyPaths: [] })
    try {
      expect(store.save('credential-one', accepted, NOW)).toEqual({ ok: true })
      const gateway = { refresh: jest.fn(async () => ({ ok: false as const, code: 'offline' as const, retryable: true })) }
      await authCommand({ recover: true }, { store, verify: accepted, gateway })
      expect(gateway.refresh).toHaveBeenCalledWith('credential-one')
      expect(store.read()).toMatchObject({ ok: true, record: { token: 'credential-one' } })
    } finally {
      cleanup(temp)
    }
  })

  it('refreshes the verified prior record after recovering from a policy-invalid current record', async () => {
    const temp = createTempProject({})
    const store = new LicenseLifecycleStore({ directory: temp, legacyPaths: [] })
    const verify: LicenseCredentialVerifier = token => token === 'invalid-current'
      ? { ok: false, code: 'inactive_lifecycle', lifecycle: 'revoked' }
      : accepted(token)
    try {
      expect(store.save('verified-prior', accepted, NOW)).toEqual({ ok: true })
      expect(store.save('invalid-current', accepted, NOW + 1)).toEqual({ ok: true })
      const gateway = { refresh: jest.fn(async (token: string) => {
        expect(token).toBe('verified-prior')
        return { ok: true as const, credential: 'replacement-license' }
      }) }
      await authCommand({ recover: true }, { store, verify, gateway })
      expect(gateway.refresh).toHaveBeenCalledWith('verified-prior')
      expect(store.read()).toMatchObject({ ok: true, record: { token: 'replacement-license', revision: 4 } })
      expect(readFileSync(join(temp, 'license-v2.json.previous'), 'utf8')).toContain('verified-prior')
    } finally {
      cleanup(temp)
    }
  })

  it.each(['suspended', 'expired', 'canceled', 'refunded', 'revoked', 'superseded'] as const)('quarantines local and recoverable credentials after an authoritative %s refresh denial', async lifecycle => {
    const temp = createTempProject({})
    const store = new LicenseLifecycleStore({ directory: temp, legacyPaths: [] })
    try {
      expect(store.save('credential-one', accepted, NOW)).toEqual({ ok: true })
      expect(store.save('credential-two', accepted, NOW + 1)).toEqual({ ok: true })
      await authCommand({ refresh: true }, { store, verify: accepted, gateway: { refresh: async () => ({ ok: false as const, code: 'invalid_transition' as const, retryable: false, lifecycle }) } })
      expect(store.readVerified(accepted)).toEqual({ ok: false, code: 'inactive_lifecycle', check: { ok: false, code: 'inactive_lifecycle', lifecycle } })
      expect(evaluateCustomerTier('pro', { store, verify: accepted, now: () => NOW })).toMatchObject({ allowed: false })
      const output = getLogLines().join('\n')
      expect(output).toContain(`License refresh rejected: ${lifecycle}`)
      expect(output).not.toContain('credential-one')
      expect(output).not.toContain('credential-two')
    } finally {
      process.exitCode = undefined
      cleanup(temp)
    }
  })

  it.each(['suspended', 'canceled', 'refunded', 'revoked', 'superseded'] as const)('renders the signed %s state instead of falling through to free tier', async state => {
    const f = v2Fixture()
    const verify = createCustomerLicenseVerifier({ keys: [f.key], now: () => NOW })
    const temp = createTempProject({})
    const priorConfig = process.env.RN_VECTALON_CONFIG_DIR
    try {
      process.env.RN_VECTALON_CONFIG_DIR = temp
      const store = new LicenseLifecycleStore({ directory: temp, legacyPaths: [] })
      expect(store.save(f.token({ state }), accepted, NOW)).toEqual({ ok: true })
      await authCommand({ status: true }, { store, verify })
      expect(getLogLines().join('\n')).toContain(`License: ${state}`)
    } finally { process.env.RN_VECTALON_CONFIG_DIR = priorConfig; cleanup(temp) }
  })

  it('renders the real signed expired state instead of falling through to free tier', async () => {
    const f = v2Fixture()
    const temp = createTempProject({})
    const priorConfig = process.env.RN_VECTALON_CONFIG_DIR
    try {
      process.env.RN_VECTALON_CONFIG_DIR = temp
      const store = new LicenseLifecycleStore({ directory: temp, legacyPaths: [] })
      const expiredToken = f.token({ exp: (NOW + DAY) / 1000 })
      expect(store.save(expiredToken, accepted, NOW)).toEqual({ ok: true })
      const verify = createCustomerLicenseVerifier({ keys: [f.key], now: () => NOW + 2 * DAY })
      await authCommand({ status: true }, { store, verify })
      expect(getLogLines().join('\n')).toContain('License: expired')
    } finally { process.env.RN_VECTALON_CONFIG_DIR = priorConfig; cleanup(temp) }
  })

})
