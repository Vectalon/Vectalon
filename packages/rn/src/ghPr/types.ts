/**
 * vectalon gh-pr — GitHub PR Triage Agent (Roadmap Phase 11, item 090)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Deterministic PR merge-readiness: age, draft state, size, review
 * decision, CI rollup, and mergeability — from `gh pr list --json` or a
 * `--file` export. No model calls.
 */

export type GhPrVerdict = 'approved' | 'needs-attention' | 'changes-requested'

export interface GhPrEntry {
  number: number
  title: string
  author: string
  createdAt: string
  updatedAt: string
  ageDays: number
  additions: number
  deletions: number
  sizeLines: number
  isDraft: boolean
  reviewDecision: string | null
  mergeable: string | null
  /** Rolled-up CI state for the PR's latest checks. */
  ciState: 'passing' | 'failing' | 'pending' | 'none'
  /** Names of the failed/timed-out checks (empty when none). */
  ciFailures: string[]
  verdict: GhPrVerdict
}

export interface GhPrFinding {
  id: string
  severity: 'warning' | 'info'
  pr: number
  message: string
  suggestion: string
}

export interface GhPrSummary {
  total: number
  healthy: number
  attention: number
  blockers: number
  avgAgeDays: number
  oldestDays: number
}

export interface GhPrReport {
  scannedAt: number
  root: string
  /** Where the PR data came from. */
  source: 'gh-cli' | 'export-file' | 'none'
  prs: GhPrEntry[]
  findings: GhPrFinding[]
  summary: GhPrSummary
  verdict: GhPrVerdict
}
