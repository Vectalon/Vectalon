import type { LicenseInfo } from './types';
declare const TRUSTED_CLAIMS_TYPE: unique symbol;
export type TrustedClaims = Readonly<{
    readonly [TRUSTED_CLAIMS_TYPE]: true;
    schemaVersion: 1;
    subject: string;
    tier: string;
    product: string | readonly string[];
    issuedAt: number;
    expiresAt: number;
    githubUserId?: number;
    capabilities?: readonly string[];
    seats?: number;
}>;
type TrustedClaimsInput = Omit<TrustedClaims, typeof TRUSTED_CLAIMS_TYPE>;
/** @internal Only verification code may call this constructor. */
export declare function createTrustedClaims(input: TrustedClaimsInput): TrustedClaims;
export declare function isTrustedClaims(value: unknown): value is TrustedClaims;
export declare function trustedClaimsToLicenseInfo(token: string, claims: TrustedClaims): LicenseInfo;
export {};
