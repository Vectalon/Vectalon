/**
 * vectalon app-store — App Store Readiness Agent (Roadmap Phase 9, item 074)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Deterministic iOS/Android release-readiness checks: version/version-code
 * consistency across Info.plist, build.gradle, and package.json; app icon
 * and splash assets; iOS privacy manifest; Android permissions and
 * cleartext-traffic posture. Reports to docs/vectalon/app-store/
 * (gitignored).
 */

export interface StoreFinding {
  id: string
  severity: 'error' | 'warning' | 'info'
  platform: 'ios' | 'android' | 'shared'
  message: string
  suggestion: string
}

export interface StoreReport {
  scannedAt: number
  root: string
  platforms: ('ios' | 'android')[]
  findings: StoreFinding[]
  verdict: 'approved' | 'needs-attention' | 'changes-requested'
  summary: { total: number; bySeverity: Record<string, number> }
}
