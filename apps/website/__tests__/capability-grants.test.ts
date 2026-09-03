import { AdminStore, type Persistence } from '../lib/admin-store'
import { checkoutUrlFor, handleLemonSqueezyEvent, tierForVariantId } from '../lib/lemon-squeezy'

function store() {
  let state: Awaited<ReturnType<Persistence['load']>> = null
  return new AdminStore({ load: async () => state, save: async data => { state = data } })
}

describe('new purchase qualification does not revoke existing licenses', () => {
  afterEach(() => { for (const key of Object.keys(process.env)) if (key.startsWith('LEMONSQUEEZY_')) delete process.env[key] })

  it('preserves configured RN checkout independent of capability lifecycle', () => {
    process.env.LEMONSQUEEZY_STORE_ID = 'configured'
    process.env.LEMONSQUEEZY_CHECKOUT_PRO_RN = 'checkout-pro'
    process.env.LEMONSQUEEZY_CHECKOUT_ALL_ACCESS_RN = 'checkout-all-access'
    expect(checkoutUrlFor('pro')).toBe('https://configured.lemonsqueezy.com/checkout/buy/checkout-pro')
    expect(checkoutUrlFor('all-access')).toBe('https://configured.lemonsqueezy.com/checkout/buy/checkout-all-access')
  })

  it('keeps entitlement-only RN issuance independent of capability availability', async () => {
    const target = store()
    const license = await target.issueLicense({ tier: 'team', email: 'new@example.test', seats: 7 })
    expect(license).toMatchObject({ tier: 'team', product: 'rn', seats: 7 })
  })

  it('fails explicit manual capability grants closed against the canonical catalog', async () => {
    const target = store()
    await expect(target.issueLicense({ tier: 'team', email: 'new@example.test', seats: 7, capabilityIds: ['rn.enterprise-controls'] })).rejects.toThrow(/unimplemented/)
    await expect(target.issueLicense({ tier: 'team', email: 'new@example.test', seats: 7, capabilityIds: ['not.registered'] })).rejects.toThrow(/unknown-capability/)
    expect((await target.getData()).licenses).toEqual([])
  })

  it('allows an explicitly granted qualified beta capability without changing the tier', async () => {
    const target = store()
    const license = await target.issueLicense({ tier: 'free', email: 'new@example.test', capabilityIds: ['rn.policy.check'] })
    expect(license).toMatchObject({ tier: 'free', capabilities: ['rn.policy.check'] })
  })

  it('rejects unknown products at the new manual grant boundary', async () => {
    const target = store()
    await expect(target.issueLicense({ tier: 'pro', email: 'new@example.test', product: 'python' })).rejects.toThrow(/product/)
    expect((await target.getData()).licenses).toEqual([])
  })

  it('does not default unknown variants to Pro or fabricate Team seats', async () => {
    process.env.LEMONSQUEEZY_VARIANT_TEAM_RN = 'team-variant'
    const target = store()
    for (const variant of ['unknown', 'team-variant']) {
      const result = await handleLemonSqueezyEvent({ eventId: variant, eventName: 'order_created', attributes: { customer_email: 'new@example.test', first_order_item: { variant_id: variant } } }, target)
      expect(result.handled).toBe(false)
      expect(result.skipped).toMatch(/manual.review|unknown|seat/)
    }
    expect((await target.getData()).licenses).toEqual([])
  })

  it('rejects invalid configured variant mappings instead of casting arbitrary tiers/products', () => {
    process.env.LEMONSQUEEZY_VARIANT_UNBUILT_MARS = 'unknown'
    expect(tierForVariantId('unknown')).toBeNull()
  })

  it('continues servicing an existing all-access contract without a new grant', async () => {
    const target = store()
    const data = await target.getData()
    data.licenses.push({ key: 'legacy', tier: 'all-access', product: 'ios', email: 'old@example.test', status: 'active', issuedAt: 1, expiresAt: Date.now() + 10000, seats: 50, source: 'manual' })
    await handleLemonSqueezyEvent({ eventId: 'renew', eventName: 'subscription_updated', attributes: { customer_email: 'old@example.test', status: 'active', renews_at: '2028-01-01T00:00:00Z' } }, target)
    const result = await target.validateLicense('legacy')
    expect(result.valid).toBe(true)
    expect(result.license).toMatchObject({ tier: 'all-access', product: 'ios', seats: 50 })
  })
})
