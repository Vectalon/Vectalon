"use strict";
/**
 * Versioned license-claim policy for Vectalon Core
 * Business Source License 1.1 (BSL-1.1)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_OFFLINE_LEASE_MS = exports.DEFAULT_LICENSE_CLOCK_SKEW_MS = void 0;
exports.parseVersionedLicenseClaims = parseVersionedLicenseClaims;
exports.evaluateLicensePolicy = evaluateLicensePolicy;
const LicenseLifecycle_1 = require("./LicenseLifecycle");
exports.DEFAULT_LICENSE_CLOCK_SKEW_MS = 5 * 60 * 1_000;
exports.MAX_OFFLINE_LEASE_MS = 35 * 24 * 60 * 60 * 1_000;
/** Converts only the current, versioned license contract into an immutable claim set. */
function parseVersionedLicenseClaims(payload) {
    const { license_version: version, jti, iss, aud, sub, product, tier, seats, state, iat, nbf, exp } = payload;
    if (version !== 2 || !nonempty(jti) || !nonempty(iss) || !nonempty(sub) || !nonempty(tier))
        return null;
    if (!validStringList(product) || !validInteger(seats) || !(0, LicenseLifecycle_1.isLicenseLifecycleState)(state))
        return null;
    const audience = stringList(aud);
    if (!audience || !validSeconds(iat) || !validSeconds(nbf) || !validSeconds(exp) || iat > nbf || nbf >= exp)
        return null;
    return Object.freeze({
        licenseVersion: 2,
        licenseId: jti,
        issuer: iss,
        audience: Object.freeze(audience),
        subject: sub,
        product: Object.freeze([...product]),
        tier,
        seats,
        state,
        issuedAt: iat * 1_000,
        notBefore: nbf * 1_000,
        expiresAt: exp * 1_000,
    });
}
/** Evaluates issuer/product/time/lifecycle policy after a signature has already been verified. */
function evaluateLicensePolicy(claims, context) {
    const { now, policy } = context;
    if (!validMilliseconds(now) || !validPolicy(policy))
        return { ok: false, code: 'invalid_policy' };
    const product = policy.product ?? 'rn';
    const maxLifetimeMs = policy.maxLifetimeMs ?? exports.MAX_OFFLINE_LEASE_MS;
    const offlineLeaseMs = policy.offlineLeaseMs ?? exports.MAX_OFFLINE_LEASE_MS;
    const clockSkewMs = policy.clockSkewMs ?? exports.DEFAULT_LICENSE_CLOCK_SKEW_MS;
    if (claims.issuer !== policy.issuer)
        return { ok: false, code: 'wrong_issuer' };
    if (!claims.audience.includes(policy.audience))
        return { ok: false, code: 'wrong_audience' };
    if (!claims.product.includes(product))
        return { ok: false, code: 'wrong_product' };
    if (!policy.allowedTiers.includes(claims.tier))
        return { ok: false, code: 'invalid_tier' };
    if (!validSeats(claims.seats))
        return { ok: false, code: 'invalid_seats' };
    if (claims.expiresAt - claims.issuedAt > maxLifetimeMs)
        return { ok: false, code: 'invalid_lifetime' };
    if (context.lastTrustedTime !== undefined) {
        if (!validMilliseconds(context.lastTrustedTime) || now + clockSkewMs < context.lastTrustedTime) {
            return { ok: false, code: 'clock_rollback' };
        }
    }
    if (context.lastOnlineAt !== undefined) {
        if (!validMilliseconds(context.lastOnlineAt) || now < context.lastOnlineAt || now - context.lastOnlineAt > offlineLeaseMs) {
            return { ok: false, code: 'offline_lease_expired' };
        }
    }
    if (now + clockSkewMs < claims.notBefore)
        return { ok: false, code: 'not_yet_valid' };
    if (now - clockSkewMs >= claims.expiresAt)
        return { ok: false, code: 'expired' };
    const lifecycle = (0, LicenseLifecycle_1.evaluateLicenseLifecycle)(claims.state);
    if (!lifecycle.ok)
        return { ok: false, code: 'inactive_lifecycle' };
    return { ok: true, claims };
}
function validPolicy(policy) {
    const values = [policy.issuer, policy.audience, policy.product ?? 'rn'];
    if (!values.every(nonempty) || !Array.isArray(policy.allowedTiers) || policy.allowedTiers.length === 0 || !policy.allowedTiers.every(nonempty))
        return false;
    const maxLifetimeMs = policy.maxLifetimeMs ?? exports.MAX_OFFLINE_LEASE_MS;
    const offlineLeaseMs = policy.offlineLeaseMs ?? exports.MAX_OFFLINE_LEASE_MS;
    const clockSkewMs = policy.clockSkewMs ?? exports.DEFAULT_LICENSE_CLOCK_SKEW_MS;
    return [maxLifetimeMs, offlineLeaseMs, clockSkewMs].every(value => Number.isSafeInteger(value) && value >= 0) &&
        maxLifetimeMs <= exports.MAX_OFFLINE_LEASE_MS && offlineLeaseMs <= exports.MAX_OFFLINE_LEASE_MS &&
        clockSkewMs <= exports.DEFAULT_LICENSE_CLOCK_SKEW_MS;
}
function nonempty(value) { return typeof value === 'string' && value.length > 0; }
function validSeats(value) { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0; }
function validInteger(value) { return typeof value === 'number' && Number.isSafeInteger(value); }
function validSeconds(value) { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= Math.floor(Number.MAX_SAFE_INTEGER / 1_000); }
function validMilliseconds(value) { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
function validStringList(value) { return Array.isArray(value) && value.length > 0 && value.every(nonempty); }
function stringList(value) {
    if (nonempty(value))
        return [value];
    return validStringList(value) ? [...new Set(value)] : null;
}
