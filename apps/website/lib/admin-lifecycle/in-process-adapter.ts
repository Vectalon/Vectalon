import 'server-only'

import { createHash } from 'node:crypto'
import { Pool, type PoolConfig } from 'pg'
import { StaticLicenseKeySource, verifyLicenseWithPolicy, type LicenseVerificationKey } from '@vectalon-dev/core'
import issuerPolicy from '../../../../packages/rn/src/license-policy.json'
import { LicenseLifecycleService } from './generated/service'
import { PostgresLicenseRepository } from './generated/postgres'
import { signerFromEnvironment, type LicenseSigner } from './generated/signer'
import type { LicenseClaimsV2, LicenseRecord, LifecycleResult } from './generated/types'
import type { LicenseRepository } from './generated/repository'
import { CUSTOMER_TERMINAL_LIFECYCLE_STATES, lifecycleEnvelope, type CustomerTerminalLifecycleState } from './public-envelope'

type CustomerAction = 'activate' | 'refresh'
export type VerifiedCredential = Readonly<Pick<LicenseClaimsV2, 'jti' | 'sub' | 'aud' | 'product' | 'tier' | 'seats' | 'state'>>
export type VerifiedLifecycleDenial = Readonly<{ denied: CustomerTerminalLifecycleState }>
export type CredentialVerifier = (credential: string) => Promise<VerifiedCredential | VerifiedLifecycleDenial | null>

export type InProcessLifecycleDependencies = Readonly<{
  repository: LicenseRepository
  signer: LicenseSigner
  credentialVerifier: CredentialVerifier
  issuer?: string
  now?: () => number
}>

/**
 * The route only supplies a bearer credential and a customer action. The
 * lifecycle command's actor, idempotency key, revision and audit record are
 * all derived on this server from the verified credential and durable record.
 */
export function createInProcessLifecycleAdapter(dependencies: InProcessLifecycleDependencies) {
  const now = dependencies.now ?? Date.now
  const issuer = dependencies.issuer ?? issuerPolicy.issuer
  const service = new LicenseLifecycleService(customerReplayRepository(dependencies.repository), dependencies.signer, issuer)
  return {
    async execute(input: Readonly<{ action: CustomerAction; credential: string }>): Promise<Record<string, unknown>> {
      const claims = await dependencies.credentialVerifier(input.credential)
      if (!claims) return lifecycleEnvelope(failure('unauthorized', 'credential verification failed'))
      if ('denied' in claims) return lifecycleEnvelope(failure('invalid_transition', `license is ${claims.denied}`), claims.denied)
      const record = await dependencies.repository.get(claims.jti)
      if (!record || !matchesRecord(claims, record)) return lifecycleEnvelope(failure('not_found', 'license does not exist'))
      const command = {
        action: input.action,
        licenseId: record.id,
        // The first mutation still checks the durable revision. Customer replay
        // fingerprints are derived before this live value can change.
        expectedRevision: record.revision,
        // This stable key makes network retries replay the original signed lease.
        idempotencyKey: requestKey(input.action, input.credential),
        actor: { id: `customer:${record.subjectId}`, permissions: ['license:write', 'license:sign'] as const },
        now: now(),
      } as const
      const result = await service.execute(command)
      return lifecycleEnvelope(result, !result.ok ? terminalLifecycle(record.state) : undefined)
    },
  }
}

export function configuredInProcessLifecycleAdapter() {
  const signer = signerFromEnvironment()
  return createInProcessLifecycleAdapter({
    repository: new PostgresLicenseRepository(lifecyclePool()),
    signer,
    credentialVerifier: environmentCredentialVerifier(),
  })
}

let pool: Pool | undefined
function lifecyclePool(): Pool {
  if (pool) return pool
  const connectionString = process.env.VECTALON_LICENSE_DATABASE_URL ?? process.env.DATABASE_URL
  if (!connectionString) throw new Error('license-database-unavailable')
  const host = new URL(connectionString).hostname
  const local = host === 'localhost' || host === '127.0.0.1' || host === '::1'
  const ca = process.env.VECTALON_LICENSE_DATABASE_SSL_CA
  const options: PoolConfig = { connectionString, max: 2, ...(local ? {} : { ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) } }) }
  return pool = new Pool(options)
}

/** Verifies a V2 credential using a non-public deployment key; never logs it. */
export function environmentCredentialVerifier(environment: Readonly<Record<string, string | undefined>> = process.env): CredentialVerifier {
  const keys = environmentVerificationKeys(environment)
  return async credential => verifyCredential(credential, keys)
}

