"use strict";
/**
 * TierResolver — Map tier names to configurations
 * Business Source License 1.1 (BSL-1.1)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TierResolver = void 0;
const types_1 = require("./types");
class TierResolver {
    static isTier(value) {
        return Object.prototype.hasOwnProperty.call(types_1.TIER_CONFIGS, value);
    }
    static getConfig(tier) {
        return types_1.TIER_CONFIGS[tier];
    }
    static hierarchy(tier) {
        const order = ['free', 'pro', 'team', 'enterprise'];
        return order.indexOf(tier);
    }
    static meets(tier, required) {
        return this.hierarchy(tier) >= this.hierarchy(required);
    }
    static features(tier) {
        return this.getConfig(tier).features;
    }
    static products(tier) {
        return this.getConfig(tier).products;
    }
    static hasFeature(tier, feature) {
        const config = this.getConfig(tier);
        return config.features.includes('*') || config.features.includes(feature);
    }
    static hasProduct(tier, product) {
        const config = this.getConfig(tier);
        return config.products.includes(product) || config.products.includes('all');
    }
}
exports.TierResolver = TierResolver;
