/**
 * DevMode — Developer utilities for bypassing tier/license checks
 * Business Source License 1.1 (BSL-1.1)
 */

export class DevMode {
  static isActive(): boolean {
    return process.env.VECTALON_DEV_MODE === '1' || process.env.VECTALON_BYPASS_TIER === '1'
  }

  static enable(): void {
    process.env.VECTALON_DEV_MODE = '1'
  }

  static disable(): void {
    delete process.env.VECTALON_DEV_MODE
    delete process.env.VECTALON_BYPASS_TIER
  }

  static describe(): string {
    if (this.isActive()) {
      return 'DEV MODE — all features unlocked (VECTALON_DEV_MODE=1)'
    }
    return 'Production mode — tier checks enforced'
  }
}
