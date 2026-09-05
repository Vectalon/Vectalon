"use strict";
/**
 * LicenseValidator — Offline JWT validation with embedded public key
 * Business Source License 1.1 (BSL-1.1)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LicenseValidator = void 0;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const TrustedClaims_1 = require("./TrustedClaims");
const LicenseParser_1 = require("./LicenseParser");
const LicenseVerifier_1 = require("./LicenseVerifier");
const MISSING_KEY_ERROR = 'License validation unavailable: the package does not contain its trusted public key.';
/**
 * Resolve the public key path. Order of preference:
 * Resolve only the public key shipped in the package. Customer-controlled
 * environment variables and files must never replace the production trust root.
 */
function resolvePublicKeyPath() {
    const candidates = [
        (0, path_1.join)(__dirname, '..', 'public-key.pem'), // dist/auth or src/auth
        (0, path_1.join)(__dirname, '..', '..', 'public-key.pem'), // dist or src
        (0, path_1.join)(__dirname, '..', '..', '..', 'public-key.pem'), // package root
    ];
    for (const path of candidates) {
        // The candidates are fixed package-relative paths. Prevent server bundlers
        // from treating this lookup as permission to trace the consumer's project.
        if ((0, fs_1.existsSync)(/* turbopackIgnore: true */ path))
            return path;
    }
    return null;
}
class LicenseValidator {
    static keyState = null;
    /**
     * Lazily load and parse the public key. Never throws at import time — if the
     * key is missing or malformed, validation fails closed instead.
     */
    static loadKey() {
        if (this.keyState !== null)
            return this.keyState;
        const path = resolvePublicKeyPath();
        if (!path) {
            this.keyState = { error: MISSING_KEY_ERROR };
            return this.keyState;
        }
        try {
            const pem = (0, fs_1.readFileSync)(/* turbopackIgnore: true */ path, 'utf-8');
            this.keyState = { publicKey: (0, crypto_1.createPublicKey)(pem) };
        }
        catch {
            this.keyState = {
                error: `License validation unavailable: could not read public key at ${path}.`,
            };
        }
        return this.keyState;
    }
    /**
     * Clear the cached key state so tests and package upgrades can reload the
     * bundled trust root.
     */
    static resetKey() {
        this.keyState = null;
    }
    static validateClaims(token, now = Date.now()) {
        const parsed = (0, LicenseParser_1.parseLicenseToken)(token);
        if (!parsed.ok) {
            return { valid: false, error: `Invalid license token: ${parsed.code}` };
        }
        const key = this.loadKey();
        if (!key) {
            return { valid: false, error: MISSING_KEY_ERROR };
        }
        if ('error' in key) {
            return { valid: false, error: key.error };
        }
        const result = (0, LicenseVerifier_1.verifyLicenseToken)(token, {
            id: 'vectalon-legacy',
            algorithm: 'RS256',
            publicKey: key.publicKey,
        }, now);
        if (!result.ok) {
            return {
                valid: false,
                error: result.code === 'expired' ? 'License expired' : `Invalid license: ${result.code}`,
            };
        }
        return { valid: true, claims: result.claims };
    }
    static validate(token) {
        const result = this.validateClaims(token);
        if (!result.valid)
            return result;
        return { valid: true, license: (0, TrustedClaims_1.trustedClaimsToLicenseInfo)(token, result.claims) };
    }
    static isExpired(license) {
        return license.expiresAt < Date.now();
    }
    static daysRemaining(license) {
        return Math.max(0, Math.ceil((license.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
    }
}
exports.LicenseValidator = LicenseValidator;
