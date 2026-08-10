"use strict";
/**
 * TrialTracker — GitHub-based trial management (1 trial per GitHub account)
 * Business Source License 1.1 (BSL-1.1)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrialTracker = void 0;
const os_1 = require("os");
const crypto_1 = require("crypto");
const LicenseStore_1 = require("./LicenseStore");
const TRIAL_DAYS = 14;
class TrialTracker {
    static start(githubUser, tier) {
        const trial = {
            tier,
            githubUserId: githubUser.id,
            githubUsername: githubUser.login,
            startedAt: Date.now(),
            expiresAt: Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000,
            deviceFingerprint: this.getDeviceFingerprint(),
        };
        LicenseStore_1.LicenseStore.writeTrial(trial);
        return trial;
    }
    static isActive() {
        const trial = LicenseStore_1.LicenseStore.readTrial();
        if (!trial || !trial.expiresAt)
            return false;
        return Date.now() < trial.expiresAt;
    }
    static daysRemaining() {
        const trial = LicenseStore_1.LicenseStore.readTrial();
        if (!trial || !trial.expiresAt)
            return 0;
        return Math.max(0, Math.ceil((trial.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
    }
    static getInfo() {
        return LicenseStore_1.LicenseStore.readTrial();
    }
    static hasTrial() {
        const trial = LicenseStore_1.LicenseStore.readTrial();
        return trial !== null && !!trial.githubUserId;
    }
    static getDeviceFingerprint() {
        // Simple hash of hostname + username
        const data = `${(0, os_1.hostname)()}-${(0, os_1.userInfo)().username}-${process.platform}`;
        return (0, crypto_1.createHash)('sha256').update(data).digest('hex').slice(0, 16);
    }
}
exports.TrialTracker = TrialTracker;
