/**
 * vectalon release-ready — Release Readiness Agent (Roadmap Phase 8, item 069)
 * Business Source License 1.1 (BSL-1.1)
 */

export type ReleaseSeverity = 'error' | 'warning' | 'info'
export type ReleaseVerdict = 'approved' | 'needs-attention' | 'changes-requested'

/** One release-readiness check result. */
export interface ReleaseCheck {
  id: string
  severity: ReleaseSeverity
  title: string
  message: string
  /** The concrete action to become release-ready. */
  fix?: string
}

export interface ReleaseSummary {
  total: number
  bySeverity: Record<ReleaseSeverity, number>
  topRecommendations: string[]
}

export interface ReleaseReadyReport {
  scannedAt: number
  root: string
  /** Detected package.json version ('' when missing). */
  version: string
  /** Last git tag, when a git repo is present ('' otherwise). */
  lastTag: string
  checks: ReleaseCheck[]
  summary: ReleaseSummary
  verdict: ReleaseVerdict
}
