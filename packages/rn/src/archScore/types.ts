/**
 * vectalon arch-score — Mobile Architecture Scorecard (Roadmap Phase 9,
 * item 072) — Business Source License 1.1 (BSL-1.1)
 *
 * A deterministic 0-100 architecture score across six dimensions computed
 * from the module graph (reusing buildCodeGraph): cycles, layering,
 * coupling, module size, testability, and nesting depth.
 */

export interface ScoreDimension {
  id: string
  label: string
  score: number
  weight: number
  detail: string
}

export interface ArchScoreReport {
  scoredAt: number
  root: string
  dimensions: ScoreDimension[]
  total: number
  grade: string
  verdict: 'approved' | 'needs-attention' | 'changes-requested'
  topImprovements: string[]
}

export interface ArchScoreOptions {
  /** Source directory to score (default: src). */
  srcDir?: string
}
