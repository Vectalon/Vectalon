/**
 * vectalon gh-sec — GitHub Security Posture Agent (Roadmap Phase 11,
 * item 093) — Business Source License 1.1 (BSL-1.1)
 *
 * One deterministic snapshot of the GitHub security surface: dependabot
 * alerts, secret-scanning alerts, branch protection, and review
 * enforcement. No model calls.
 */

export type GhSecVerdict = 'approved' | 'needs-attention' | 'changes-requested'

export interface GhSecFinding {
  id: string
  severity: 'warning' | 'info'
  surface: string
  message: string
  suggestion: string
}

export interface GhSecReport {
  scannedAt: number
  root: string
  source: 'gh-api' | 'export-file' | 'none'
  dependabot: { open: number; critical: number; high: number; medium: number }
  secretScanning: { open: number }
  branchProtection: { enabled: boolean; requiresReviews: boolean; requiredReviewers: number }
  findings: GhSecFinding[]
  verdict: GhSecVerdict
}
