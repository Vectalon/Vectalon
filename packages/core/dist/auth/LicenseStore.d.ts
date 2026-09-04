/**
 * LicenseStore — Read/write license and trial files
 * Business Source License 1.1 (BSL-1.1)
 */
import type { LicenseInfo } from './types';
import type { TrialState, TrialStateStore } from './TrialTracker';
export declare class LicenseStore implements TrialStateStore {
    static read(): LicenseInfo | null;
    static write(license: LicenseInfo): void;
    static clear(): void;
    static readTrial(): TrialState | null;
    static writeTrial(trial: TrialState): void;
    static clearTrial(): void;
    read(): TrialState | null;
    write(state: TrialState): void;
    clear(): void;
}
