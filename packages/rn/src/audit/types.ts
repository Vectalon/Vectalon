/**
 * vectalon audit — Org-wide Audit Trail Agent (Roadmap Phase 10, item 084)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Validates an org-wide JSONL audit trail (`.vectalon/audit/*.jsonl`):
 * required fields, sequence continuity, and secret hygiene — and summarizes
 * activity by actor and action. Deterministic — no model calls.
 */

export interface AuditEntry {
  seq?: number
  timestamp?: number
  actor?: string
  action: string
  target?: string
  outcome?: string
  details?: Record<string, unknown>
  source?: string
  /** Source line in the .jsonl file (filled by the parser). */
  line: number
}

export interface AuditFinding {
  id: 'no-trail' | 'malformed-entry' | 'missing-seq' | 'trail-gap' | 'secret-in-trail'
  severity: 'warning' | 'info'
  seq?: number
  line?: number
  message: string
  suggestion: string
}

export interface AuditSummary {
  entries: number
  files: number
  actors: Array<{ actor: string; count: number }>
  actions: Array<{ action: string; count: number }>
  outcomes: Record<string, number>
}

export interface AuditReport {
  scannedAt: number
  root: string
  summary: AuditSummary
  findings: AuditFinding[]
  verdict: 'approved' | 'needs-attention' | 'changes-requested'
  total: { total: number; bySeverity: Record<string, number> }
}
