import 'server-only'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { PRODUCT_MANIFEST, type ProductPlanId } from './product-manifest'

type CheckoutEnvironment = Partial<Record<string, string | undefined>>
export interface CheckoutAttribution { correlationId: string; catalogVersion: string; planId: ProductPlanId; productScope: string[]; tier: 'pro' | 'team' | 'enterprise'; seats: number; signature: string }

export function createCheckoutSession(input: { planId: string; seats: number }, environment: CheckoutEnvironment = process.env, id: () => string = randomUUID): { url: string; attribution: CheckoutAttribution } {
  const plan = PRODUCT_MANIFEST.plans.find(candidate => candidate.id === input.planId)
  if (!plan || plan.checkout !== 'checkout' || !['pro', 'team'].includes(plan.engineTier)) throw new Error('checkout-plan-unavailable')
  if (!Number.isSafeInteger(input.seats) || input.seats < plan.seatQuantity.minimum || (plan.seatQuantity.maximum !== null && input.seats > plan.seatQuantity.maximum)) throw new Error('checkout-seat-quantity-invalid')
  const store = environment.LEMONSQUEEZY_STORE_ID?.trim()
  const product = plan.productScope.length === 1 ? plan.productScope[0] : null
  const checkoutId = product ? environment[`LEMONSQUEEZY_CHECKOUT_${plan.engineTier.toUpperCase()}_${product.toUpperCase()}`]?.trim() : null
  if (!store || !checkoutId) throw new Error('checkout-provider-unavailable')
  const unsigned = { correlationId: id(), catalogVersion: PRODUCT_MANIFEST.contractVersion, planId: plan.id as ProductPlanId, productScope: [...plan.productScope], tier: plan.engineTier as 'pro' | 'team', seats: input.seats }
  const signature = sign(unsigned, environment)
  const attribution = Object.freeze({ ...unsigned, productScope: Object.freeze([...unsigned.productScope]) as unknown as string[], signature })
  const url = new URL(`https://${store}.lemonsqueezy.com/checkout/buy/${checkoutId}`)
  const values: Record<string, string> = { correlation_id: attribution.correlationId, catalog_version: attribution.catalogVersion, plan_id: attribution.planId, product_scope: attribution.productScope.join(','), tier: attribution.tier, seats: String(attribution.seats), attribution_signature: attribution.signature }
  for (const [key, value] of Object.entries(values)) url.searchParams.set(`checkout[custom][${key}]`, value)
  return { url: url.toString(), attribution }
}

export function verifyCheckoutAttribution(attribution: CheckoutAttribution, environment: CheckoutEnvironment = process.env): CheckoutAttribution | null {
  let expected: string
  try { expected = sign({ correlationId: attribution.correlationId, catalogVersion: attribution.catalogVersion, planId: attribution.planId, productScope: attribution.productScope, tier: attribution.tier, seats: attribution.seats }, environment) } catch { return null }
  const left = Buffer.from(expected, 'hex'); const right = Buffer.from(attribution.signature ?? '', 'hex')
  return left.length === right.length && timingSafeEqual(left, right) ? attribution : null
}

function sign(input: Omit<CheckoutAttribution, 'signature'>, environment: CheckoutEnvironment): string {
  const secret = environment.VECTALON_CHECKOUT_ATTRIBUTION_SECRET?.trim() || environment.LEMONSQUEEZY_WEBHOOK_SECRET?.trim()
  if (!secret || secret.length < 32) throw new Error('checkout-attribution-secret-unavailable')
  const canonical = [input.correlationId, input.catalogVersion, input.planId, input.productScope.join(','), input.tier, input.seats].join('\n')
  return createHmac('sha256', secret).update(canonical).digest('hex')
}
