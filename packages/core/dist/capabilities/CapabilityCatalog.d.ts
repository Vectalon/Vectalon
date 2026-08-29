import type { ContractValidationResult } from '../contracts';
import type { CapabilityCatalog } from '../contracts/generated';
export type CapabilityDeclaration = CapabilityCatalog['capabilities'][number];
export type CapabilityLifecycle = CapabilityDeclaration['lifecycle'];
export type CapabilityEvidence = CapabilityDeclaration['evidence'][number];
export type CapabilityDeprecation = NonNullable<CapabilityDeclaration['deprecation']>;
export interface CapabilityAvailabilityRequest {
    capabilityId: string;
    productVersion: string;
    experimentalOptIn?: boolean;
}
export interface CapabilityAvailabilityDecision {
    available: boolean;
    reason: 'available' | 'invalid-catalog' | 'product-version-mismatch' | 'unknown-capability' | 'unsupported-product-version' | 'unimplemented' | 'removed' | 'experimental-opt-in-required' | 'dependency-unavailable';
}
/** Shape and semantic validation. Evidence references are preserved, never fetched or fabricated. */
export declare function validateCapabilityCatalog(value: unknown): ContractValidationResult;
/** Availability only: callers must independently evaluate entitlement and license policy. */
export declare function checkCapabilityAvailability(value: unknown, request: CapabilityAvailabilityRequest): CapabilityAvailabilityDecision;
/**
 * Adjacent promotions require target qualification; backward demotions waive it.
 * A permitted demotion does not make an unqualified catalog grantable.
 * Removed identities remain tombstones and cannot be reused.
 */
export declare function validateCapabilityTransition(previous: unknown, next: unknown, context: {
    productVersion: string;
}): ContractValidationResult;
