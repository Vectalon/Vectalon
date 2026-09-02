import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { generateKeyPairSync } from 'crypto'
import { verifyLicenseToken } from '@vectalon-dev/core'
import { AdminStore, FilePersistence } from '../lib/admin-store'

function makeStore(): { store: AdminStore; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'vectalon-admin-'))
  const store = new AdminStore(new FilePersistence(dir))
  return { store, dir }
}

describe('AdminStore persistence', () => {
  afterEach(() => {
    delete process.env.VECTALON_SEED_DEMO
    delete process.env.VECTALON_LICENSE_PRIVATE_KEY
    delete process.env.VECTALON_KEY_ID
    delete process.env.VERCEL_ENV
  })

  it('starts empty (no demo rows) outside development', async () => {
    const { store, dir } = makeStore()
    const data = await store.getData()
    expect(data.licenses).toEqual([])
    expect(data.customers).toEqual([])
    expect(data.processedWebhookEvents).toEqual([])
    rmSync(dir, { recursive: true, force: true })
  })

  it('migrates documents written before the new fields existed', async () => {
    const { store, dir } = makeStore()
    // Simulate a pre-upgrade admin.json without the new arrays.
    writeFileSync(
      join(dir, 'admin.json'),
      JSON.stringify({
        licenses: [
          { key: 'vct_old', tier: 'pro', product: 'rn', email: 'old@x.dev', status: 'active', issuedAt: 1, expiresAt: Date.now() + 100000, seats: 1, source: 'manual' },
        ],
        trials: [],
        customers: [],
        featureUsage: [],
        revenueByMonth: [],
      })
    )
    const data = await store.getData()
    expect(data.processedWebhookEvents).toEqual([])
    expect(data.waitlist).toEqual([])
    // The webhook idempotency path must not throw on the old shape.
    expect(await store.hasWebhookEvent('evt_x')).toBe(false)
    expect(await store.addWaitlist('old@x.dev', 'ios')).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it('seeds the demo dataset only when explicitly enabled', async () => {
    process.env.VECTALON_SEED_DEMO = '1'
    const { store, dir } = makeStore()
    const data = await store.getData()
    expect(data.licenses.length).toBeGreaterThan(0)
    expect(data.licenses.every(l => l.source === 'demo')).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it('issues, validates, and revokes licenses', async () => {
    const { store, dir } = makeStore()
    const license = await store.issueLicense({ tier: 'pro', email: 'dev@acme.dev', days: 30 })
    expect(license.key.startsWith('vct_')).toBe(true)
    expect(license.source).toBe('manual')

    const ok = await store.validateLicense(license.key)
    expect(ok.valid).toBe(true)
    expect(ok.license!.tier).toBe('pro')

    expect(await store.revokeLicense(license.key)).toBe(true)
    const revoked = await store.validateLicense(license.key)
    expect(revoked.valid).toBe(false)
    expect(revoked.reason).toBe('license revoked')
    rmSync(dir, { recursive: true, force: true })
  })

  it('issues Core-verifiable signed licenses when production signing is configured', async () => {
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
    process.env.VECTALON_LICENSE_PRIVATE_KEY = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    process.env.VECTALON_KEY_ID = 'production-1'
    const { store, dir } = makeStore()
    const license = await store.issueLicense({ tier: 'pro', email: 'signed@acme.dev', days: 30 })

    expect(verifyLicenseToken(license.key, {
      id: 'production-1',
      algorithm: 'RS256',
      publicKey: pair.publicKey,
    }, license.issuedAt)).toMatchObject({ ok: true })
    rmSync(dir, { recursive: true, force: true })
  })

  it('fails closed in production when signing is not configured', async () => {
    process.env.VERCEL_ENV = 'production'
    const { store, dir } = makeStore()
    await expect(store.issueLicense({ tier: 'pro', email: 'buyer@acme.dev' })).rejects.toThrow(
      'license-signing-key-not-configured'
    )
    rmSync(dir, { recursive: true, force: true })
  })

  it('rejects unsafe license durations', async () => {
    const { store, dir } = makeStore()
    await expect(store.issueLicense({
      tier: 'pro',
      email: 'buyer@acme.dev',
      days: Number.MAX_SAFE_INTEGER,
    })).rejects.toThrow('license-duration-invalid')
    rmSync(dir, { recursive: true, force: true })
  })

  it('revokes every license for an email (refunds) and marks churned', async () => {
    const { store, dir } = makeStore()
    await store.issueLicense({ tier: 'pro', email: 'buyer@x.dev' })
    await store.issueLicense({ tier: 'pro', email: 'buyer@x.dev' })
    await store.recordPayment({ email: 'buyer@x.dev', tier: 'pro', mrrCents: 1900 })

    expect(await store.revokeByEmail('buyer@x.dev')).toBe(2)
    const data = await store.getData()
    expect(data.licenses.filter(l => l.email === 'buyer@x.dev' && l.status === 'revoked')).toHaveLength(2)
    expect(data.customers.find(c => c.email === 'buyer@x.dev')?.status).toBe('churned')
    rmSync(dir, { recursive: true, force: true })
  })

  it('records payments and recomputes monthly revenue', async () => {
    const { store, dir } = makeStore()
    await store.recordPayment({ email: 'a@x.dev', tier: 'pro', mrrCents: 1900 })
    await store.recordPayment({ email: 'b@x.dev', tier: 'team', mrrCents: 9900 })

    const data = await store.getData()
    expect(data.customers).toHaveLength(2)
    const month = new Date().toISOString().slice(0, 7)
    const row = data.revenueByMonth.find(r => r.month === month)
    expect(row?.mrrCents).toBe(11800)
    expect(row?.arrCents).toBe(11800 * 12)
    rmSync(dir, { recursive: true, force: true })
  })

  it('records feature usage events', async () => {
    const { store, dir } = makeStore()
    await store.recordUsage('validate', 1)
    await store.recordUsage('validate', 1)
    await store.recordUsage('upgrade')
    const data = await store.getData()
    expect(data.featureUsage.find(f => f.feature === 'validate')?.count).toBe(2)
    expect(data.featureUsage.find(f => f.feature === 'upgrade')?.count).toBe(1)
    rmSync(dir, { recursive: true, force: true })
  })

  it('tracks webhook event ids for idempotency', async () => {
    const { store, dir } = makeStore()
    expect(await store.hasWebhookEvent('evt_1')).toBe(false)
    await store.markWebhookEvent('evt_1')
    expect(await store.hasWebhookEvent('evt_1')).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it('dedupes waitlist signups per email+product', async () => {
    const { store, dir } = makeStore()
    expect(await store.addWaitlist('dev@x.dev', 'ios')).toBe(true)
    expect(await store.addWaitlist('dev@x.dev', 'ios')).toBe(false)
    expect(await store.addWaitlist('dev@x.dev', 'android')).toBe(true)
    const data = await store.getData()
    expect(data.waitlist).toHaveLength(2)
    rmSync(dir, { recursive: true, force: true })
  })
})
