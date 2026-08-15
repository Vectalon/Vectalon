/**
 * vectalon evals — Model Evaluation Harness (Roadmap Phase 11, item 095)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Scores model outputs against golden references deterministically —
 * exact, includes, or regex matching — with a regression comparison
 * against the previous run. No model calls in the harness itself.
 */

export type EvalMode = 'exact' | 'includes' | 'regex'

export type EvalVerdict = 'approved' | 'needs-attention' | 'changes-requested'

export interface EvalCase {
  id: string
  input: string
  expected: string
  actual: string
  mode?: EvalMode
}

export interface EvalResult {
  id: string
  mode: EvalMode
  passed: boolean
  note: string
}

export interface EvalRegression {
  previousPassRate: number | null
  delta: number | null
}

export interface EvalReport {
  scannedAt: number
  root: string
  source: string
  cases: EvalResult[]
  passed: number
  failed: number
  passRate: number
  regression: EvalRegression
  findings: Array<{ id: string; severity: 'warning' | 'info'; message: string; suggestion: string }>
  verdict: EvalVerdict
}
