"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENTITLEMENT_POLICY_VERSION = void 0;
exports.evaluateEntitlement = evaluateEntitlement;
const TrustedClaims_1 = require("../auth/TrustedClaims");
const TierResolver_1 = require("./TierResolver");
exports.ENTITLEMENT_POLICY_VERSION = '2026-09-03.1';
const messages = {
    allowed_free: 'Available on the Free plan.',
    allowed_license: 'Your license includes this capability.',
    denied_missing_entitlement: 'A valid license is required. Free features remain available.',
    denied_untrusted_claims: 'The saved license could not be trusted. Activate a valid license and retry.',
    denied_invalid_clock: 'The system clock could not be validated. Correct it and retry.',
    denied_clock_rollback: 'The system clock moved backwards. Reconnect to refresh your license.',
    denied_not_yet_valid: 'This license is not active yet.',
    denied_expired: 'This license has expired. Free features remain available.',
    denied_revoked: 'This license has been revoked. Free features remain available.',
    denied_wrong_product: 'This license does not include the requested product.',
    denied_wrong_tier: 'Your current plan does not include this capability.',
    denied_missing_capability: 'This license does not grant the requested capability.',
    denied_seat_limit: 'The requested seats exceed the licensed quantity.',
    degraded_revocation_stale: 'Access is temporarily offline; reconnect to refresh license status.',
};
function decision(status, reasonCode, request, currentTier, expiresAt) {
    return {
        status,
        allowed: status !== 'deny',
        reasonCode,
        policyVersion: exports.ENTITLEMENT_POLICY_VERSION,
        currentTier,
        requiredTier: request.requiredTier,
        message: messages[reasonCode],
        ...(expiresAt === undefined ? {} : { expiresAt }),
    };
}
/** Pure, fail-closed policy evaluation. It accepts only verifier-created claims. */
function evaluateEntitlement(request) {
    if (!Number.isSafeInteger(request.now) || request.now < 0) {
        return decision('deny', 'denied_invalid_clock', request, 'free');
    }
    if (request.lastTrustedTime !== undefined &&
        (!Number.isSafeInteger(request.lastTrustedTime) || request.lastTrustedTime < 0 || request.now < request.lastTrustedTime)) {
        return decision('deny', 'denied_clock_rollback', request, 'free');
    }
    if (!request.claims) {
        return TierResolver_1.TierResolver.meets('free', request.requiredTier)
            ? decision('allow', 'allowed_free', request, 'free')
            : decision('deny', 'denied_missing_entitlement', request, 'free');
    }
    if (!(0, TrustedClaims_1.isTrustedClaims)(request.claims)) {
        return decision('deny', 'denied_untrusted_claims', request, 'free');
    }
    const claims = request.claims;
    const tier = TierResolver_1.TierResolver.isTier(claims.tier) ? claims.tier : 'free';
    if (request.now < claims.issuedAt)
        return decision('deny', 'denied_not_yet_valid', request, tier);
    if (request.now >= claims.expiresAt)
        return decision('deny', 'denied_expired', request, tier, claims.expiresAt);
    if (request.revocation === 'revoked')
        return decision('deny', 'denied_revoked', request, tier, claims.expiresAt);
    const products = typeof claims.product === 'string' ? [claims.product] : claims.product;
    if (!products.includes('all') && !products.includes(request.product)) {
        return decision('deny', 'denied_wrong_product', request, tier, claims.expiresAt);
    }
    if (!TierResolver_1.TierResolver.isTier(claims.tier) || !TierResolver_1.TierResolver.meets(tier, request.requiredTier)) {
        return decision('deny', 'denied_wrong_tier', request, tier, claims.expiresAt);
    }
    if (request.capabilityId && claims.capabilities && !claims.capabilities.includes(request.capabilityId)) {
        return decision('deny', 'denied_missing_capability', request, tier, claims.expiresAt);
    }
    if (request.requestedSeats !== undefined) {
        if (!Number.isSafeInteger(request.requestedSeats) || request.requestedSeats < 1 || !claims.seats || request.requestedSeats > claims.seats) {
            return decision('deny', 'denied_seat_limit', request, tier, claims.expiresAt);
        }
    }
    if (request.revocation === 'stale') {
        return decision('degraded', 'degraded_revocation_stale', request, tier, claims.expiresAt);
    }
    return decision('allow', 'allowed_license', request, tier, claims.expiresAt);
}
