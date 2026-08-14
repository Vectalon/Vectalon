/**
 * vectalon team-stats — Team Productivity Analytics (Roadmap Phase 9,
 * item 077) — Business Source License 1.1 (BSL-1.1)
 *
 * Deterministic git-history analytics: commit cadence, author
 * distribution, bus factor, category mix, and change velocity. Read-only
 * git (a single `git log` invocation), reusing the shared
 * GitHistoryDeriver for categorization.
 */

export interface AuthorStat {
  author: string
  commits: number
  share: number
}

export interface TeamStatFinding {
  id: string
  severity: 'warning' | 'info'
  message: string
  suggestion: string
}

export interface TeamStatsReport {
  scannedAt: number
  root: string
  totalCommits: number
  authors: AuthorStat[]
  busFactor: number
  cadencePerDay: number
  spanDays: number
  breaking: number
  categories: Record<string, number>
  findings: TeamStatFinding[]
  verdict: 'approved' | 'needs-attention' | 'changes-requested'
}
