import { createHmac } from 'crypto'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  checkoutUrlFor,
  handleLemonSqueezyEvent,
  parseWebhookEvent,
  sendLicenseEmail,
  tierForVariantId,
  verifyWebhookSignature,
  type LsWebhookEvent,
} from '../lib/lemon-squeezy'
import { AdminStore, FilePersistence } from '../lib/admin-store'

const SECRET = 'test-secret'

function makeStore(): { store: AdminStore; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'vectalon-ls-'))
  return { store: new AdminStore(new FilePersistence(dir)), dir }
}

const ENV_KEYS = [
  'LEMONSQUEEZY_STORE_ID',
  'LEMONSQUEEZY_WEBHOOK_SECRET',
  'LEMONSQUEEZY_VARIANT_PRO_RN',
  'LEMONSQUEEZY_VARIANT_ALL_ACCESS_RN',
  'LEMONSQUEEZY_VARIANT_TEAM_RN',
  'LEMONSQUEEZY_VARIANT_PRO_IOS',
  'RESEND_API_KEY',
]

describe('lemon-squeezy webhook security', () => {
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key]
  })

  it('verifies a valid HMAC signature', () => {
    const raw = JSON.stringify({ hello: 'world' })
    const sig = createHmac('sha256', SECRET).update(raw, 'utf8').digest('hex')
    expect(verifyWebhookSignature(raw, sig, SECRET)).toBe(true)
  })

  it('rejects a tampered body or wrong secret', () => {
    const raw = JSON.stringify({ hello: 'world' })
    const sig = createHmac('sha256', SECRET).update(raw, 'utf8').digest('hex')
    expect(verifyWebhookSignature(raw + 'x', sig, SECRET)).toBe(false)
    expect(verifyWebhookSignature(raw, sig, 'other-secret')).toBe(false)
    expect(verifyWebhookSignature(raw, null, SECRET)).toBe(false)
  })

  it('parses a well-formed event and rejects malformed ones', () => {
    const body = JSON.stringify({
      meta: { event_name: 'order_created', event_id: 'evt_1' },
      data: { attributes: { customer_email: 'a@b.dev' } },
    })
    const event = parseWebhookEvent(body)
    expect(event.eventName).toBe('order_created')
    expect(event.eventId).toBe('evt_1')
    expect(() => parseWebhookEvent('{"meta":{}}')).toThrow(/malformed/)
    expect(() => parseWebhookEvent('not json')).toThrow()
  })

  it('maps variant ids to tier+product from env and builds checkout URLs', () => {
    process.env.LEMONSQUEEZY_STORE_ID = 'vectalon'
    process.env.LEMONSQUEEZY_VARIANT_PRO_RN = 'var_pro_rn'
    process.env.LEMONSQUEEZY_VARIANT_ALL_ACCESS_RN = 'var_aa_rn'
    process.env.LEMONSQUEEZY_VARIANT_PRO_IOS = 'var_pro_ios'

    expect(checkoutUrlFor('pro')).toBe('https://vectalon.lemonsqueezy.com/checkout/buy/var_pro_rn')
    expect(checkoutUrlFor('all-access')).toBe('https://vectalon.lemonsqueezy.com/checkout/buy/var_aa_rn')
    expect(checkoutUrlFor('pro', 'ios')).toBe('https://vectalon.lemonsqueezy.com/checkout/buy/var_pro_ios')
    expect(checkoutUrlFor('team')).toBeNull()

    expect(tierForVariantId('var_aa_rn')).toEqual({ tier: 'all-access', product: 'rn' })
    expect(tierForVariantId('var_pro_ios')).toEqual({ tier: 'pro', product: 'ios' })
    expect(tierForVariantId('nope')).toBeNull()
  })

  it('returns null checkout URL when the store is not configured', () => {
    expect(checkoutUrlFor('pro')).toBeNull()
  })
})

