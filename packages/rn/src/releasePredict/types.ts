/**
 * vectalon release-predict — Release Prediction Agent (Roadmap Phase 10,
 * item 086) — Business Source License 1.1 (BSL-1.1)
 *
 * Derives a deterministic release-risk score (0–100) from read-only git
 * history: fix density, churn, staleness, breaking changes, and author
 * breadth in a configurable release window. No model calls.
 */

export type ReleaseRisk = 'low' | 'moderate' | 'high' | 'critical'

export interface PredictFactor {
  name: string
  value: number
  weight: number
  goodDirection: 'lower' | 'higher'
  rationale: string
}

export interface PredictFinding {
  id: 'release-risk' | 'fix-density' | 'no-window-commits' | 'no-git'
  severity: 'warning' | 'info'
  message: string
  suggestion: string
}

export interface ReleasePredictionReport {
  scannedAt: number
  root: string
  score: number
  risk: ReleaseRisk
  riskDescription: string
  windowDays: number
  windowCommits: number
  totalCommits: number
  factors: PredictFactor[]
  findings: PredictFinding[]
  verdict: 'approved' | 'needs-attention' | 'changes-requested'
}
