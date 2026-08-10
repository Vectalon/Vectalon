/**
 * LicenseValidator — Offline JWT validation with embedded public key
 * Business Source License 1.1 (BSL-1.1)
 */
import type { LicenseInfo, LicenseValidationResult } from './types';
export declare class LicenseValidator {
    private static publicKey;
    static validate(token: string): LicenseValidationResult;
    static isExpired(license: LicenseInfo): boolean;
    static daysRemaining(license: LicenseInfo): number;
}
