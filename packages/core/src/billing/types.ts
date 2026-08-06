/**
 * Billing types for Vectalon Core
 * Business Source License 1.1 (BSL-1.1)
 */

export type Tier = 'free' | 'pro' | 'team' | 'enterprise'
export type Product = 'rn' | 'ios' | 'android' | 'python' | 'all'
export type Feature = 'init' | 'serve' | 'doctor' | 'basic-feature' | 'upgrade' | 'ci' | 'bundle' | 'advanced-guardrails' | 'sync' | 'custom-model' | 'priority-inference' | 'team-brain' | '*'

export interface TierCheck {
  allowed: boolean
  currentTier: Tier
  requiredTier: Tier
  canTrial: boolean
  daysRemaining?: number
  message?: string
}

export interface TierConfig {
  name: Tier
  features: Feature[]
  products: Product[]
  maxSeats?: number
}

export const TIER_CONFIGS: Record<Tier, TierConfig> = {
  free: {
    name: 'free',
    features: ['init', 'serve', 'doctor', 'basic-feature'],
    products: ['rn'],
  },
  pro: {
    name: 'pro',
    features: ['upgrade', 'ci', 'bundle', 'advanced-guardrails'],
    products: ['rn', 'ios', 'android', 'python'],
  },
  team: {
    name: 'team',
    features: ['sync', 'custom-model', 'priority-inference', 'team-brain'],
    products: ['rn', 'ios', 'android', 'python'],
    maxSeats: 50,
  },
  enterprise: {
    name: 'enterprise',
    features: ['*'], // All features
    products: ['rn', 'ios', 'android', 'python'],
    maxSeats: Infinity,
  },
}
