import { KeyObject } from 'crypto';
declare const VERIFIED_TRIAL_TYPE: unique symbol;
export type VerifiedTrialCredential = Readonly<{
    readonly [VERIFIED_TRIAL_TYPE]: true;
    trialId: string;
    subjectId: string;
    audience: string;
    productScope: readonly string[];
    tier: 'pro' | 'team';
    issuedAt: number;
    notBefore: number;
    expiresAt: number;
    policyVersion: string;
}>;
export interface TrialVerificationKey {
    id: string;
    algorithm: 'RS256';
    publicKey: string | Buffer | KeyObject;
}
export type TrialVerificationErrorCode = 'invalid_token' | 'unsupported_algorithm' | 'missing_key_id' | 'key_mismatch' | 'invalid_key' | 'invalid_signature' | 'invalid_claims' | 'invalid_verification_time' | 'not_yet_valid' | 'expired' | 'wrong_audience' | 'wrong_product';
export type TrialVerificationResult = {
    ok: true;
    credential: VerifiedTrialCredential;
} | {
    ok: false;
    code: TrialVerificationErrorCode;
};
export interface TrialVerificationContext {
    now: number;
    audience: string;
    product: string;
}
export declare function isVerifiedTrialCredential(value: unknown): value is VerifiedTrialCredential;
export declare function verifyTrialToken(raw: string, key: TrialVerificationKey, context: TrialVerificationContext): TrialVerificationResult;
export {};
