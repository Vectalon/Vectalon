/**
 * vectalon deps — Dependency Upgrade Agent (Roadmap Phase 8, item 067)
 * Business Source License 1.1 (BSL-1.1)
 */

export type DepSeverity = 'error' | 'warning' | 'info'
export type DepCategory = 'pairing' | 'duplicates' | 'vulnerability' | 'manifest'
export type DepVerdict = 'approved' | 'needs-attention' | 'changes-requested'

/** One dependency finding with its safe upgrade path. */
export interface DepFinding {
  id: string
  category: DepCategory
  severity: DepSeverity
  /** Package involved ('' for manifest-level findings). */
  package: string
  /** Current declared range/version. */
  current: string
  message: string
  /** The concrete, safe upgrade path. */
  suggestion: string
}

export interface DepSummary {
  total: number
  bySeverity: Record<DepSeverity, number>
  byCategory: Record<DepCategory, number>
  /** Best-3 upgrade paths to act on first. */
  topRecommendations: string[]
}

export interface DepReport {
  scannedAt: number
  root: string
  /** Direct dependency count. */
  depCount: number
  audit: {
    ran: boolean
    skippedReason?: string
    total: number
    critical: number
    high: number
  }
  findings: DepFinding[]
  summary: DepSummary
  verdict: DepVerdict
}

export interface DepOptions {
  /** Skip the npm audit pass entirely (fast, offline). */
  skipAudit?: boolean
  /** Injectable audit runner for hermetic tests; default runs real npm. */
  auditRunner?: (root: string) => Promise<{ ran: boolean; skippedReason?: string; total: number; critical: number; high: number; moderate: number; low: number; vulnerabilities: { package: string; severity: string; isDirect: boolean }[] } | null>
  /** Timeout for the npm audit subprocess (default 90s). */
  auditTimeoutMs?: number
}
