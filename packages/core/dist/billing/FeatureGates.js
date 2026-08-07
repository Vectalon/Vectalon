"use strict";
/**
 * FeatureGates — Check if user has access to premium features
 * Business Source License 1.1 (BSL-1.1)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeatureGates = void 0;
exports.requireTier = requireTier;
const LicenseStore_1 = require("../auth/LicenseStore");
const LicenseValidator_1 = require("../auth/LicenseValidator");
const TrialTracker_1 = require("../auth/TrialTracker");
const TierResolver_1 = require("./TierResolver");
class FeatureGates {
    static check(required, product, _feature) {
        // 0. Dev mode — bypass all tier checks
        if (process.env.VECTALON_DEV_MODE === '1' || process.env.VECTALON_BYPASS_TIER === '1') {
            return {
                allowed: true,
                currentTier: 'enterprise',
                requiredTier: required,
                canTrial: false,
                message: 'DEV MODE — all features unlocked',
            };
        }
        // 1. Check license
        const licenseInfo = LicenseStore_1.LicenseStore.read();
        if (licenseInfo && licenseInfo.key) {
            const validation = LicenseValidator_1.LicenseValidator.validate(licenseInfo.key);
            if (validation.valid && validation.license) {
                const license = validation.license;
                const tier = license.tier;
                // Check product access
                if (!TierResolver_1.TierResolver.hasProduct(tier, product)) {
                    return {
                        allowed: false,
                        currentTier: tier,
                        requiredTier: required,
                        canTrial: false,
                        message: `Your ${tier} license does not include ${product}.`,
                    };
                }
                // Check tier level
                if (TierResolver_1.TierResolver.meets(tier, required)) {
                    return {
                        allowed: true,
                        currentTier: tier,
                        requiredTier: required,
                        canTrial: false,
                        daysRemaining: LicenseValidator_1.LicenseValidator.daysRemaining(license),
                    };
                }
                return {
                    allowed: false,
                    currentTier: tier,
                    requiredTier: required,
                    canTrial: false,
                    message: `Upgrade from ${tier} to ${required} to use this feature.`,
                };
            }
        }
        // 2. Check trial
        const trial = TrialTracker_1.TrialTracker.getInfo();
        if (trial && TrialTracker_1.TrialTracker.isActive()) {
            const trialTier = trial.tier;
            if (TierResolver_1.TierResolver.meets(trialTier, required)) {
                return {
                    allowed: true,
                    currentTier: trialTier,
                    requiredTier: required,
                    canTrial: false,
                    daysRemaining: TrialTracker_1.TrialTracker.daysRemaining(),
                };
            }
        }
        // 3. Free tier — check if feature is free
        if (TierResolver_1.TierResolver.meets('free', required)) {
            return {
                allowed: true,
                currentTier: 'free',
                requiredTier: required,
                canTrial: false,
            };
        }
        // 4. Not allowed — offer trial
        return {
            allowed: false,
            currentTier: trial ? trial.tier : 'free',
            requiredTier: required,
            canTrial: !TrialTracker_1.TrialTracker.hasTrial(),
            message: `This feature requires ${required} tier.`,
        };
    }
}
exports.FeatureGates = FeatureGates;
/**
 * Convenience function for CLI commands
 */
function requireTier(required, product = 'rn', feature) {
    return FeatureGates.check(required, product, feature || 'upgrade');
}
