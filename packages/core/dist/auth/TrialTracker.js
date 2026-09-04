"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrialTracker = void 0;
const TrialCredentialVerifier_1 = require("./TrialCredentialVerifier");
/** Tracks server-authoritative trials. It cannot create a trial or author dates locally. */
class TrialTracker {
    options;
    constructor(options) {
        this.options = options;
    }
    activate(token) {
        const now = this.options.clock.now();
        const result = this.verify(token, now);
        if (!result.ok)
            return this.failure(result.code);
        this.options.store.write({ token, lastTrustedTime: now, lastOnlineAt: now });
        return { status: 'active', reasonCode: 'active', credential: result.credential };
    }
    status(revocation = 'current') {
        const state = this.options.store.read();
        if (!state)
            return { status: 'none', reasonCode: 'not_started' };
        const now = this.options.clock.now();
        if (!Number.isSafeInteger(now) || now < 0)
            return { status: 'invalid', reasonCode: 'invalid_verification_time' };
        if (!validStoredTime(state.lastTrustedTime) || !validStoredTime(state.lastOnlineAt) || !validDuration(this.options.offlineAllowanceMs)) {
            return { status: 'invalid', reasonCode: 'invalid_state' };
        }
        if (now < state.lastTrustedTime)
            return { status: 'invalid', reasonCode: 'clock_rollback' };
        const result = this.verify(state.token, now);
        if (!result.ok)
            return this.failure(result.code);
        if (revocation === 'revoked')
            return { status: 'revoked', reasonCode: 'revoked' };
        if (revocation === 'stale') {
            if (now - state.lastOnlineAt > this.options.offlineAllowanceMs)
                return { status: 'invalid', reasonCode: 'offline_allowance_exhausted' };
            return { status: 'degraded', reasonCode: 'offline_grace', credential: result.credential };
        }
        this.options.store.write({ ...state, lastTrustedTime: now, lastOnlineAt: now });
        return { status: 'active', reasonCode: 'active', credential: result.credential };
    }
    clear() { this.options.store.clear(); }
    verify(token, now) {
        return (0, TrialCredentialVerifier_1.verifyTrialToken)(token, this.options.key, { now, audience: this.options.audience, product: this.options.product });
    }
    failure(code) {
        return { status: code === 'expired' ? 'expired' : 'invalid', reasonCode: code };
    }
}
exports.TrialTracker = TrialTracker;
function validStoredTime(value) { return Number.isSafeInteger(value) && value >= 0; }
function validDuration(value) { return Number.isSafeInteger(value) && value >= 0; }
