"use strict";
/**
 * DevMode — Developer utilities for bypassing tier/license checks
 * Business Source License 1.1 (BSL-1.1)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DevMode = void 0;
class DevMode {
    static isActive() {
        return process.env.VECTALON_DEV_MODE === '1' || process.env.VECTALON_BYPASS_TIER === '1';
    }
    static enable() {
        process.env.VECTALON_DEV_MODE = '1';
    }
    static disable() {
        delete process.env.VECTALON_DEV_MODE;
        delete process.env.VECTALON_BYPASS_TIER;
    }
    static describe() {
        if (this.isActive()) {
            return 'DEV MODE — all features unlocked (VECTALON_DEV_MODE=1)';
        }
        return 'Production mode — tier checks enforced';
    }
}
exports.DevMode = DevMode;
