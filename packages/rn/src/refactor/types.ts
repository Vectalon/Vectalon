/**
 * vectalon refactor — Refactoring Agent (Roadmap Phase 8, item 066)
 * Business Source License 1.1 (BSL-1.1)
 */

export type RefactorSeverity = 'error' | 'warning' | 'info'
export type RefactorCategory =
  | 'dead-code'
  | 'duplication'
  | 'modernization'
  | 'types'
  | 'complexity'
  | 'styles'
  | 'logging'
export type RefactorVerdict = 'approved' | 'needs-attention' | 'changes-requested'

/** One concrete refactor opportunity. */
export interface RefactorFinding {
  /** Stable id, e.g. `unused-import` or `optional-chaining`. */
  id: string
  category: RefactorCategory
  severity: RefactorSeverity
  /** Relative path of the file. */
  file: string
  /** 1-based line (0 when the finding is file-level). */
  line: number
  /** The identifier / block / pattern involved. */
  target: string
  message: string
  /** The concrete, safe refactor to apply. */
  suggestion: string
}

export interface RefactorSummary {
  total: number
  bySeverity: Record<RefactorSeverity, number>
  byCategory: Record<RefactorCategory, number>
  /** Top opportunities to start with (severity-ranked, deduped). */
  topRecommendations: string[]
}

export interface RefactorReport {
  scannedAt: number
  root: string
  /** Number of source files scanned. */
  fileCount: number
  findings: RefactorFinding[]
  summary: RefactorSummary
  verdict: RefactorVerdict
}
