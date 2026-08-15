/**
 * vectalon incident — Incident Commander Agent (Roadmap Phase 11, item 097)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Turns a crash log (or the latest crash report) into an incident brief:
 * root cause via the shared analyzer, hot files with recent commits, and
 * the current release risk. Deterministic — no model calls.
 */

export type IncidentVerdict = 'approved' | 'needs-attention' | 'changes-requested'

export interface IncidentHotFile {
  file: string
  recentCommits: string[]
}

export interface IncidentReport {
  scannedAt: number
  root: string
  source: string
  platform: string
  exceptionType?: string
  message?: string
  rootCause: string
  probableCause: string
  severity: 'error' | 'warning' | 'info'
  hotFiles: IncidentHotFile[]
  releaseRisk: { score: number; risk: string } | null
  nextSteps: string[]
  verdict: IncidentVerdict
}
