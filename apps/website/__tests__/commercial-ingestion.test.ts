import { normalizeLemonEvent, projectNormalizedLedger } from '../lib/commercial-ingestion'
import { createCheckoutSession } from '../lib/commercial-checkout'

test('normalizes only the commercial fields and hashes fallback email identity', () => {
  const raw = JSON.stringify({ event: 'fixture' })
  const normalized = normalizeLemonEvent({ eventId: 'evt-1', eventName: 'subscription_payment_failed', resourceId: 'sub-1', attributes: { customer_email: 'Buyer@Example.com', updated_at: '2026-09-15T00:00:00.000Z', status: 'past_due', card_number: 'do-not-store' } }, raw, 'secret')
  expect(normalized.eventType).toBe('payment_failed')
  expect(normalized.customerId).toMatch(/^email:[0-9a-f]{64}$/)
  expect(JSON.stringify(normalized)).not.toContain('Buyer@Example.com')
  expect(JSON.stringify(normalized)).not.toContain('card_number')
  expect(normalized.sourceDigest).toMatch(/^[0-9a-f]{64}$/)
})

test('unknown provider events normalize to reviewable state rather than entitlement', () => {
  const normalized = normalizeLemonEvent({ eventId: 'evt-future', eventName: 'future_event', resourceId: 'sub-1', attributes: { customer_id: 42, created_at: '2026-09-15T00:00:00.000Z' } }, '{}', 'secret')
  expect(normalized.eventType).toBe('unknown')
})

test('full normalized replay is deterministic for duplicate and out-of-order delivery', () => {
  process.env.VECTALON_CHECKOUT_ATTRIBUTION_SECRET = 'b'.repeat(32)
  process.env.LEMONSQUEEZY_STORE_ID = 'vectalon'
  process.env.LEMONSQUEEZY_CHECKOUT_PRO_RN = 'checkout-pro'
  const signed = createCheckoutSession({ planId: 'individual', seats: 1 }, process.env, () => 'correlation-replay').attribution
  const customData = { correlation_id: signed.correlationId, catalog_version: signed.catalogVersion, plan_id: signed.planId, product_scope: signed.productScope.join(','), tier: signed.tier, seats: String(signed.seats), attribution_signature: signed.signature }
  const started = normalizeLemonEvent({ eventId: 'evt-1', eventName: 'subscription_created', resourceId: 'sub-1', customData, attributes: { customer_id: 42, created_at: '2026-09-15T00:00:00.000Z', renews_at: '2026-10-15T00:00:00.000Z', total: 1900 } }, 'one', 'secret')
  const failed = normalizeLemonEvent({ eventId: 'evt-2', eventName: 'subscription_payment_failed', resourceId: 'sub-1', attributes: { customer_id: 42, created_at: '2026-09-16T00:00:00.000Z', renews_at: '2026-10-15T00:00:00.000Z', total: 1900 } }, 'two', 'secret')
  expect(projectNormalizedLedger([failed, started, failed])).toEqual(projectNormalizedLedger([started, failed]))
  expect(projectNormalizedLedger([failed, started]).status).toBe('past-due')
  delete process.env.VECTALON_CHECKOUT_ATTRIBUTION_SECRET
  delete process.env.LEMONSQUEEZY_STORE_ID
  delete process.env.LEMONSQUEEZY_CHECKOUT_PRO_RN
})
