/**
 * LicenseValidator — Offline JWT validation with embedded public key
 * Business Source License 1.1 (BSL-1.1)
 */
import type { LicenseInfo, LicenseValidationResult } from './types';
import type { TrustedClaims } from './TrustedClaims';
export declare class LicenseValidator {
    private static keyState;
    /**
     * Lazily load and parse the public key. Never throws at import time — if the
     * key is missing or malformed, validation fails closed instead.
     */
    private static loadKey;
    /**
     * Clear the cached key state so tests and package upgrades can reload the
     * bundled trust root.
     */
    static resetKey(): void;
    static validateClaims(token: string, now?: number): {
        valid: true;
        claims: TrustedClaims;
    } | {
        valid: false;
        error: string;
    };
    static validate(token: string): LicenseValidationResult;
    static isExpired(license: LicenseInfo): boolean;
    static daysRemaining(license: LicenseInfo): number;
}
