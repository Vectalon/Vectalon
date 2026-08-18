/**
 * LicenseValidator — Offline JWT validation with embedded public key
 * Business Source License 1.1 (BSL-1.1)
 */
import type { LicenseInfo, LicenseValidationResult } from './types';
export declare class LicenseValidator {
    private static keyState;
    /**
     * Lazily load and parse the public key. Never throws at import time — if the
     * key is missing or malformed, validation fails closed instead.
     */
    private static loadKey;
    /**
     * Clear the cached key state so the next validate() re-resolves the key —
     * e.g. after setting VECTALON_PUBLIC_KEY or rotating the key on disk.
     */
    static resetKey(): void;
    static validate(token: string): LicenseValidationResult;
    static isExpired(license: LicenseInfo): boolean;
    static daysRemaining(license: LicenseInfo): number;
}
