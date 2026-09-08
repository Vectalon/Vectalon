import 'server-only'

import { createHash, createPublicKey, verify } from 'node:crypto'
import { Pool, type PoolConfig } from 'pg'
import { LicenseLifecycleService } from './generated/service'
import { PostgresLicenseRepository } from './generated/postgres'
import { signerFromEnvironment, type LicenseSigner } from './generated/signer'
import type { LicenseClaimsV2, LicenseRecord, LifecycleResult } from './generated/types'
import type { LicenseRepository } from './generated/repository'
import { lifecycleEnvelope } from './public-envelope'

type CustomerAction = 'activate' | 'refresh'
export type VerifiedCredential = Readonly<Pick<LicenseClaimsV2, 'jti' | 'sub' | 'aud' | 'product' | 'tier' | 'seats' | 'state'>>
export type CredentialVerifier = (credential: string) => Promise<VerifiedCredential | null>

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
  const issuer = dependencies.issuer ?? 'https://licenses.vectalon.in'
  const service = new LicenseLifecycleService(dependencies.repository, dependencies.signer, issuer)
  return {
    async execute(input: Readonly<{ action: CustomerAction; credential: string }>): Promise<Record<string, unknown>> {
      const claims = await dependencies.credentialVerifier(input.credential)
      if (!claims) return lifecycleEnvelope(failure('unauthorized', 'credential verification failed'))
      const record = await dependencies.repository.get(claims.jti)
      if (!record || !matchesRecord(claims, record)) return lifecycleEnvelope(failure('not_found', 'license does not exist'))
      const command = {
        action: input.action,
        licenseId: record.id,
        expectedRevision: record.revision,
        // This stable key makes network retries replay the original signed lease.
        idempotencyKey: requestKey(input.action, input.credential),
        actor: { id: `customer:${record.subjectId}`, permissions: ['license:write', 'license:sign'] as const },
        now: now(),
      } as const
      return lifecycleEnvelope(await service.execute(command))
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
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('license-database-unavailable')
  const host = new URL(connectionString).hostname
  const local = host === 'localhost' || host === '127.0.0.1' || host === '::1'
  const ca = process.env.VECTALON_LICENSE_DATABASE_SSL_CA
  if (!local && !ca) throw new Error('license-database-tls-unconfigured')
  const options: PoolConfig = { connectionString, max: 2, ...(local ? {} : { ssl: { rejectUnauthorized: true, ca } }) }
  return pool = new Pool(options)
}

/** Verifies a V2 credential using a non-public deployment key; never logs it. */
export function environmentCredentialVerifier(environment: NodeJS.ProcessEnv = process.env): CredentialVerifier {
  const privateKey = environment.VECTALON_LICENSE_PRIVATE_KEY
  if (!privateKey) throw new Error('license-signing-unavailable')
  const publicKey = createPublicKey(privateKey.replace(/\\n/g, '\n'))
  return async credential => verifyCredential(credential, publicKey)
}

export async function verifyCredential(credential: string, publicKey: ReturnType<typeof createPublicKey>): Promise<VerifiedCredential | null> {
  const parts = credential.split('.')
  if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return null
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as Record<string, unknown>
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>
    if (header.alg !== 'RS256' || header.typ !== 'vectalon-license+jwt' || !verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`, 'ascii'), publicKey, Buffer.from(parts[2], 'base64url'))) return null
    if (claims.license_version !== 2 || !text(claims.jti) || !text(claims.sub) || !text(claims.aud) || !Array.isArray(claims.product) || !claims.product.every(text) || !['pro', 'team', 'enterprise'].includes(String(claims.tier)) || !Number.isSafeInteger(claims.seats) || !['active', 'grace'].includes(String(claims.state))) return null
    return { jti: claims.jti, sub: claims.sub, aud: claims.aud, product: claims.product, tier: claims.tier as VerifiedCredential['tier'], seats: claims.seats as number, state: claims.state as VerifiedCredential['state'] }
  } catch { return null }
}

function requestKey(action: CustomerAction, credential: string): string {
  return `customer-${action}-${createHash('sha256').update(credential).digest('hex').slice(0, 48)}`
}
function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0 }
function matchesRecord(claims: VerifiedCredential, record: LicenseRecord): boolean {
  return claims.sub === record.subjectId && claims.aud === record.audience && claims.tier === record.tier && claims.seats === record.seats && claims.product.length === record.product.length && claims.product.every((product, index) => product === record.product[index])
}
function failure(code: Extract<LifecycleResult, { ok: false }>['code'], message: string): LifecycleResult { return { ok: false, code, message } }
