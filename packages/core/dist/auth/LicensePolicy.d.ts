/**
 * Versioned license-claim policy for Vectalon Core
 * Business Source License 1.1 (BSL-1.1)
 */
import { type LicenseLifecycleState } from './LicenseLifecycle';
export declare const DEFAULT_LICENSE_CLOCK_SKEW_MS: number;
export declare const MAX_OFFLINE_LEASE_MS: number;
export interface LicenseClock {
    now(): number;
}
export interface LicensePolicy {
    issuer: string;
    audience: string;
    /** Defaults to rn for product clients that do not provide a product policy. */
    product?: string;
    allowedTiers: readonly string[];
    maxLifetimeMs?: number;
    offlineLeaseMs?: number;
    clockSkewMs?: number;
}
export type VerifiedLicenseClaims = Readonly<{
    licenseVersion: 2;
    licenseId: string;
    issuer: string;
    audience: readonly string[];
    subject: string;
    product: readonly string[];
    tier: string;
    seats: number;
    state: LicenseLifecycleState;
    issuedAt: number;
    notBefore: number;
    expiresAt: number;
}>;
export type LicensePolicyErrorCode = 'invalid_claims' | 'invalid_policy' | 'wrong_issuer' | 'wrong_audience' | 'wrong_product' | 'invalid_tier' | 'invalid_seats' | 'invalid_lifetime' | 'not_yet_valid' | 'expired' | 'offline_lease_expired' | 'clock_rollback' | 'inactive_lifecycle';
export type LicensePolicyResult = {
    ok: true;
    claims: VerifiedLicenseClaims;
} | {
    ok: false;
    code: LicensePolicyErrorCode;
};
export interface LicensePolicyEvaluationContext {
    now: number;
    policy: LicensePolicy;
    lastTrustedTime?: number;
    lastOnlineAt?: number;
}
/** Converts only the current, versioned license contract into an immutable claim set. */
export declare function parseVersionedLicenseClaims(payload: Record<string, unknown>): VerifiedLicenseClaims | null;
/** Evaluates issuer/product/time/lifecycle policy after a signature has already been verified. */
export declare function evaluateLicensePolicy(claims: VerifiedLicenseClaims, context: LicensePolicyEvaluationContext): LicensePolicyResult;
