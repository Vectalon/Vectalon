"use strict";
/**
 * Public verification-key selection for Vectalon Core
 * Business Source License 1.1 (BSL-1.1)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StaticLicenseKeySource = exports.LICENSE_SIGNATURE_ALGORITHMS = void 0;
exports.LICENSE_SIGNATURE_ALGORITHMS = ['RS256'];
class StaticLicenseKeySource {
    keys = new Map();
    duplicateIds = new Set();
    constructor(keys) {
        for (const key of keys) {
            if (this.keys.has(key.id))
                this.duplicateIds.add(key.id);
            else
                this.keys.set(key.id, key);
        }
    }
    get(kid) {
        return this.duplicateIds.has(kid) ? undefined : this.keys.get(kid);
    }
}
exports.StaticLicenseKeySource = StaticLicenseKeySource;
