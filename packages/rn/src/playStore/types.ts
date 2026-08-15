/**
 * vectalon play-store — Deep Play Store Readiness Agent (Roadmap Phase 10,
 * item 087) — Business Source License 1.1 (BSL-1.1)
 *
 * Deep Play-specific readiness: manifest permissions and data-safety
 * implications, exported components, backup rules, cleartext posture, SDK
 * target/compile/min levels, signing, and store-listing assets (icon,
 * feature graphic, screenshots, listing text). Deterministic — no model
 * calls.
 */

export interface PlayStoreCheck {
  id: string
  label: string
  status: 'pass' | 'warn' | 'fail' | 'info'
  message: string
  suggestion: string
}

export interface PlayFinding {
  id: string
  severity: 'error' | 'warning' | 'info'
  message: string
  suggestion: string
}

export interface PlayReport {
  scannedAt: number
  root: string
  checks: PlayStoreCheck[]
  findings: PlayFinding[]
  verdict: 'approved' | 'needs-attention' | 'changes-requested'
  summary: { total: number; bySeverity: Record<string, number> }
}
