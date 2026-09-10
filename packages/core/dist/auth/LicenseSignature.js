"use strict";
/**
 * License signature verification for Vectalon Core
 * Business Source License 1.1 (BSL-1.1)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyLicenseSignature = verifyLicenseSignature;
const crypto_1 = require("crypto");
const LicenseParser_1 = require("./LicenseParser");
/** Parses and verifies a compact JWT without interpreting its license claims. */
function verifyLicenseSignature(raw, keys) {
    const parsed = (0, LicenseParser_1.parseLicenseToken)(raw);
    if (!parsed.ok)
        return { ok: false, code: 'invalid_token' };
    const { header, payload, signature, signingInput } = parsed.token;
    if (header.alg !== 'RS256')
        return { ok: false, code: 'unsupported_algorithm' };
    if (!nonempty(header.kid))
        return { ok: false, code: 'missing_key_id' };
    let key;
    try {
        const returned = keys.get(header.kid);
        if (returned === undefined)
            return { ok: false, code: 'unknown_key' };
        key = snapshotVerificationKey(returned);
    }
    catch {
        return { ok: false, code: 'key_source_unavailable' };
    }
    if (!key)
        return { ok: false, code: 'invalid_key' };
    if (key.id !== header.kid)
        return { ok: false, code: 'key_id_mismatch' };
    if (key.status === 'retired')
        return { ok: false, code: 'retired_key' };
    if (key.status === 'compromised')
        return { ok: false, code: 'compromised_key' };
    if (key.status !== 'active' || key.algorithm !== 'RS256')
        return { ok: false, code: 'unsupported_algorithm' };
    let publicKey;
    try {
        if (isPrivateKey(key.publicKey))
            return { ok: false, code: 'invalid_key' };
        publicKey = publicKeyFrom(key.publicKey);
        if (publicKey.asymmetricKeyType !== 'rsa' || (publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) {
            return { ok: false, code: 'invalid_key' };
        }
    }
    catch {
        return { ok: false, code: 'invalid_key' };
    }
    try {
        if (!(0, crypto_1.verify)('RSA-SHA256', Buffer.from(signingInput, 'ascii'), publicKey, signature)) {
            return { ok: false, code: 'invalid_signature' };
        }
    }
    catch {
        return { ok: false, code: 'invalid_signature' };
    }
    return { ok: true, header, payload };
}
/** Snapshot adapter-owned fields once, so throwing/mutable accessors cannot escape this boundary. */
function snapshotVerificationKey(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return null;
    const record = value;
    const id = record.id;
    const algorithm = record.algorithm;
    const status = record.status;
    const suppliedPublicKey = record.publicKey;
    if (typeof id !== 'string' || typeof suppliedPublicKey !== 'string' && !Buffer.isBuffer(suppliedPublicKey) && !(suppliedPublicKey instanceof crypto_1.KeyObject))
        return null;
    const publicKey = Buffer.isBuffer(suppliedPublicKey) ? Buffer.from(suppliedPublicKey) : suppliedPublicKey;
    return Object.freeze({ id, algorithm, status, publicKey });
}
function publicKeyFrom(value) {
    if (value instanceof crypto_1.KeyObject)
        return value;
    if (Buffer.isBuffer(value))
        return (0, crypto_1.createPublicKey)({ key: value, format: 'der', type: 'spki' });
    return (0, crypto_1.createPublicKey)(value);
}
function nonempty(value) {
    return typeof value === 'string' && value.length > 0;
}
/** Reject private encodings instead of allowing Node to derive a public component. */
function isPrivateKey(value) {
    if (value instanceof crypto_1.KeyObject)
        return value.type !== 'public';
    try {
        if ((0, crypto_1.createPrivateKey)(value).type === 'private')
            return true;
    }
    catch {
        // DER needs an explicit container type; encrypted PEM is detected below.
    }
    if (typeof value === 'string' && /^-----BEGIN [^-]*PRIVATE KEY-----/m.test(value))
        return true;
    for (const type of ['pkcs8', 'pkcs1']) {
        try {
            if ((0, crypto_1.createPrivateKey)({ key: value, format: 'der', type }).type === 'private')
                return true;
        }
        catch {
            // A failed private-key import may still be a valid public key.
        }
    }
    return false;
}
