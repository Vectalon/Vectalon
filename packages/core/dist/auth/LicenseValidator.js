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
const os_1 = require("os");
const CONFIG_DIR = (0, path_1.join)((0, os_1.homedir)(), '.config', 'vectalon');
const MISSING_KEY_ERROR = 'License validation unavailable: no public key found. Set VECTALON_PUBLIC_KEY to a ' +
    'PEM file path, place public-key.pem in the package root or ~/.config/vectalon/, or run ' +
    '"npm run keygen" to generate a development key.';
/**
 * Resolve the public key path. Order of preference:
 *   1. VECTALON_PUBLIC_KEY env var (explicit override)
 *   2. Standard locations relative to the compiled output
 *   3. The user config dir (~/.config/vectalon)
 */
function resolvePublicKeyPath() {
    const envPath = process.env.VECTALON_PUBLIC_KEY;
    if (envPath && (0, fs_1.existsSync)(envPath)) {
        return envPath;
    }
    const candidates = [
        (0, path_1.join)(__dirname, '..', 'public-key.pem'), // dist/auth or src/auth
        (0, path_1.join)(__dirname, '..', '..', 'public-key.pem'), // dist or src
        (0, path_1.join)(__dirname, '..', '..', '..', 'public-key.pem'), // package root
        (0, path_1.join)(CONFIG_DIR, 'public-key.pem'), // ~/.config/vectalon
    ];
    for (const path of candidates) {
        if ((0, fs_1.existsSync)(path))
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
            const pem = (0, fs_1.readFileSync)(path, 'utf-8');
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
     * Clear the cached key state so the next validate() re-resolves the key —
     * e.g. after setting VECTALON_PUBLIC_KEY or rotating the key on disk.
     */
    static resetKey() {
        this.keyState = null;
    }
    static validate(token) {
        const key = this.loadKey();
        if (!key) {
            return { valid: false, error: MISSING_KEY_ERROR };
        }
        if ('error' in key) {
            return { valid: false, error: key.error };
        }
        try {
            const verified = (0, crypto_1.verify)('SHA256', Buffer.from(token.split('.').slice(0, 2).join('.')), key.publicKey, Buffer.from(token.split('.')[2], 'base64'));
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
            return {
                valid: false,
                error: `Invalid license: ${err instanceof Error ? err.message : String(err)}`,
            };
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
