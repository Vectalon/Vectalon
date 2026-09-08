import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  LicenseLifecycleStore,
  describeLicenseStatus,
  type LicenseCredentialVerifier,
} from '../../src/auth/licenseLifecycle'
import { cleanup, createTempProject } from '../helpers/tmp'

const accepted: LicenseCredentialVerifier = () => ({
  ok: true,
  tier: 'team',
  state: 'active',
  expiresAt: 1_900_000_000_000,
})

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
