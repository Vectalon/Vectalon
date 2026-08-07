/**
 * TierResolver — Map tier names to configurations
 * Business Source License 1.1 (BSL-1.1)
 */
import type { Tier, TierConfig } from './types';
export declare class TierResolver {
    static getConfig(tier: Tier): TierConfig;
    static hierarchy(tier: Tier): number;
    static meets(tier: Tier, required: Tier): boolean;
    static features(tier: Tier): string[];
    static products(tier: Tier): string[];
    static hasFeature(tier: Tier, feature: string): boolean;
    static hasProduct(tier: Tier, product: string): boolean;
}
