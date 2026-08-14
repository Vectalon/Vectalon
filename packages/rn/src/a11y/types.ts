/**
 * vectalon a11y — Accessibility Agent (Roadmap Phase 8, item 068)
 * Business Source License 1.1 (BSL-1.1)
 */

export type A11ySeverity = 'error' | 'warning' | 'info'
export type A11yVerdict = 'approved' | 'needs-attention' | 'changes-requested'

/** One accessibility finding, line-pinned. */
export interface A11yFinding {
  id: string
  severity: A11ySeverity
  /** Relative path of the file. */
  file: string
  /** 1-based line. */
  line: number
  /** The element / attribute involved. */
  target: string
  message: string
  suggestion: string
}

export interface A11ySummary {
  total: number
  bySeverity: Record<A11ySeverity, number>
  topRecommendations: string[]
}

export interface A11yReport {
  scannedAt: number
  root: string
  /** Number of source files scanned. */
  fileCount: number
  findings: A11yFinding[]
  summary: A11ySummary
  verdict: A11yVerdict
}
