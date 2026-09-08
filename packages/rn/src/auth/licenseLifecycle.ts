/**
 * Customer license lifecycle adapter.
 *
 * Core owns cryptographic and lifecycle policy. This module only connects that
 * contract to the RN CLI's durable local state and deliberately never returns
 * a credential to a caller that might log it.
 */

import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import {
  AtomicLicenseStorage,
  LicenseValidator,
  StaticLicenseKeySource,
  verifyLicenseWithPolicy,
  type LicenseVerificationErrorCode,
} from '@vectalon-dev/core'

export type LicenseAccess = 'granted' | 'warning' | 'blocked'
export type LicenseStateLabel = 'active' | 'grace' | 'stale' | 'suspended' | 'expired' | 'canceled' | 'refunded' | 'revoked' | 'superseded' | 'invalid'

export type LicenseCredentialCheck =
  | Readonly<{ ok: true; tier: string; state: 'active' | 'grace'; expiresAt: number; legacy?: boolean }>
  | Readonly<{ ok: false; code: string; lifecycle?: string }>

export type LicenseCredentialVerifier = (token: string, record?: Readonly<{ lastTrustedTime: number; lastOnlineAt: number }>) => LicenseCredentialCheck

export const LICENSE_KEYSET_PROVENANCE = Object.freeze({
  coreSourceRevision: '98aee264a9d9139c058fd11d3e312b384deb2e40',
  keys: Object.freeze([{ id: 'vectalon-legacy', algorithm: 'RS256' as const, status: 'active' as const }]),
})

const LIFECYCLE_FILENAME = 'license-v2.json'
const DEFAULT_ISSUER = 'https://licenses.vectalon.dev'
const DEFAULT_AUDIENCE = 'vectalon-cli'
const DEFAULT_TIERS = ['pro', 'team', 'enterprise']

/**
 * Uses Core's atomic record format. Legacy files are read-only migration input;
 * the old file is never overwritten, so a user retains an independently
 * recoverable copy until a later deliberate cleanup.
 */
export class LicenseLifecycleStore {
  private readonly storage: AtomicLicenseStorage
  private readonly legacyPaths: readonly string[]

  constructor(options: Readonly<{ directory: string; legacyPaths?: readonly string[] }>) {
    this.storage = new AtomicLicenseStorage({ directory: options.directory, filename: LIFECYCLE_FILENAME })
    this.legacyPaths = options.legacyPaths ?? [
      join(options.directory, 'license.json'),
      join(homedir(), '.config', 'vectalon', 'license.json'),
    ]
  }

  read() { return this.storage.read() }

  save(token: string, verify: LicenseCredentialVerifier, now = Date.now()): Readonly<{ ok: true }> | Readonly<{ ok: false; code: string }> {
    const prior = this.storage.read()
    const record = prior.ok ? prior.record : undefined
    const checked = verify(token, record)
    if (!checked.ok) return { ok: false, code: checked.code }
    const written = this.storage.write({ token, lastTrustedTime: now, lastOnlineAt: now })
    return written.ok ? { ok: true } : { ok: false, code: written.code }
  }

  migrateLegacy(verify: LicenseCredentialVerifier, now = Date.now()): Readonly<{ ok: true; migrated: boolean }> | Readonly<{ ok: false; code: string }> {
    if (this.storage.read().ok) return { ok: true, migrated: false }
    for (const path of this.legacyPaths) {
      const token = readLegacyToken(path)
      if (!token) continue
      const saved = this.save(token, verify, now)
      return saved.ok ? { ok: true, migrated: true } : saved
    }
    return { ok: true, migrated: false }
  }
}

/** Verify with the reviewed Core policy, then retain the legacy facade only for compatible old credentials. */
export function verifyCustomerLicense(token: string, record?: Readonly<{ lastTrustedTime: number; lastOnlineAt: number }>): LicenseCredentialCheck {
  const result = verifyLicenseWithPolicy(token, {
    keys: keySource(),
    clock: { now: () => Date.now() },
    policy: {
      issuer: process.env.VECTALON_LICENSE_ISSUER || DEFAULT_ISSUER,
      audience: process.env.VECTALON_LICENSE_AUDIENCE || DEFAULT_AUDIENCE,
      product: 'rn',
      allowedTiers: DEFAULT_TIERS,
    },
    lastTrustedTime: record?.lastTrustedTime,
    lastOnlineAt: record?.lastOnlineAt,
  })
  if (result.ok && (result.claims.state === 'active' || result.claims.state === 'grace')) {
    return { ok: true, tier: result.claims.tier, state: result.claims.state, expiresAt: result.claims.expiresAt }
  }
  if (result.ok) return { ok: false, code: 'inactive_lifecycle', lifecycle: result.claims.state }

  // Existing compatible credentials retain their established verification
  // behavior. They are still stored atomically after their first lifecycle use.
  const legacy = LicenseValidator.validate(token)
  if (legacy.valid && legacy.license) {
    return { ok: true, tier: legacy.license.tier, state: 'active', expiresAt: legacy.license.expiresAt, legacy: true }
  }
  return { ok: false, code: result.code as LicenseVerificationErrorCode }
}

export function describeLicenseStatus(check: LicenseCredentialCheck): Readonly<{ access: LicenseAccess; state: LicenseStateLabel; message: string }> {
  if (check.ok) {
    if (check.state === 'grace') return { access: 'warning', state: 'grace', message: 'License is in grace period. Refresh while online to retain paid access.' }
    return { access: 'granted', state: 'active', message: 'License is active.' }
  }
  const lifecycle = check.lifecycle
  if (lifecycle === 'suspended' || lifecycle === 'expired' || lifecycle === 'canceled' || lifecycle === 'refunded' || lifecycle === 'revoked' || lifecycle === 'superseded') {
    return { access: 'blocked', state: lifecycle, message: `License is ${lifecycle}. Paid access is unavailable until it is refreshed or replaced.` }
  }
  if (check.code === 'offline_lease_expired' || check.code === 'clock_rollback') {
    return { access: 'blocked', state: 'stale', message: 'The offline license lease is stale. Connect and run vectalon auth --refresh.' }
  }
  if (check.code === 'expired') return { access: 'blocked', state: 'expired', message: 'License has expired. Refresh or renew it to continue paid access.' }
  return { access: 'blocked', state: 'invalid', message: 'License cannot be verified. Paid access is unavailable.' }
}

export function customerLicenseStore(): LicenseLifecycleStore {
  const directory = process.env.RN_VECTALON_CONFIG_DIR || join(homedir(), '.config', 'rn-vectalon')
  return new LicenseLifecycleStore({ directory })
}

function keySource(): StaticLicenseKeySource {
  const publicKey = readFileSync(require.resolve('@vectalon-dev/core/public-key.pem'), 'utf8')
  return new StaticLicenseKeySource(LICENSE_KEYSET_PROVENANCE.keys.map(key => ({ ...key, publicKey })))
}

function readLegacyToken(path: string): string | null {
  try {
    if (!existsSync(path)) return null
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (!value || typeof value !== 'object') return null
    const token = (value as Record<string, unknown>).key
    return typeof token === 'string' && token.length > 0 ? token : null
  } catch { return null }
}
