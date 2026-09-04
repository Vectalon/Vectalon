/**
 * Auth types for Vectalon Core
 * Business Source License 1.1 (BSL-1.1)
 */
export interface LicenseInfo {
    key: string;
    tier: string;
    product: string | string[];
    issuedAt: number;
    expiresAt: number;
    githubUserId?: number;
    githubUsername?: string;
}
export interface LicenseValidationResult {
    valid: boolean;
    license?: LicenseInfo;
    error?: string;
}
