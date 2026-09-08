import { createInProcessLifecycleAdapter } from '../lib/admin-lifecycle/in-process-adapter'
import { InMemoryLicenseRepository } from '../lib/admin-lifecycle/generated/repository'
import type { LicenseRecord } from '../lib/admin-lifecycle/generated/types'

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
    expect(persisted?.revision).toBe(2)
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ action: 'refresh', actorId: 'customer:customer-001', priorRevision: 1, revision: 2 })
    expect(audit[0].idempotencyKey).toMatch(/^customer-refresh-[a-f0-9]{48}$/)

    // A consumed bearer cannot mint a second lease: its server-derived key is
    // already bound to the original revision in Admin's atomic fingerprint.
    const replay = await adapter.execute({ action: 'refresh', credential }) as { ok: boolean; error?: { code: string } }
    expect(replay).toMatchObject({ ok: false, error: { code: 'idempotency_conflict' } })
    expect(signer.signClaims).toHaveBeenCalledTimes(1)
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
})
