/**
 * FeatureGates — Check if user has access to premium features
 * Business Source License 1.1 (BSL-1.1)
 */

import { LicenseStore } from '../auth/LicenseStore'
import { LicenseValidator } from '../auth/LicenseValidator'
import { TrialTracker } from '../auth/TrialTracker'
import { TierResolver } from './TierResolver'
import type { Tier, Product, Feature, TierCheck } from './types'

export class FeatureGates {
  static check(
    required: Tier,
    product: Product,
    feature: Feature
  ): TierCheck {
    // 1. Check license
    const licenseInfo = LicenseStore.read()
    if (licenseInfo && licenseInfo.key) {
      const validation = LicenseValidator.validate(licenseInfo.key)
      if (validation.valid && validation.license) {
        const license = validation.license
        const tier = license.tier as Tier

        // Check product access
        if (!TierResolver.hasProduct(tier, product)) {
          return {
            allowed: false,
            currentTier: tier,
            requiredTier: required,
            canTrial: false,
            message: `Your ${tier} license does not include ${product}.`,
          }
        }

        // Check tier level
        if (TierResolver.meets(tier, required)) {
          return {
            allowed: true,
            currentTier: tier,
            requiredTier: required,
            canTrial: false,
            daysRemaining: LicenseValidator.daysRemaining(license),
          }
        }

        return {
          allowed: false,
          currentTier: tier,
          requiredTier: required,
          canTrial: false,
          message: `Upgrade from ${tier} to ${required} to use this feature.`,
        }
      }
    }

    // 2. Check trial
    const trial = TrialTracker.getInfo()
    if (trial && TrialTracker.isActive()) {
      const trialTier = trial.tier as Tier
      if (TierResolver.meets(trialTier, required)) {
        return {
          allowed: true,
          currentTier: trialTier,
          requiredTier: required,
          canTrial: false,
          daysRemaining: TrialTracker.daysRemaining(),
        }
      }
    }

    // 3. Free tier — check if feature is free
    if (TierResolver.meets('free', required)) {
      return {
        allowed: true,
        currentTier: 'free',
        requiredTier: required,
        canTrial: false,
      }
    }

    // 4. Not allowed — offer trial
    return {
      allowed: false,
      currentTier: trial ? (trial.tier as Tier) : 'free',
      requiredTier: required,
      canTrial: !TrialTracker.hasTrial(),
      message: `This feature requires ${required} tier.`,
    }
  }
}

/**
 * Convenience function for CLI commands
 */
export function requireTier(
  required: Tier,
  product: Product = 'rn',
  feature?: Feature
): TierCheck {
  return FeatureGates.check(required, product, feature || 'upgrade')
}
