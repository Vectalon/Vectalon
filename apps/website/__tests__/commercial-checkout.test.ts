import { createCheckoutSession, verifyCheckoutAttribution } from '../lib/commercial-checkout'

describe('commercial checkout attribution', () => {
  const env = {
    LEMONSQUEEZY_STORE_ID: 'vectalon',
    LEMONSQUEEZY_CHECKOUT_PRO_RN: 'checkout-pro',
    LEMONSQUEEZY_CHECKOUT_TEAM_RN: 'checkout-team',
    VECTALON_CHECKOUT_ATTRIBUTION_SECRET: 'a'.repeat(32),
  }

  it('creates a signed manifest-derived Individual checkout', () => {
    const session = createCheckoutSession({ planId: 'individual', seats: 1 }, env, () => 'correlation-1')
    const url = new URL(session.url)
    expect(url.hostname).toBe('vectalon.lemonsqueezy.com')
    expect(url.searchParams.get('checkout[custom][plan_id]')).toBe('individual')
    expect(verifyCheckoutAttribution(session.attribution, env)).toEqual(session.attribution)
  })

  it('rejects unknown offers, unverified Team quantity, and tampering', () => {
    expect(() => createCheckoutSession({ planId: 'future', seats: 1 }, env)).toThrow('checkout-plan-unavailable')
    expect(() => createCheckoutSession({ planId: 'team', seats: 1 }, env)).toThrow('checkout-seat-quantity-invalid')
    const session = createCheckoutSession({ planId: 'team', seats: 2 }, env, () => 'correlation-2')
    expect(verifyCheckoutAttribution({ ...session.attribution, seats: 20 }, env)).toBeNull()
  })
})
