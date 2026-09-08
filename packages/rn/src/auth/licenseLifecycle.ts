/**
 * Customer license lifecycle adapter.
 *
 * Core owns cryptographic and lifecycle policy. This module only connects that
 * contract to the RN CLI's durable local state and deliberately never returns
 * a credential to a caller that might log it.
 */

import { createHash } from 'crypto'
import { existsSync, readFileSync, unlinkSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import {
  AtomicLicenseStorage,
  LicenseValidator,
  StaticLicenseKeySource,
  verifyLicenseWithPolicy,
  type LicenseVerificationKey,
  type StoredLicenseRecord,
} from '@vectalon-dev/core'

export type LicenseAccess = 'granted' | 'warning' | 'blocked'
export type LicenseStateLabel = 'active' | 'grace' | 'stale' | 'suspended' | 'expired' | 'canceled' | 'refunded' | 'revoked' | 'superseded' | 'invalid'

export type LicenseCredentialCheck =
  | Readonly<{ ok: true; tier: string; state: 'active' | 'grace'; expiresAt: number; legacy?: boolean }>
  | Readonly<{ ok: false; code: string; lifecycle?: string }>

export type LicenseCredentialVerifier = (token: string, record?: Readonly<{ lastTrustedTime: number; lastOnlineAt: number }>) => LicenseCredentialCheck

export type LicenseKeysetManifest = Readonly<{
  schemaVersion: 1
  coreSourceRevision: string
  keys: readonly Readonly<{ id: string; algorithm: 'RS256'; status: 'active' | 'retired' | 'compromised'; publicKeyFile: string; sha256: string }>[]
}>

export type VerifiedCustomerLicense =
  | Readonly<{ ok: true; record: StoredLicenseRecord; recovered: boolean; check: Extract<LicenseCredentialCheck, { ok: true }> }>
  | Readonly<{ ok: false; code: string; check?: Extract<LicenseCredentialCheck, { ok: false }> }>

/** The reviewed, package-relative trust manifest; malformed input fails V2 closed. */
export const LICENSE_KEYSET_PROVENANCE: LicenseKeysetManifest = loadBundledKeyset()

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
  private readonly previousPath: string
  private readonly legacyPaths: readonly string[]

  constructor(options: Readonly<{ directory: string; legacyPaths?: readonly string[] }>) {
    this.storage = new AtomicLicenseStorage({ directory: options.directory, filename: LIFECYCLE_FILENAME })
    this.previousPath = join(options.directory, `${LIFECYCLE_FILENAME}.previous`)
    this.legacyPaths = options.legacyPaths ?? [
      join(options.directory, 'license.json'),
      join(homedir(), '.config', 'vectalon', 'license.json'),
    ]
  }

  read() { return this.storage.read() }

  /** Verify a current record, then independently verify its previous revision if needed. */
  readVerified(verify: LicenseCredentialVerifier): VerifiedCustomerLicense {
    const current = this.storage.read()
    if (!current.ok) return { ok: false, code: current.code }
    const checked = verify(current.record.token, current.record)
    if (checked.ok) return { ok: true, record: current.record, recovered: current.recovered, check: checked }
    if (current.recovered) return { ok: false, code: checked.code, check: checked }

    const previous = readStoredRecord(this.previousPath)
    if (!previous || previous.revision >= current.record.revision) return { ok: false, code: checked.code, check: checked }
    const priorChecked = verify(previous.token, previous)
    if (priorChecked.ok) return { ok: true, record: previous, recovered: true, check: priorChecked }
    return { ok: false, code: checked.code, check: checked }
  }

  save(token: string, verify: LicenseCredentialVerifier, now = Date.now()): Readonly<{ ok: true }> | Readonly<{ ok: false; code: string }> {
    const prior = this.storage.read()
    const record = prior.ok ? prior.record : undefined
    const checked = verify(token, record)
    if (!checked.ok) return { ok: false, code: checked.code }
    const written = this.storage.write({ token, lastTrustedTime: now, lastOnlineAt: now })
    return written.ok ? { ok: true } : { ok: false, code: written.code }
  }

  /**
   * An online replacement has just been authenticated by the gateway. Verify
   * its signature, claims, current time, clock rollback, and storage revision,
   * but deliberately do not reapply an already-expired offline-age check.
   */
  saveOnlineReplacement(
    token: string,
    verify: LicenseCredentialVerifier,
    prior: StoredLicenseRecord,
    now = Date.now(),
  ): Readonly<{ ok: true }> | Readonly<{ ok: false; code: string }> {
    const checked = verify(token, { lastTrustedTime: prior.lastTrustedTime, lastOnlineAt: now })
    if (!checked.ok) return { ok: false, code: checked.code }
    const written = this.storage.write({ token, lastTrustedTime: now, lastOnlineAt: now })
    return written.ok ? { ok: true } : { ok: false, code: written.code }
  }

  /** Promote a verified fallback through Core's atomic revision protocol. */
  promote(record: StoredLicenseRecord): Readonly<{ ok: true; record: StoredLicenseRecord }> | Readonly<{ ok: false; code: string }> {
    const written = this.storage.write({
      token: record.token,
      lastTrustedTime: record.lastTrustedTime,
      lastOnlineAt: record.lastOnlineAt,
    })
    return written.ok ? { ok: true, record: written.record } : { ok: false, code: written.code }
  }

  /** Logout removes both the selected record and its recoverable predecessor. */
  clear(): void {
    for (const path of [join(dirname(this.previousPath), LIFECYCLE_FILENAME), this.previousPath]) {
      try { if (existsSync(path)) unlinkSync(path) } catch { /* logout is best-effort */ }
    }
  }

  migrateLegacy(verify: LicenseCredentialVerifier, now = Date.now()): Readonly<{ ok: true; migrated: boolean }> | Readonly<{ ok: false; code: string }> {
    const existing = this.storage.read()
    if (existing.ok) return { ok: true, migrated: false }
    if (existing.code !== 'not_found') return { ok: false, code: existing.code }
    for (const path of this.legacyPaths) {
      const token = readLegacyToken(path)
      if (!token) continue
      const saved = this.save(token, verify, now)
      return saved.ok ? { ok: true, migrated: true } : saved
    }
    return { ok: true, migrated: false }
  }
}

