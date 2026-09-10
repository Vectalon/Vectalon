/**
 * License signature verification for Vectalon Core
 * Business Source License 1.1 (BSL-1.1)
 */
import type { LicenseKeySource } from './LicenseKeySource';
export type LicenseSignatureErrorCode = 'invalid_token' | 'unsupported_algorithm' | 'missing_key_id' | 'unknown_key' | 'key_id_mismatch' | 'retired_key' | 'compromised_key' | 'key_source_unavailable' | 'invalid_key' | 'invalid_signature';
export type LicenseSignatureResult = {
    ok: true;
    header: Record<string, unknown>;
    payload: Record<string, unknown>;
} | {
    ok: false;
    code: LicenseSignatureErrorCode;
};
/** Parses and verifies a compact JWT without interpreting its license claims. */
export declare function verifyLicenseSignature(raw: string, keys: LicenseKeySource): LicenseSignatureResult;
