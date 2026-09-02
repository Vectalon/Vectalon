import { KeyObject } from 'crypto';
import { type TrustedClaims } from './TrustedClaims';
export type VerificationErrorCode = 'invalid_token' | 'unsupported_algorithm' | 'missing_key_id' | 'key_mismatch' | 'invalid_verification_time' | 'invalid_claims' | 'not_yet_valid' | 'expired' | 'invalid_key' | 'invalid_signature';
export interface TrustedVerificationKey {
    id: string;
    algorithm: 'RS256';
    publicKey: string | Buffer | KeyObject;
}
export type VerificationResult = {
    ok: true;
    claims: TrustedClaims;
} | {
    ok: false;
    code: VerificationErrorCode;
    message: string;
};
export declare function verifyLicenseToken(raw: string, key: TrustedVerificationKey, now: number): VerificationResult;
