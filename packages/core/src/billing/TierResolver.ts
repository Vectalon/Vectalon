/**
 * TierResolver — Map tier names to configurations
 * Business Source License 1.1 (BSL-1.1)
 */

import { TIER_CONFIGS } from './types'
import type { Tier, TierConfig, Feature, Product } from './types'

export class TierResolver {
  static getConfig(tier: Tier): TierConfig {
    return TIER_CONFIGS[tier]
  }

  static hierarchy(tier: Tier): number {
    const order: Tier[] = ['free', 'pro', 'team', 'enterprise']
    return order.indexOf(tier)
  }

  static meets(tier: Tier, required: Tier): boolean {
    return this.hierarchy(tier) >= this.hierarchy(required)
  }

  static features(tier: Tier): string[] {
    return this.getConfig(tier).features
  }

  static products(tier: Tier): string[] {
    return this.getConfig(tier).products
  }

  static hasFeature(tier: Tier, feature: string): boolean {
    const config = this.getConfig(tier)
    return config.features.includes('*') || config.features.includes(feature as Feature)
  }

  static hasProduct(tier: Tier, product: string): boolean {
    const config = this.getConfig(tier)
    return config.products.includes(product as Product) || config.products.includes('all')
  }
}
