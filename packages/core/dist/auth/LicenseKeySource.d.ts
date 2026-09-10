/**
 * Public verification-key selection for Vectalon Core
 * Business Source License 1.1 (BSL-1.1)
 */
import type { KeyObject } from 'crypto';
export declare const LICENSE_SIGNATURE_ALGORITHMS: readonly ["RS256"];
export type LicenseSignatureAlgorithm = (typeof LICENSE_SIGNATURE_ALGORITHMS)[number];
export type LicenseVerificationKeyStatus = 'active' | 'retired' | 'compromised';
export interface LicenseVerificationKey {
    id: string;
    algorithm: LicenseSignatureAlgorithm;
    status: LicenseVerificationKeyStatus;
    publicKey: string | Buffer | KeyObject;
}
/** Injectable source so products can refresh public-key sets without embedding signing material. */
export interface LicenseKeySource {
    get(kid: string): LicenseVerificationKey | undefined;
}
export declare class StaticLicenseKeySource implements LicenseKeySource {
    private readonly keys;
    private readonly duplicateIds;
    constructor(keys: readonly LicenseVerificationKey[]);
    get(kid: string): LicenseVerificationKey | undefined;
}
