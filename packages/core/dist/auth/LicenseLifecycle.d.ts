/**
 * License lifecycle contract for Vectalon Core
 * Business Source License 1.1 (BSL-1.1)
 */
export declare const LICENSE_LIFECYCLE_STATES: readonly ["pending", "active", "grace", "suspended", "expired", "canceled", "refunded", "revoked", "superseded"];
export type LicenseLifecycleState = (typeof LICENSE_LIFECYCLE_STATES)[number];
export type LicenseLifecycleResult = {
    ok: true;
    state: 'active' | 'grace';
} | {
    ok: false;
    code: 'invalid_lifecycle' | 'inactive_lifecycle';
};
export declare function isLicenseLifecycleState(value: unknown): value is LicenseLifecycleState;
/** Lifecycle is issuer-authoritative; only active and bounded grace grant offline access. */
export declare function evaluateLicenseLifecycle(state: unknown): LicenseLifecycleResult;
