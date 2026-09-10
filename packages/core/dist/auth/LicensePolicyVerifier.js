"use strict";
/**
 * Composed license verification boundary for Vectalon Core
 * Business Source License 1.1 (BSL-1.1)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyLicenseWithPolicy = verifyLicenseWithPolicy;
const LicensePolicy_1 = require("./LicensePolicy");
const LicenseSignature_1 = require("./LicenseSignature");
/** Verifies signature, then contract and policy in separate, fail-closed steps. */
function verifyLicenseWithPolicy(raw, context) {
    let now;
    try {
        now = context.clock.now();
    }
    catch {
        return { ok: false, code: 'invalid_verification_time' };
    }
    if (!Number.isSafeInteger(now) || now < 0)
        return { ok: false, code: 'invalid_verification_time' };
    const signed = (0, LicenseSignature_1.verifyLicenseSignature)(raw, context.keys);
    if (!signed.ok)
        return signed;
    if (signed.header.typ !== 'vectalon-license+jwt')
        return { ok: false, code: 'invalid_token_type' };
    const claims = (0, LicensePolicy_1.parseVersionedLicenseClaims)(signed.payload);
    if (!claims)
        return { ok: false, code: 'invalid_claims' };
    const evaluated = (0, LicensePolicy_1.evaluateLicensePolicy)(claims, {
        now,
        policy: context.policy,
        lastTrustedTime: context.lastTrustedTime,
        lastOnlineAt: context.lastOnlineAt,
    });
    return evaluated.ok ? {
        ...evaluated,
        signed: {
            header: signed.header,
            payload: signed.payload,
        },
    } : {
        ...evaluated,
        // The payload is RS256-authenticated and schema-validated at this
        // point. Preserve lifecycle evidence for denied status UX, while the
        // false result remains unusable by entitlement evaluation.
        lifecycle: claims.state,
    };
}
