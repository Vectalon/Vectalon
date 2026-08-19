import manifest from '../../../product-manifest.json'
import type { ProductDefinition } from './core-contracts.generated'

export type ProductPlanId = 'free' | 'individual' | 'team' | 'enterprise'
export type ProductEngineTier = ProductDefinition['plans'][number]['engineTier']

export interface ProductPlan {
  id: ProductPlanId
  name: string
  engineTier: ProductEngineTier
  price: string
  cadence: string
  checkout: 'none' | 'checkout' | 'sales'
  trialEligible: boolean
  features: string[]
}

export const PRODUCT_MANIFEST = manifest as ProductDefinition
export const PRODUCT_PLANS: ProductPlan[] = PRODUCT_MANIFEST.plans.map(plan => ({
  id: plan.id as ProductPlanId,
  name: plan.name,
  engineTier: plan.engineTier,
  price: plan.checkout === 'sales'
    ? 'Custom'
    : `${plan.price.currency === 'USD' ? '$' : `${plan.price.currency} `}${plan.price.minorUnits / 100}`,
  cadence: plan.billingCadence === 'monthly' && plan.seatQuantity.unit === 'developer'
    ? '/developer/month'
    : plan.billingCadence,
  checkout: plan.checkout,
  trialEligible: plan.trialEligibility.eligible,
  features: plan.features,
}))
