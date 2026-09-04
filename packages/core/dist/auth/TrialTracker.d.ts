import { type TrialVerificationErrorCode, type TrialVerificationKey, type VerifiedTrialCredential } from './TrialCredentialVerifier';
export interface TrialState {
    token: string;
    lastTrustedTime: number;
    lastOnlineAt: number;
}
export interface TrialStateStore {
    read(): TrialState | null;
    write(state: TrialState): void;
    clear(): void;
}
export interface TrialClock {
    now(): number;
}
export type TrialStatusReason = 'not_started' | 'active' | 'offline_grace' | 'offline_allowance_exhausted' | 'clock_rollback' | 'invalid_state' | 'revoked' | TrialVerificationErrorCode;
export type TrialStatus = Readonly<{
    status: 'none' | 'active' | 'degraded' | 'expired' | 'revoked' | 'invalid';
    reasonCode: TrialStatusReason;
    credential?: VerifiedTrialCredential;
}>;
export interface TrialTrackerOptions {
    store: TrialStateStore;
    clock: TrialClock;
    key: TrialVerificationKey;
    audience: string;
    product: string;
    offlineAllowanceMs: number;
}
/** Tracks server-authoritative trials. It cannot create a trial or author dates locally. */
export declare class TrialTracker {
    private readonly options;
    constructor(options: TrialTrackerOptions);
    activate(token: string): TrialStatus;
    status(revocation?: 'current' | 'stale' | 'revoked'): TrialStatus;
    clear(): void;
    private verify;
    private failure;
}
