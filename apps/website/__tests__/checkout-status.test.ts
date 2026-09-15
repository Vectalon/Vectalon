import { checkoutStatusFromProjection } from '../lib/checkout-status'

test('checkout status never treats redirect or event receipt alone as payment proof', () => {
  expect(checkoutStatusFromProjection(null)).toEqual({ status: 'pending', retryAfterSeconds: 5 })
  expect(checkoutStatusFromProjection({ event_type: 'subscription_started' })).toEqual({ status: 'processing', retryAfterSeconds: 5 })
  expect(checkoutStatusFromProjection({ event_type: 'subscription_started', state: 'active', reconciled_at: null })).toEqual({ status: 'processing', retryAfterSeconds: 5 })
  expect(checkoutStatusFromProjection({ event_type: 'subscription_started', state: 'active', reconciled_at: '2026-09-15T00:00:00Z' })).toEqual({ status: 'active' })
  expect(checkoutStatusFromProjection({ event_type: 'unknown', state: 'active', reconciled_at: '2026-09-15T00:00:00Z' })).toEqual({ status: 'review' })
})
