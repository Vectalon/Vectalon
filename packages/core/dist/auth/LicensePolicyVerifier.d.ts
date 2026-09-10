/**
 * Composed license verification boundary for Vectalon Core
 * Business Source License 1.1 (BSL-1.1)
 */
import type { LicenseKeySource } from './LicenseKeySource';
import type { LicenseClaimsV2 } from '../contracts/generated';
import { type LicenseClock, type LicensePolicy, type LicensePolicyErrorCode, type VerifiedLicenseClaims } from './LicensePolicy';
import type { LicenseLifecycleState } from './LicenseLifecycle';
import { type LicenseSignatureErrorCode } from './LicenseSignature';
export type LicenseVerificationErrorCode = LicenseSignatureErrorCode | LicensePolicyErrorCode | 'invalid_token_type' | 'invalid_verification_time';
/** Authenticated JWT metadata retained alongside the exact shared signed payload. */
export type LicenseTokenHeaderV2 = Readonly<{
    alg: 'RS256';
    kid: string;
    typ: 'vectalon-license+jwt';
} & Record<string, unknown>>;
export type VerifiedLicenseTokenV2 = Readonly<{
    header: LicenseTokenHeaderV2;
    payload: LicenseClaimsV2;
}>;
export type LicenseVerificationResult = {
    ok: true;
    claims: VerifiedLicenseClaims;
    signed: VerifiedLicenseTokenV2;
} | {
    ok: false;
    code: LicenseVerificationErrorCode;
    /** Present only after a trusted signature and V2 claim schema succeeded. */
    lifecycle?: LicenseLifecycleState;
};
export interface LicenseVerificationContext {
    keys: LicenseKeySource;
    clock: LicenseClock;
    policy: LicensePolicy;
    lastTrustedTime?: number;
    lastOnlineAt?: number;
}
/** Verifies signature, then contract and policy in separate, fail-closed steps. */
export declare function verifyLicenseWithPolicy(raw: string, context: LicenseVerificationContext): LicenseVerificationResult;
