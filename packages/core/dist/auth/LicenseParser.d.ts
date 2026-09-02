export type LicenseParseErrorCode = 'invalid_format' | 'invalid_base64url' | 'invalid_json' | 'invalid_header' | 'invalid_payload' | 'duplicate_key' | 'oversized';
export interface ParsedLicenseToken {
    header: Record<string, unknown>;
    payload: Record<string, unknown>;
    signature: Buffer;
    signingInput: string;
}
export type LicenseParseResult = {
    ok: true;
    token: ParsedLicenseToken;
} | {
    ok: false;
    code: LicenseParseErrorCode;
};
export declare function parseLicenseToken(raw: string): LicenseParseResult;
