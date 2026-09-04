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
const EntitlementEvaluator_1 = require("./EntitlementEvaluator");
class FeatureGates {
    static check(required, product, _feature) {
        const now = Date.now();
        const licenseInfo = LicenseStore_1.LicenseStore.read();
        const validation = licenseInfo?.key ? LicenseValidator_1.LicenseValidator.validateClaims(licenseInfo.key, now) : null;
        const evaluated = (0, EntitlementEvaluator_1.evaluateEntitlement)({
            requiredTier: required,
            product,
            now,
            claims: validation?.valid ? validation.claims : null,
        });
        return {
            allowed: evaluated.allowed,
            currentTier: evaluated.currentTier,
            requiredTier: required,
            canTrial: false,
            message: evaluated.message,
            ...(evaluated.expiresAt === undefined
                ? {}
                : { daysRemaining: Math.max(0, Math.ceil((evaluated.expiresAt - now) / (24 * 60 * 60 * 1000))) }),
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
