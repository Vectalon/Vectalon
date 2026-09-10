"use strict";
/**
 * License lifecycle contract for Vectalon Core
 * Business Source License 1.1 (BSL-1.1)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LICENSE_LIFECYCLE_STATES = void 0;
exports.isLicenseLifecycleState = isLicenseLifecycleState;
exports.evaluateLicenseLifecycle = evaluateLicenseLifecycle;
exports.LICENSE_LIFECYCLE_STATES = [
    'pending',
    'active',
    'grace',
    'suspended',
    'expired',
    'canceled',
    'refunded',
    'revoked',
    'superseded',
];
function isLicenseLifecycleState(value) {
    return typeof value === 'string' && exports.LICENSE_LIFECYCLE_STATES.includes(value);
}
/** Lifecycle is issuer-authoritative; only active and bounded grace grant offline access. */
function evaluateLicenseLifecycle(state) {
    if (!isLicenseLifecycleState(state))
        return { ok: false, code: 'invalid_lifecycle' };
    if (state === 'active' || state === 'grace')
        return { ok: true, state };
    return { ok: false, code: 'inactive_lifecycle' };
}
