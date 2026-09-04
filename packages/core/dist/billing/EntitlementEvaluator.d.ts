import { type TrustedClaims } from '../auth/TrustedClaims';
import type { Product, Tier } from './types';
export declare const ENTITLEMENT_POLICY_VERSION = "2026-09-03.1";
export type EntitlementReasonCode = 'allowed_free' | 'allowed_license' | 'denied_missing_entitlement' | 'denied_untrusted_claims' | 'denied_invalid_clock' | 'denied_clock_rollback' | 'denied_not_yet_valid' | 'denied_expired' | 'denied_revoked' | 'denied_wrong_product' | 'denied_wrong_tier' | 'denied_missing_capability' | 'denied_seat_limit' | 'degraded_revocation_stale';
export interface EntitlementRequest {
    requiredTier: Tier;
    product: Product;
    capabilityId?: string;
    requestedSeats?: number;
    now: number;
    /** Last time obtained from a trusted monotonic or server-backed source. */
    lastTrustedTime?: number;
    claims?: TrustedClaims | null;
    revocation?: 'current' | 'stale' | 'revoked';
}
export interface EntitlementDecision {
    status: 'allow' | 'deny' | 'degraded';
    allowed: boolean;
    reasonCode: EntitlementReasonCode;
    policyVersion: typeof ENTITLEMENT_POLICY_VERSION;
    currentTier: Tier;
    requiredTier: Tier;
    message: string;
    expiresAt?: number;
}
/** Pure, fail-closed policy evaluation. It accepts only verifier-created claims. */
export declare function evaluateEntitlement(request: EntitlementRequest): EntitlementDecision;