describe('lemon-squeezy license lifecycle', () => {
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key]
  })

  function orderEvent(variantId: string, email: string, eventId = 'evt_order_1'): LsWebhookEvent {
    return {
      eventId,
      eventName: 'order_created',
      attributes: {
        customer_email: email,
        first_order_item: { variant_id: variantId, variant_name: 'Pro' },
      },
    }
  }

  it('mints a license on order_created and is idempotent on retry', async () => {
    process.env.LEMONSQUEEZY_VARIANT_PRO_RN = 'var_pro'
    delete process.env.RESEND_API_KEY
    const { store, dir } = makeStore()

    const first = await handleLemonSqueezyEvent(orderEvent('var_pro', 'buyer@x.dev'), store)
    expect(first.handled).toBe(true)
    expect(first.license?.tier).toBe('pro')
    expect(first.license?.source).toBe('lemon-squeezy')
    expect(first.license?.email).toBe('buyer@x.dev')

    const data = await store.getData()
    expect(data.customers.find(c => c.email === 'buyer@x.dev')?.status).toBe('active')
    expect(data.licenses.filter(l => l.email === 'buyer@x.dev')).toHaveLength(1)

    // Lemon Squeezy retries the same event — never double-mint.
    const retry = await handleLemonSqueezyEvent(orderEvent('var_pro', 'buyer@x.dev'), store)
    expect(retry.skipped).toBe('duplicate')
    expect((await store.getData()).licenses.filter(l => l.email === 'buyer@x.dev')).toHaveLength(1)
    rmSync(dir, { recursive: true, force: true })
  })

  it('maps all-access variant to the all-access tier', async () => {
    process.env.LEMONSQUEEZY_VARIANT_ALL_ACCESS_RN = 'var_aa'
    const { store, dir } = makeStore()
    const result = await handleLemonSqueezyEvent(orderEvent('var_aa', 'team@x.dev', 'evt_aa'), store)
    expect(result.license?.tier).toBe('all-access')
    rmSync(dir, { recursive: true, force: true })
  })

  it('instantly revokes licenses on order_refunded and marks the customer churned', async () => {
    process.env.LEMONSQUEEZY_VARIANT_PRO_RN = 'var_pro'
    const { store, dir } = makeStore()
    await handleLemonSqueezyEvent(orderEvent('var_pro', 'buyer@x.dev', 'evt_order'), store)

    const refund = await handleLemonSqueezyEvent(
      { eventId: 'evt_refund', eventName: 'order_refunded', attributes: { customer_email: 'buyer@x.dev' } },
      store
    )
    expect(refund.revoked).toBe(1)

    const data = await store.getData()
    expect(data.licenses.find(l => l.email === 'buyer@x.dev')?.status).toBe('revoked')
    expect(data.customers.find(c => c.email === 'buyer@x.dev')?.status).toBe('churned')
    rmSync(dir, { recursive: true, force: true })
  })

  it('preserves an all-access tier when the subscription payload lacks a variant', async () => {
    process.env.LEMONSQUEEZY_VARIANT_ALL_ACCESS_RN = 'var_aa'
    const { store, dir } = makeStore()
    await handleLemonSqueezyEvent(orderEvent('var_aa', 'sub@x.dev', 'evt_order'), store)
    expect((await store.licensesForEmail('sub@x.dev'))[0].tier).toBe('all-access')

    // subscription_updated carries no variant mapping — the tier must not
    // regress to 'pro'.
    await handleLemonSqueezyEvent(
      {
        eventId: 'evt_sub',
        eventName: 'subscription_updated',
        attributes: { customer_email: 'sub@x.dev', status: 'active', ends_at: '2027-01-01T00:00:00.000Z' },
      },
      store
    )
    const after = (await store.licensesForEmail('sub@x.dev'))[0]
    expect(after.tier).toBe('all-access')
    expect(after.expiresAt).toBe(new Date('2027-01-01T00:00:00.000Z').getTime())
    rmSync(dir, { recursive: true, force: true })
  })

  it('syncs subscription expiry and cancels on subscription_updated', async () => {
    process.env.LEMONSQUEEZY_VARIANT_PRO_RN = 'var_pro'
    const { store, dir } = makeStore()
    await handleLemonSqueezyEvent(orderEvent('var_pro', 'sub@x.dev', 'evt_order'), store)

    const endsAt = '2027-01-01T00:00:00.000Z'
    await handleLemonSqueezyEvent(
      { eventId: 'evt_sub1', eventName: 'subscription_updated', attributes: { customer_email: 'sub@x.dev', status: 'active', ends_at: endsAt } },
      store
    )
    let license = (await store.licensesForEmail('sub@x.dev'))[0]
    expect(license.status).toBe('active')
    expect(license.expiresAt).toBe(new Date(endsAt).getTime())

    await handleLemonSqueezyEvent(
      { eventId: 'evt_sub2', eventName: 'subscription_updated', attributes: { customer_email: 'sub@x.dev', status: 'cancelled' } },
      store
    )
    license = (await store.licensesForEmail('sub@x.dev'))[0]
    expect(license.status).toBe('expired')
    rmSync(dir, { recursive: true, force: true })
  })

  it('acknowledges unknown events without side effects', async () => {
    const { store, dir } = makeStore()
    const result = await handleLemonSqueezyEvent(
      { eventId: 'evt_other', eventName: 'license_key_created', attributes: {} },
      store
    )
    expect(result.handled).toBe(true)
    expect(result.skipped).toMatch(/unhandled/)
    expect((await store.getData()).licenses).toEqual([])
    rmSync(dir, { recursive: true, force: true })
  })

  it('never touches the network when Resend is not configured', async () => {
    delete process.env.RESEND_API_KEY
    const { store, dir } = makeStore()
    const license = await store.issueLicense({ tier: 'pro', email: 'a@b.dev' })
    const result = await sendLicenseEmail({ email: 'a@b.dev', license, tier: 'pro', product: 'rn' })
    expect(result.skipped).toBe(true)
    expect(result.sent).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })
})
