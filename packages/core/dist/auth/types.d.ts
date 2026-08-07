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
export interface TrialInfo {
    tier: string;
    githubUserId: number;
    githubUsername: string;
    startedAt: number;
    expiresAt: number;
    deviceFingerprint: string;
}
export interface LicenseValidationResult {
    valid: boolean;
    license?: LicenseInfo;
    error?: string;
}
export interface GitHubUser {
    id: number;
    login: string;
    email?: string;
}
