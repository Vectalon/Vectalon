/**
 * TrialTracker — GitHub-based trial management (1 trial per GitHub account)
 * Business Source License 1.1 (BSL-1.1)
 */
import type { TrialInfo, GitHubUser } from './types';
export declare class TrialTracker {
    static start(githubUser: GitHubUser, tier: string): TrialInfo;
    static isActive(): boolean;
    static daysRemaining(): number;
    static getInfo(): TrialInfo | null;
    static hasTrial(): boolean;
    private static getDeviceFingerprint;
}