export function createCustomerLicenseVerifier(options: Readonly<{ keys: readonly LicenseVerificationKey[]; now?: () => number }>): LicenseCredentialVerifier {
  const keys = new StaticLicenseKeySource(options.keys)
  return (token, record) => verifyCustomerLicense(token, record, { keys, now: options.now })
}

/**
 * Recognize V2 before policy evaluation: a V2 credential never falls through
 * to the permissive legacy verifier after any V2 policy/key/signature error.
 */
export function verifyCustomerLicense(
  token: string,
  record?: Readonly<{ lastTrustedTime: number; lastOnlineAt: number }>,
  options?: Readonly<{ keys?: StaticLicenseKeySource; now?: () => number }>,
): LicenseCredentialCheck {
  const result = verifyLicenseWithPolicy(token, {
    keys: options?.keys ?? keySource(),
    clock: { now: options?.now ?? (() => Date.now()) },
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
  if (recognizesV2(token)) return { ok: false, code: result.code }

  // Compatibility is intentionally limited to genuinely legacy credentials.
  const legacy = LicenseValidator.validate(token)
  if (legacy.valid && legacy.license) {
    return { ok: true, tier: legacy.license.tier, state: 'active', expiresAt: legacy.license.expiresAt, legacy: true }
  }
  return { ok: false, code: result.code }
}

/** One authoritative evaluator for access gates, status, doctor, and alerts. */
export function currentCustomerLicense(): VerifiedCustomerLicense {
  const store = customerLicenseStore()
  const migration = store.migrateLegacy(verifyCustomerLicense)
  if (!migration.ok) return { ok: false, code: migration.code }
  return store.readVerified(verifyCustomerLicense)
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
  const root = dirname(require.resolve('@vectalon-dev/core/package.json'))
  const keys: LicenseVerificationKey[] = []
  for (const key of LICENSE_KEYSET_PROVENANCE.keys) {
    try {
      const publicKey = readFileSync(join(root, key.publicKeyFile), 'utf8')
      if (createHash('sha256').update(publicKey).digest('hex') !== key.sha256 || /PRIVATE KEY/.test(publicKey)) continue
      keys.push({ id: key.id, algorithm: key.algorithm, status: key.status, publicKey })
    } catch { /* missing/malformed trust material makes V2 fail closed */ }
  }
  return new StaticLicenseKeySource(keys)
}

function loadBundledKeyset(): LicenseKeysetManifest {
  try {
    const value: unknown = JSON.parse(readFileSync(require.resolve('@vectalon-dev/core/license-keyset.json'), 'utf8'))
    if (!isKeysetManifest(value)) throw new Error('invalid keyset')
    return Object.freeze({ ...value, keys: Object.freeze(value.keys.map(key => Object.freeze({ ...key }))) })
  } catch {
    return Object.freeze({ schemaVersion: 1, coreSourceRevision: 'unavailable', keys: Object.freeze([]) })
  }
}

function recognizesV2(token: string): boolean {
  try {
    const [header, payload, signature, ...extra] = token.split('.')
    if (!header || !payload || !signature || extra.length > 0) return false
    const decodedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as Record<string, unknown>
    const decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>
    return decodedPayload.license_version === 2 || decodedHeader.typ === 'vectalon-license+jwt'
  } catch { return false }
}

function isKeysetManifest(value: unknown): value is LicenseKeysetManifest {
  if (!value || typeof value !== 'object') return false
  const manifest = value as Record<string, unknown>
  if (manifest.schemaVersion !== 1 || typeof manifest.coreSourceRevision !== 'string' || !/^[a-f0-9]{40}$/.test(manifest.coreSourceRevision) || !Array.isArray(manifest.keys) || manifest.keys.length === 0) return false
  return manifest.keys.every(key => {
    if (!key || typeof key !== 'object') return false
    const record = key as Record<string, unknown>
    return typeof record.id === 'string' && record.id.length > 0 && record.algorithm === 'RS256' &&
      ['active', 'retired', 'compromised'].includes(record.status as string) && typeof record.publicKeyFile === 'string' &&
      !record.publicKeyFile.includes('/') && typeof record.sha256 === 'string' && /^[a-f0-9]{64}$/.test(record.sha256)
  })
}

function readStoredRecord(path: string): StoredLicenseRecord | null {
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (!value || typeof value !== 'object') return null
    const record = value as Record<string, unknown>
    return record.version === 1 && Number.isSafeInteger(record.revision) && (record.revision as number) > 0 &&
      typeof record.token === 'string' && record.token.length > 0 && Number.isSafeInteger(record.lastTrustedTime) && (record.lastTrustedTime as number) >= 0 &&
      Number.isSafeInteger(record.lastOnlineAt) && (record.lastOnlineAt as number) >= 0 ? record as StoredLicenseRecord : null
  } catch { return null }
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
