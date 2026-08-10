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
function findPublicKey() {
    const candidates = [
        (0, path_1.join)(__dirname, '..', 'public-key.pem'), // dist/auth/../
        (0, path_1.join)(__dirname, '..', '..', 'public-key.pem'), // dist/auth/../../
        (0, path_1.join)(__dirname, '..', '..', '..', 'public-key.pem'), // src/auth/../../../
    ];
    for (const path of candidates) {
        if ((0, fs_1.existsSync)(path)) {
            return (0, fs_1.readFileSync)(path, 'utf-8');
        }
    }
    throw new Error('public-key.pem not found in expected locations');
}
const PUBLIC_KEY_PEM = findPublicKey();
class LicenseValidator {
    static publicKey = (0, crypto_1.createPublicKey)(PUBLIC_KEY_PEM);
    static validate(token) {
        try {
            const verified = (0, crypto_1.verify)('SHA256', Buffer.from(token.split('.').slice(0, 2).join('.')), this.publicKey, Buffer.from(token.split('.')[2], 'base64'));
            if (!verified) {
                return { valid: false, error: 'Invalid license signature' };
            }
            const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
            if (payload.exp * 1000 < Date.now()) {
                return { valid: false, error: 'License expired' };
            }
            const license = {
                key: token,
                tier: payload.tier,
                product: payload.product,
                issuedAt: payload.iat * 1000,
                expiresAt: payload.exp * 1000,
                githubUserId: payload.sub,
            };
            return { valid: true, license };
        }
        catch (err) {
            return { valid: false, error: `Invalid license: ${err instanceof Error ? err.message : String(err)}` };
        }
    }
    static isExpired(license) {
        return license.expiresAt < Date.now();
    }
    static daysRemaining(license) {
        return Math.max(0, Math.ceil((license.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
    }
}
exports.LicenseValidator = LicenseValidator;