/**
 * This is deliberately a Core policy call, not a second JWT implementation:
 * kid/algorithm/key status, issuer/audience/product, lease times, signature,
 * and lifecycle state all fail closed before a route can select a record.
 */
export async function verifyCredential(credential: string, keys: StaticLicenseKeySource, now = Date.now): Promise<VerifiedCredential | VerifiedLifecycleDenial | null> {
  try {
    const result = verifyLicenseWithPolicy(credential, {
      keys,
      clock: { now },
      policy: { issuer: issuerPolicy.issuer, audience: 'vectalon-cli', product: 'rn', allowedTiers: ['pro', 'team', 'enterprise'] },
    })
    if (!result.ok) {
      if (result.code === 'expired') return { denied: 'expired' }
      const lifecycle = result.code === 'inactive_lifecycle' ? terminalLifecycleFromCredential(credential) : undefined
      if (lifecycle) return { denied: lifecycle }
      return null
    }
    const claims = result.claims
    return { jti: claims.licenseId, sub: claims.subject, aud: claims.audience[0], product: claims.product, tier: claims.tier as VerifiedCredential['tier'], seats: claims.seats, state: claims.state as VerifiedCredential['state'] }
  } catch { return null }
}

/** Public key registry only: active and overlap are usable; retired/compromised remain explicit rejections. */
export function environmentVerificationKeys(environment: Readonly<Record<string, string | undefined>> = process.env): StaticLicenseKeySource {
  const raw = environment.VECTALON_LICENSE_VERIFICATION_KEYS
  if (!raw) throw new Error('license-verification-keyset-unavailable')
  let keys: unknown
  try { keys = JSON.parse(raw) } catch { throw new Error('license-verification-keyset-unavailable') }
  if (!Array.isArray(keys)) throw new Error('license-verification-keyset-unavailable')
  const verified: LicenseVerificationKey[] = keys.map(value => {
    if (!value || typeof value !== 'object') throw new Error('license-verification-keyset-unavailable')
    const key = value as Record<string, unknown>
    if (typeof key.id !== 'string' || key.algorithm !== 'RS256' || !['active', 'overlap', 'retired', 'compromised'].includes(String(key.status)) || typeof key.publicKey !== 'string' || /PRIVATE KEY/.test(key.publicKey)) throw new Error('license-verification-keyset-unavailable')
    // Core's public verifier calls an overlap key active; its Admin-only
    // rollout label never changes the fact that retired/compromised reject.
    return { id: key.id, algorithm: 'RS256', status: (key.status === 'overlap' ? 'active' : key.status) as LicenseVerificationKey['status'], publicKey: key.publicKey }
  })
  return new StaticLicenseKeySource(verified)
}

function requestKey(action: CustomerAction, credential: string): string {
  return `customer-${action}-${createHash('sha256').update(credential).digest('hex').slice(0, 48)}`
}
function matchesRecord(claims: VerifiedCredential, record: LicenseRecord): boolean {
  // Mutable entitlement fields deliberately do not block an idempotent replay.
  // A fresh mutation still compares the server-owned revision in the transaction.
  return claims.jti === record.id && claims.sub === record.subjectId && claims.aud === record.audience
}

function terminalLifecycle(value: unknown): CustomerTerminalLifecycleState | undefined {
  return CUSTOMER_TERMINAL_LIFECYCLE_STATES.includes(value as CustomerTerminalLifecycleState)
    ? value as CustomerTerminalLifecycleState : undefined
}

/** Only a Core-confirmed inactive-lifecycle result may surface this display state. */
function terminalLifecycleFromCredential(credential: string): CustomerTerminalLifecycleState | undefined {
  try {
    const payload = JSON.parse(Buffer.from(credential.split('.')[1] ?? '', 'base64url').toString('utf8')) as Record<string, unknown>
    return terminalLifecycle(payload.state)
  } catch { return undefined }
}

/**
 * The public gateway derives one key per bearer/action, so its replay body is
 * keyed by that immutable command identity rather than an optimistic revision
 * read after a lost response. Generic Admin commands retain their full command
 * fingerprint through the underlying repository.
 */
function customerReplayRepository(repository: LicenseRepository): LicenseRepository {
  return {
    requiresSigningKeySnapshot: repository.requiresSigningKeySnapshot,
    get: licenseId => repository.get(licenseId),
    listAudit: licenseId => repository.listAudit(licenseId),
    atomic: (input, work) => repository.atomic({
      ...input,
      fingerprint: createHash('sha256').update(`customer-replay:${input.idempotencyKey}`).digest('hex'),
    }, work),
  }
}
function failure(code: Extract<LifecycleResult, { ok: false }>['code'], message: string): LifecycleResult { return { ok: false, code, message } }
