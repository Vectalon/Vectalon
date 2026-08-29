"use strict";
/**
 * Billing types for Vectalon Core
 * Business Source License 1.1 (BSL-1.1)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIER_CONFIGS = void 0;
exports.TIER_CONFIGS = {
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
    },
    enterprise: {
        name: 'enterprise',
        features: ['*'], // All features
        products: ['rn', 'ios', 'android', 'python'],
        maxSeats: Infinity,
    },
};
