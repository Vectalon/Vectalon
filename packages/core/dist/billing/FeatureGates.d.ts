/**
 * FeatureGates — Check if user has access to premium features
 * Business Source License 1.1 (BSL-1.1)
 */
import type { Tier, Product, Feature, TierCheck } from './types';
export declare class FeatureGates {
    static check(required: Tier, product: Product, _feature: Feature): TierCheck;
}
/**
 * Convenience function for CLI commands
 */
export declare function requireTier(required: Tier, product?: Product, feature?: Feature): TierCheck;
