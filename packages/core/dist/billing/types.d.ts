/**
 * Billing types for Vectalon Core
 * Business Source License 1.1 (BSL-1.1)
 */
export type Tier = 'free' | 'pro' | 'team' | 'enterprise';
export type Product = 'rn' | 'ios' | 'android' | 'python' | 'all';
export type Feature = 'init' | 'serve' | 'doctor' | 'basic-feature' | 'upgrade' | 'ci' | 'bundle' | 'advanced-guardrails' | 'sync' | 'custom-model' | 'priority-inference' | 'team-brain' | '*';
export interface TierCheck {
    allowed: boolean;
    currentTier: Tier;
    requiredTier: Tier;
    canTrial: boolean;
    daysRemaining?: number;
    message?: string;
}
export interface TierConfig {
    name: Tier;
    features: Feature[];
    products: Product[];
    maxSeats?: number;
}
export declare const TIER_CONFIGS: Record<Tier, TierConfig>;
