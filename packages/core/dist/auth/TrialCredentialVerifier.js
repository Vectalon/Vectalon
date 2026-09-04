"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isVerifiedTrialCredential = isVerifiedTrialCredential;
exports.verifyTrialToken = verifyTrialToken;
const crypto_1 = require("crypto");
const LicenseParser_1 = require("./LicenseParser");
const verifiedCredentials = new WeakSet();
function isVerifiedTrialCredential(value) {
    return typeof value === 'object' && value !== null && verifiedCredentials.has(value);
}
function verifyTrialToken(raw, key, context) {
    if (!validTime(context.now))
        return { ok: false, code: 'invalid_verification_time' };
    const parsed = (0, LicenseParser_1.parseLicenseToken)(raw);
    if (!parsed.ok)
        return { ok: false, code: 'invalid_token' };
    const { header, payload, signature, signingInput } = parsed.token;
    if (header.alg !== 'RS256' || header.typ !== 'vectalon-trial+jwt' || key.algorithm !== 'RS256')
        return { ok: false, code: 'unsupported_algorithm' };
    if (!nonempty(header.kid))
        return { ok: false, code: 'missing_key_id' };
    if (!nonempty(key.id))
        return { ok: false, code: 'invalid_key' };
    if (header.kid !== key.id)
        return { ok: false, code: 'key_mismatch' };
    let publicKey;
    try {
        if (key.publicKey instanceof crypto_1.KeyObject && key.publicKey.type !== 'public')
            return { ok: false, code: 'invalid_key' };
        publicKey = key.publicKey instanceof crypto_1.KeyObject ? key.publicKey : (0, crypto_1.createPublicKey)(key.publicKey);
        if (publicKey.asymmetricKeyType !== 'rsa' || (publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048)
            return { ok: false, code: 'invalid_key' };
    }
    catch {
        return { ok: false, code: 'invalid_key' };
    }
    try {
        if (!(0, crypto_1.verify)('RSA-SHA256', Buffer.from(signingInput, 'ascii'), publicKey, signature))
            return { ok: false, code: 'invalid_signature' };
    }
    catch {
        return { ok: false, code: 'invalid_signature' };
    }
    const credential = normalize(payload);
    if (!credential)
        return { ok: false, code: 'invalid_claims' };
    if (credential.audience !== context.audience)
        return { ok: false, code: 'wrong_audience' };
    if (!credential.productScope.includes(context.product))
        return { ok: false, code: 'wrong_product' };
    if (context.now < credential.notBefore)
        return { ok: false, code: 'not_yet_valid' };
    if (context.now >= credential.expiresAt)
        return { ok: false, code: 'expired' };
    verifiedCredentials.add(credential);
    return { ok: true, credential };
}
function normalize(payload) {
    const { sub, jti, aud, product, tier, iat, nbf, exp, policy_version: policyVersion } = payload;
    if (!nonempty(sub) || !nonempty(jti) || !nonempty(aud) || !nonempty(policyVersion))
        return null;
    if (!Array.isArray(product) || product.length < 1 || !product.every(nonempty))
        return null;
    if (tier !== 'pro' && tier !== 'team')
        return null;
    if (!validSeconds(iat) || !validSeconds(nbf) || !validSeconds(exp) || iat > nbf || nbf >= exp)
        return null;
    return Object.freeze({ trialId: jti, subjectId: sub, audience: aud, productScope: Object.freeze([...new Set(product)]), tier, issuedAt: iat * 1000, notBefore: nbf * 1000, expiresAt: exp * 1000, policyVersion });
}
function nonempty(value) { return typeof value === 'string' && value.length > 0; }
function validSeconds(value) { return Number.isSafeInteger(value) && value >= 0 && value <= Math.floor(Number.MAX_SAFE_INTEGER / 1000); }
function validTime(value) { return Number.isSafeInteger(value) && value >= 0; }
