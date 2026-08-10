/**
 * LicenseStore — Read/write license and trial files
 * Business Source License 1.1 (BSL-1.1)
 */
import type { LicenseInfo, TrialInfo } from './types';
export declare class LicenseStore {
    static read(): LicenseInfo | null;
    static write(license: LicenseInfo): void;
    static clear(): void;
    static readTrial(): TrialInfo | null;
    static writeTrial(trial: TrialInfo): void;
    static clearTrial(): void;
}
