"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyLicenseToken = verifyLicenseToken;
const LicenseKeySource_1 = require("./LicenseKeySource");
const LicenseSignature_1 = require("./LicenseSignature");
const TrustedClaims_1 = require("./TrustedClaims");
const messages = {
    invalid_token: 'License token is malformed',
    unsupported_algorithm: 'License algorithm is not supported',
    missing_key_id: 'License key ID is missing',
    key_mismatch: 'License key ID does not match the trusted key',
    invalid_verification_time: 'Verification time is invalid',
    invalid_claims: 'License claims are invalid',
    not_yet_valid: 'License is not yet valid',
    expired: 'License has expired',
    invalid_key: 'Trusted verification key is invalid',
    invalid_signature: 'License signature is invalid',
};
function failure(code) {
    return { ok: false, code, message: messages[code] };
}
function verifyLicenseToken(raw, key, now) {
    if (!Number.isSafeInteger(now) || now < 0)
        return failure('invalid_verification_time');
    if (typeof key.id !== 'string' || key.id.length === 0)
        return failure('invalid_key');
    if (key.algorithm !== 'RS256')
        return failure('unsupported_algorithm');
    const signature = (0, LicenseSignature_1.verifyLicenseSignature)(raw, new LicenseKeySource_1.StaticLicenseKeySource([{
            id: key.id,
            algorithm: key.algorithm,
            status: 'active',
            publicKey: key.publicKey,
        }]));
    if (!signature.ok)
        return failure(legacySignatureCode(signature.code));
    const claims = normalizeClaims(signature.payload);
    if (!claims)
        return failure('invalid_claims');
    if (now < claims.issuedAt)
        return failure('not_yet_valid');
    if (now >= claims.expiresAt)
        return failure('expired');
    return { ok: true, claims: (0, TrustedClaims_1.createTrustedClaims)(claims) };
}
function legacySignatureCode(code) {
    switch (code) {
        case 'unknown_key': return 'key_mismatch';
        case 'invalid_token':
        case 'unsupported_algorithm':
        case 'missing_key_id':
        case 'invalid_key':
        case 'invalid_signature': return code;
        default: return 'invalid_key';
    }
}
function normalizeClaims(payload) {
    const { sub, tier, product, iat, exp, capabilities, seats } = payload;
    if (!validSubject(sub) || !nonempty(tier) || !validProduct(product))
        return null;
    if (!validTimestamp(iat) || !validTimestamp(exp) || iat >= exp)
        return null;
    return {
        schemaVersion: 1,
        subject: String(sub),
        tier,
        product,
        issuedAt: iat * 1000,
        expiresAt: exp * 1000,
        ...(typeof sub === 'number' ? { githubUserId: sub } : {}),
        ...(Array.isArray(capabilities) && capabilities.every(nonempty)
            ? { capabilities: [...new Set(capabilities)] }
            : {}),
        ...(Number.isSafeInteger(seats) && seats > 0 ? { seats: seats } : {}),
    };
}
function nonempty(value) {
    return typeof value === 'string' && value.length > 0;
}
function validSubject(value) {
    return nonempty(value) || (Number.isSafeInteger(value) && value >= 0);
}
function validProduct(value) {
    return nonempty(value) || (Array.isArray(value) && value.length > 0 && value.every(nonempty));
}
function validTimestamp(value) {
    return Number.isSafeInteger(value) && value >= 0 && value <= Math.floor(Number.MAX_SAFE_INTEGER / 1000);
}
