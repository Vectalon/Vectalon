"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyLicenseToken = verifyLicenseToken;
const crypto_1 = require("crypto");
const LicenseParser_1 = require("./LicenseParser");
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
    const parsed = (0, LicenseParser_1.parseLicenseToken)(raw);
    if (!parsed.ok)
        return failure('invalid_token');
    const { header, payload, signature, signingInput } = parsed.token;
    if (header.alg !== 'RS256' || key.algorithm !== 'RS256') {
        return failure('unsupported_algorithm');
    }
    if (typeof header.kid !== 'string' || header.kid.length === 0)
        return failure('missing_key_id');
    if (typeof key.id !== 'string' || key.id.length === 0)
        return failure('invalid_key');
    if (header.kid !== key.id)
        return failure('key_mismatch');
    let publicKey;
    try {
        if (key.publicKey instanceof crypto_1.KeyObject && key.publicKey.type !== 'public') {
            return failure('invalid_key');
        }
        publicKey = key.publicKey instanceof crypto_1.KeyObject ? key.publicKey : (0, crypto_1.createPublicKey)(key.publicKey);
        if (publicKey.asymmetricKeyType !== 'rsa' ||
            (publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) {
            return failure('invalid_key');
        }
    }
    catch {
        return failure('invalid_key');
    }
    try {
        if (!(0, crypto_1.verify)('RSA-SHA256', Buffer.from(signingInput, 'ascii'), publicKey, signature)) {
            return failure('invalid_signature');
        }
    }
    catch {
        return failure('invalid_signature');
    }
    const claims = normalizeClaims(payload);
    if (!claims)
        return failure('invalid_claims');
    if (now < claims.issuedAt)
        return failure('not_yet_valid');
    if (now >= claims.expiresAt)
        return failure('expired');
    return { ok: true, claims: (0, TrustedClaims_1.createTrustedClaims)(claims) };
}
function normalizeClaims(payload) {
    const { sub, tier, product, iat, exp } = payload;
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
