/**
 * TrialTracker — GitHub-based trial management (1 trial per GitHub account)
 * Business Source License 1.1 (BSL-1.1)
 */

import { hostname, userInfo } from 'os'
import { createHash } from 'crypto'
import { LicenseStore } from './LicenseStore'
import type { TrialInfo, GitHubUser } from './types'

const TRIAL_DAYS = 14

export class TrialTracker {
  static start(githubUser: GitHubUser, tier: string): TrialInfo {
    const trial: TrialInfo = {
      tier,
      githubUserId: githubUser.id,
      githubUsername: githubUser.login,
      startedAt: Date.now(),
      expiresAt: Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000,
      deviceFingerprint: this.getDeviceFingerprint(),
    }
    LicenseStore.writeTrial(trial)
    return trial
  }

  static isActive(): boolean {
    const trial = LicenseStore.readTrial()
    if (!trial || !trial.expiresAt) return false
    return Date.now() < trial.expiresAt
  }

  static daysRemaining(): number {
    const trial = LicenseStore.readTrial()
    if (!trial || !trial.expiresAt) return 0
    return Math.max(0, Math.ceil((trial.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)))
  }

  static getInfo(): TrialInfo | null {
    return LicenseStore.readTrial()
  }

  static hasTrial(): boolean {
    const trial = LicenseStore.readTrial()
    return trial !== null && !!trial.githubUserId
  }

  private static getDeviceFingerprint(): string {
    // Simple hash of hostname + username
    const data = `${hostname()}-${userInfo().username}-${process.platform}`
    return createHash('sha256').update(data).digest('hex').slice(0, 16)
  }
}
