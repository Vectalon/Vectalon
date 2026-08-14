/**
 * vectalon sec — Security Review Agent (Roadmap Phase 8, item 063)
 * Business Source License 1.1 (BSL-1.1)
 */

export type SecuritySeverity = 'error' | 'warning' | 'info'
export type SecurityCategory = 'secrets' | 'unsafe' | 'deps'
export type SecurityVerdict = 'approved' | 'needs-attention' | 'changes-requested'

/** One deterministic security finding. */
export interface SecurityFinding {
  /** Stable id, e.g. `hardcoded-secret`. */
  id: string
  category: SecurityCategory
  severity: SecuritySeverity
  /** Relative path of the file that triggered it. */
  file: string
  /** 1-based line. */
  line: number
  /** The redacted secret / matched pattern / package involved. */
  target: string
  message: string
  suggestion: string
}

/** One vulnerable dependency from the audit. */
export interface SecurityVuln {
  package: string
  /** npm audit severity. */
  severity: 'critical' | 'high' | 'moderate' | 'low' | 'info'
  /** True when the package is a direct dependency (not transitive). */
  isDirect: boolean
  /** Number of advisories behind this package entry. */
  advisoryCount: number
}

/** Result of the dependency advisory pass (best-effort). */
export interface SecurityAudit {
  /** False when the audit could not run (no lockfile, no npm, no network). */
  ran: boolean
  /** Why the audit was skipped, when it was. */
  skippedReason?: string
  total: number
  critical: number
  high: number
  moderate: number
  low: number
  vulnerabilities: SecurityVuln[]
}

export interface SecuritySummary {
  total: number
  bySeverity: Record<SecuritySeverity, number>
  byCategory: Record<SecurityCategory, number>
  /** Best-3 suggestions to act on first (severity-ranked, deduped). */
  topRecommendations: string[]
}

export interface SecurityReport {
  scannedAt: number
  root: string
  /** Number of files walked (source + config). */
  fileCount: number
  audit: SecurityAudit
  findings: SecurityFinding[]
  summary: SecuritySummary
  verdict: SecurityVerdict
}

export interface SecurityOptions {
  /** Skip the npm audit pass entirely (fast, offline). */
  skipAudit?: boolean
  /** Injectable audit runner for hermetic tests; default runs real npm. */
  auditRunner?: (root: string) => Promise<SecurityAudit | null>
  /** Timeout for the npm audit subprocess (default 90s). */
  auditTimeoutMs?: number
}
