/**
 * vectalon build-fix — Build Fix Agent (Roadmap Phase 8, item 064)
 * Business Source License 1.1 (BSL-1.1)
 */

export type BuildKind = 'metro' | 'gradle' | 'xcode'
export type BuildSeverity = 'error' | 'warning' | 'info'
export type BuildFixVerdict = 'approved' | 'needs-attention' | 'changes-requested'

/** One classified build failure with its standard fix. */
export interface BuildFixFinding {
  /** Pattern id, e.g. `module-resolution` or `sdk-platform-not-found`. */
  id: string
  kind: BuildKind
  severity: BuildSeverity
  /** 1-based line in the log that carried the pattern (null for context). */
  line: number | null
  title: string
  message: string
  /** The standard fix for this failure class. */
  fix: string
}

export interface BuildFixSummary {
  total: number
  byKind: Record<BuildKind, number>
  bySeverity: Record<BuildSeverity, number>
  /** The fix plan: root cause first, then corroborating failures. */
  fixPlan: string[]
}

export interface BuildFixReport {
  scannedAt: number
  root: string
  /** Log file analyzed (absent when none was provided). */
  logPath?: string
  /** Resolved log kind — auto-detected from content or forced via --metro/--gradle/--xcode. */
  kind: BuildKind | 'unknown'
  /** How the kind was chosen. */
  detection: 'auto' | 'forced' | 'none'
  /** Tail of the log, for context. */
  evidence: string[]
  findings: BuildFixFinding[]
  summary: BuildFixSummary
  verdict: BuildFixVerdict
}

export interface BuildFixOptions {
  /** Build log file to diagnose. */
  log?: string
  /** Force the log kind instead of auto-detecting (default auto). */
  kind?: BuildKind
}
