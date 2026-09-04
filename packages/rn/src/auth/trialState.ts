import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { LicenseStore, TrialTracker, type TrialState, type TrialStateStore, type TrialStatus } from '@vectalon-dev/core'
import { configDirPath } from '../config'

export class FileTrialStateStore implements TrialStateStore {
  constructor(private readonly path = join(configDirPath(), 'trial.json')) {}

  read(): TrialState | null {
    try {
      const value: unknown = JSON.parse(readFileSync(this.path, 'utf8'))
      if (!value || typeof value !== 'object') return null
      const state = value as Partial<TrialState>
      return typeof state.token === 'string' && Number.isSafeInteger(state.lastTrustedTime) && Number.isSafeInteger(state.lastOnlineAt)
        ? state as TrialState : null
    } catch { return null }
  }

  write(state: TrialState): void {
    const dir = dirname(this.path)
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    chmodSync(dir, 0o700)
    const temporary = `${this.path}.${process.pid}.tmp`
    writeFileSync(temporary, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 })
    chmodSync(temporary, 0o600)
    renameSync(temporary, this.path)
    chmodSync(this.path, 0o600)
  }

  clear(): void {
    try { if (existsSync(this.path)) unlinkSync(this.path) } catch { /* best-effort logout */ }
    // Remove the unsigned legacy trial record as part of the one-way migration.
    try { LicenseStore.clearTrial() } catch { /* best-effort migration */ }
  }
}

function tracker(): TrialTracker {
  const packageRoot = dirname(require.resolve('@vectalon-dev/core/package.json'))
  return new TrialTracker({
    store: new FileTrialStateStore(),
    clock: { now: () => Date.now() },
    key: { id: process.env.VECTALON_TRIAL_KEY_ID || 'vectalon-legacy', algorithm: 'RS256', publicKey: readFileSync(join(packageRoot, 'public-key.pem')) },
    audience: 'vectalon-sdk',
    product: 'rn',
    offlineAllowanceMs: 24 * 60 * 60 * 1000,
  })
}

export function activateTrial(token: string): TrialStatus { return tracker().activate(token) }
export function trialStatus(): TrialStatus { return tracker().status() }
export function clearTrial(): void { new FileTrialStateStore().clear() }
export function trialDaysRemaining(status = trialStatus()): number {
  return status.credential ? Math.max(0, Math.ceil((status.credential.expiresAt - Date.now()) / 86_400_000)) : 0
}
export function hasActiveTrial(): boolean { return trialStatus().status === 'active' }
