/**
 * vectalon gh-issue — GitHub Issue Intelligence Agent (Roadmap Phase 11,
 * item 091) — Business Source License 1.1 (BSL-1.1)
 *
 * Turns the open-issue backlog into a triage signal: staleness,
 * unassigned triage gaps, label hygiene, and open-issue velocity.
 * Deterministic — no model calls.
 */

export type GhIssueVerdict = 'approved' | 'needs-attention' | 'changes-requested'

export interface GhIssueEntry {
  number: number
  title: string
  author: string
  createdAt: string
  updatedAt: string
  ageDays: number
  labels: string[]
  assignees: string[]
  verdict: GhIssueVerdict
}

export interface GhIssueFinding {
  id: string
  severity: 'warning' | 'info'
  issue: number
  message: string
  suggestion: string
}

export interface GhIssueSummary {
  total: number
  triaged: number
  unassigned: number
  stale: number
  oldestDays: number
}

export interface GhIssueReport {
  scannedAt: number
  root: string
  source: 'gh-cli' | 'export-file' | 'none'
  issues: GhIssueEntry[]
  findings: GhIssueFinding[]
  summary: GhIssueSummary
  verdict: GhIssueVerdict
}
