import { createInProcessLifecycleAdapter } from '../lib/admin-lifecycle/in-process-adapter'
import { environmentVerificationKeys, verifyCredential } from '../lib/admin-lifecycle/in-process-adapter'
import { InMemoryLicenseRepository } from '../lib/admin-lifecycle/generated/repository'
import type { LicenseRecord } from '../lib/admin-lifecycle/generated/types'
import { generateKeyPairSync, sign } from 'node:crypto'

const now = 1_800_000_000_000
const credential = 'customer-presented-credential'
const record: LicenseRecord = {
  id: 'license-customer-001', subjectId: 'customer-001', audience: 'vectalon-cli', product: ['rn'], tier: 'team', seats: 4,
  state: 'active', revision: 1, issuedAt: now - 10_000, notBefore: now - 10_000, expiresAt: now + 10_000,
  keyId: 'key-current', supersedesId: null, effectiveAt: now - 10_000,
}

describe('in-process Admin lifecycle adapter', () => {
  it('executes Admin’s durable refresh service with only server-derived command facts', async () => {
    const repository = new InMemoryLicenseRepository([record])
    const signer = { keyId: 'key-current', signClaims: jest.fn(async () => 'replacement-credential') }
    const verifier = jest.fn(async () => ({ jti: record.id, sub: record.subjectId, aud: record.audience, product: record.product, tier: record.tier, seats: record.seats, state: 'active' as const }))
    const adapter = createInProcessLifecycleAdapter({ repository, signer, credentialVerifier: verifier, now: () => now })

    const first = await adapter.execute({ action: 'refresh', credential }) as { ok: boolean; replayed?: boolean; credential?: string }
    const audit = await repository.listAudit(record.id)
    const persisted = await repository.get(record.id)

    expect(first).toMatchObject({ contractVersion: '1.0.0', ok: true, replayed: false, credential: 'replacement-credential' })
    expect(verifier).toHaveBeenCalledWith(credential)
    expect(signer.signClaims).toHaveBeenCalledTimes(1)
    expect(signer.signClaims).toHaveBeenCalledWith(expect.objectContaining({ iss: 'https://licenses.vectalon.dev' }))
    expect(persisted?.revision).toBe(2)
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ action: 'refresh', actorId: 'customer:customer-001', priorRevision: 1, revision: 2 })
    expect(audit[0].idempotencyKey).toMatch(/^customer-refresh-[a-f0-9]{48}$/)

    // If the first response is lost, the original bearer has to replay the
    // committed replacement even though the durable record is now revision 2.
    const replay = await adapter.execute({ action: 'refresh', credential }) as { ok: boolean; replayed?: boolean; credential?: string }
    expect(replay).toMatchObject({ contractVersion: '1.0.0', ok: true, replayed: true, credential: 'replacement-credential' })
    expect(signer.signClaims).toHaveBeenCalledTimes(1)

    // The key incorporates the command action, so another customer operation
    // is not mistaken for the lost refresh response.
    const distinct = await adapter.execute({ action: 'activate', credential }) as { ok: boolean; error?: { code: string } }
    expect(distinct).toMatchObject({ contractVersion: '1.0.0', ok: false, error: { code: 'invalid_transition' } })
  })

  it('rejects an unverifiable credential before it can select a durable license', async () => {
    const repository = new InMemoryLicenseRepository([record])
    const get = jest.spyOn(repository, 'get')
    const adapter = createInProcessLifecycleAdapter({ repository, signer: { keyId: 'key-current', signClaims: async () => 'never' }, credentialVerifier: async () => null })
    const result = await adapter.execute({ action: 'refresh', credential })

    expect(result).toEqual({ contractVersion: '1.0.0', ok: false, error: { code: 'unauthorized', message: 'credential verification failed', retryable: false } })
    expect(get).not.toHaveBeenCalled()
  })

  it('does not let customer claims forge the server-owned record identity', async () => {
    const repository = new InMemoryLicenseRepository([record])
    const adapter = createInProcessLifecycleAdapter({
      repository,
      signer: { keyId: 'key-current', signClaims: async () => 'never' },
      credentialVerifier: async () => ({ jti: record.id, sub: 'other-customer', aud: record.audience, product: record.product, tier: record.tier, seats: record.seats, state: 'active' }),
    })
    expect(await adapter.execute({ action: 'refresh', credential })).toEqual({ contractVersion: '1.0.0', ok: false, error: { code: 'not_found', message: 'license does not exist', retryable: false } })
  })

  it('uses Core V2 policy and the reviewed key registry for issuer, time, kid and key status', async () => {
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const claims = {
      license_version: 2, jti: record.id, iss: 'https://licenses.vectalon.dev', aud: record.audience, sub: record.subjectId,
      product: record.product, tier: record.tier, seats: record.seats, state: 'active',
      iat: now / 1000, nbf: now / 1000, exp: (now + 60_000) / 1000,
    }
    const token = (patch: Record<string, unknown> = {}, kid = 'overlap-key') => {
      const input = `${Buffer.from(JSON.stringify({ alg: 'RS256', kid, typ: 'vectalon-license+jwt' })).toString('base64url')}.${Buffer.from(JSON.stringify({ ...claims, ...patch })).toString('base64url')}`
      return `${input}.${sign('RSA-SHA256', Buffer.from(input, 'ascii'), pair.privateKey).toString('base64url')}`
    }
    const keys = environmentVerificationKeys({ VECTALON_LICENSE_VERIFICATION_KEYS: JSON.stringify([{ id: 'overlap-key', algorithm: 'RS256', status: 'overlap', publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString() }]) })

    await expect(verifyCredential(token(), keys, () => now)).resolves.toMatchObject({ jti: record.id })
    await expect(verifyCredential(token({ iss: 'https://licenses.vectalon.in' }), keys, () => now)).resolves.toBeNull()
    await expect(verifyCredential(token({ exp: (now - 1) / 1000 }), keys, () => now)).resolves.toBeNull()
    await expect(verifyCredential(token({ state: 'revoked' }), keys, () => now)).resolves.toEqual({ denied: 'revoked' })
    const terminalAdapter = createInProcessLifecycleAdapter({
      repository: new InMemoryLicenseRepository([record]),
      signer: { keyId: 'key-current', signClaims: async () => 'never' },
      credentialVerifier: value => verifyCredential(value, keys, () => now),
      now: () => now,
    })
    await expect(terminalAdapter.execute({ action: 'refresh', credential: token({ state: 'revoked' }) })).resolves.toEqual({
      contractVersion: '1.0.0', ok: false,
      error: { code: 'invalid_transition', message: 'license is revoked', retryable: false, lifecycle: 'revoked' },
    })
    const retired = environmentVerificationKeys({ VECTALON_LICENSE_VERIFICATION_KEYS: JSON.stringify([{ id: 'overlap-key', algorithm: 'RS256', status: 'retired', publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString() }]) })
    await expect(verifyCredential(token(), retired, () => now)).resolves.toBeNull()
  })
})
