import manifest from '../../../product-manifest.json'

export type ProductPlanId = 'individual' | 'team' | 'enterprise'
export type ProductEngineTier = 'pro' | 'team' | 'enterprise'

export interface ProductPlan {
  id: ProductPlanId
  name: string
  engineTier: ProductEngineTier
  price: string
  cadence: string
  checkout: 'checkout' | 'sales'
  trialEligible: boolean
  features: string[]
}

export const PRODUCT_MANIFEST = manifest
export const PRODUCT_PLANS = manifest.plans as ProductPlan[]
