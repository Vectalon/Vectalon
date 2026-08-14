/**
 * vectalon test-repair — Test Repair Agent (Roadmap Phase 8, item 065)
 * Business Source License 1.1 (BSL-1.1)
 */

export type TestKind = 'jest' | 'detox' | 'maestro'
export type TestSeverity = 'error' | 'warning' | 'info'
export type TestRepairVerdict = 'approved' | 'needs-attention' | 'changes-requested'

/** One classified test failure with its standard fix. */
export interface TestRepairFinding {
  /** Pattern id, e.g. `assertion-failure` or `element-not-found`. */
  id: string
  kind: TestKind
  severity: TestSeverity
  /** 1-based line in the log that carried the pattern (null for context). */
  line: number | null
  title: string
  message: string
  /** The standard fix for this failure class. */
  fix: string
}

export interface TestRepairSummary {
  total: number
  byKind: Record<TestKind, number>
  bySeverity: Record<TestSeverity, number>
  /** The fix plan: root cause first, then corroborating failures. */
  fixPlan: string[]
}

export interface TestRepairReport {
  scannedAt: number
  root: string
  /** Log file analyzed (absent when none was provided). */
  logPath?: string
  /** Resolved test kind — auto-detected from content or forced via flags. */
  kind: TestKind | 'unknown'
  /** How the kind was chosen. */
  detection: 'auto' | 'forced' | 'none'
  /** Tail of the log, for context. */
  evidence: string[]
  findings: TestRepairFinding[]
  summary: TestRepairSummary
  verdict: TestRepairVerdict
}

export interface TestRepairOptions {
  /** Test output log to diagnose. */
  log?: string
  /** Force the test kind instead of auto-detecting (default auto). */
  kind?: TestKind
}
