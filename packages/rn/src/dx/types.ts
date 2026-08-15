/**
 * vectalon dx — DX Scoring Agent (Roadmap Phase 11, item 100)
 * Business Source License 1.1 (BSL-1.1)
 *
 * One developer-experience score (0-100) for the repo, from local
 * evidence: docs, CI, tests, lint, types, onboarding, and complexity.
 * Deterministic — no model calls.
 */

export type DxVerdict = 'approved' | 'needs-attention' | 'changes-requested'

export interface DxAxis {
  id: string
  label: string
  score: number
  weight: number
  note: string
}

export interface DxReport {
  scannedAt: number
  root: string
  axes: DxAxis[]
  score: number
  grade: 'A' | 'B' | 'C' | 'D'
  improvements: Array<{ id: string; label: string; gain: number; action: string }>
  verdict: DxVerdict
}
