/**
 * vectalon pr — PR Review Agent types.
 * Business Source License 1.1 (BSL-1.1)
 *
 * The deterministic per-PR review: when a developer opens a PR, Vectalon
 * comments with the five-check scorecard (Architecture, Dependencies,
 * Security, Performance, Testing), the issues it found on the added lines,
 * and the health impact (base → projected) — then offers the fix affordance.
 */

export type PrReviewDimension = 'architecture' | 'dependencies' | 'security' | 'performance' | 'testing'

export type PrReviewSeverity = 'error' | 'warning' | 'info'

export type PrReviewPriority = 'P0' | 'P1' | 'P2'

export type PrReviewVerdict = 'approved' | 'needs-attention' | 'changes-requested'

/** One issue introduced by the PR (always attributed to a changed line/file). */
export interface PrReviewIssue {
  /** Stable id, e.g. `hardcoded-secret`, `no-test-coverage`. */
  id: string
  dimension: PrReviewDimension
  severity: PrReviewSeverity
  priority: PrReviewPriority
  /** Relative path of the file involved. */
  file: string
  /** 1-based line in the new file (0 when file-level, e.g. missing coverage). */
  line: number
  message: string
  suggestion: string
}

/** One row of the scorecard table in the comment. */
export interface PrCheckResult {
  dimension: PrReviewDimension
  label: string
  /** fail = any error, warn = warnings/info only, pass = clean. */
  status: 'pass' | 'warn' | 'fail'
  issueCount: number
}

/** One changed file from the parsed diff. */
export interface PrChangedFile {
  path: string
  additions: number
  deletions: number
  /** Added lines with their new-file line numbers (for attribution). */
  addedLines: Array<{ line: number; text: string }>
}

export interface PrReviewReport {
  scannedAt: number
  root: string
  /** Where the diff came from: `--diff`, `--diff-file`, `gh`, `git`, `none`. */
  source: string
  /** PR number when known (explicit or detected via gh). */
  number: number | null
  /** PR title when detectable. */
  title: string | null
  /** Base ref the diff was computed against. */
  base: string | null
  changedFiles: string[]
  additions: number
  deletions: number
  checks: PrCheckResult[]
  issues: PrReviewIssue[]
  /** Last known overall Health Score (base branch), when available. */
  baseScore: number | null
  /** baseScore minus the deterministic penalty of PR-introduced findings. */
  projectedScore: number | null
  verdict: PrReviewVerdict
  /** True when --comment posted (or upserted) the review on the PR. */
  commentPosted: boolean
}

export interface PrReviewOptions {
  /** Raw unified diff text (offline / hermetic). */
  diff?: string
  /** Path to a file containing a unified diff. */
  diffFile?: string
  /** PR number (explicit). */
  number?: number
  /** Base ref for the git fallback diff (default origin/main). */
  base?: string
}
