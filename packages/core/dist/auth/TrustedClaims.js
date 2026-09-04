"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTrustedClaims = createTrustedClaims;
exports.isTrustedClaims = isTrustedClaims;
exports.trustedClaimsToLicenseInfo = trustedClaimsToLicenseInfo;
const verifiedClaims = new WeakSet();
/** @internal Only verification code may call this constructor. */
function createTrustedClaims(input) {
    const claims = Object.freeze({
        ...input,
        product: Array.isArray(input.product) ? Object.freeze([...input.product]) : input.product,
        ...(input.capabilities ? { capabilities: Object.freeze([...input.capabilities]) } : {}),
    });
    verifiedClaims.add(claims);
    return claims;
}
function isTrustedClaims(value) {
    return typeof value === 'object' && value !== null && verifiedClaims.has(value);
}
function trustedClaimsToLicenseInfo(token, claims) {
    const product = typeof claims.product === 'string' ? claims.product : [...claims.product];
    return {
        key: token,
        tier: claims.tier,
        product,
        issuedAt: claims.issuedAt,
        expiresAt: claims.expiresAt,
        githubUserId: claims.githubUserId,
    };
}
