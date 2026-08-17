/**
 * vc score — Vectalon Engineering Health Score.
 * Business Source License 1.1 (BSL-1.1)
 *
 * One number an engineering manager immediately understands: an overall
 * 0-100 health score aggregated from eight deterministic dimensions —
 * Architecture, Dependencies, Build Health, Testing, Performance, Security,
 * Accessibility, and RN Upgrade Risk — each scored from the committed
 * scanners (arch-score, deps, fix's native-config reads, perf-scan,
 * security, a11y, upgrade impact). Every dimension consumes the shared
 * Project Intelligence model (readProjectIntel) as its foundation rather
 * than rediscovering the repository.
 */

export type ScorePriority = 'P0' | 'P1' | 'P2'

export type ScoreVerdict = 'excellent' | 'good' | 'fair' | 'poor'

/** One problem found by a dimension (drives the score down + the actions). */
export interface ScoreFinding {
  /** Stable id, e.g. `dep-cycle`. */
  id: string
  /** The dimension this belongs to. */
  dimension: string
  /** Severity → P0/P1/P2 priority. */
  severity: 'error' | 'warning' | 'info'
  /** Relative path of the file involved ('' when project-level). */
  file: string
  /** Human message, e.g. `Circular dependency between A and B`. */
  message: string
  /** The concrete action. */
  action: string
}

/** One scored dimension with its evidence trail. */
export interface ScoreDimension {
  id: string
  label: string
  /** 0-100. */
  score: number
  /** Weight in the overall aggregation (sums to 1). */
  weight: number
  /** One-line why (the score in words). */
  detail: string
  /** Problems that pulled this dimension down. */
  findings: ScoreFinding[]
  /** The evidence the score came from (counts, file:line pins). */
  evidence: string[]
}

/** A previous run, for the delta ("↓ 8 points this week"). */
export interface ScoreHistoryEntry {
  scoredAt: string
  overall: number
  /** Finding ids (dimension:id:file) present in that run. */
  findingIds: string[]
  /** Per-dimension scores (dimension id → 0-100), for the trend deltas. */
  dimensions?: Record<string, number>
}

/** One point on the overall trend series (history + the current run). */
export interface ScoreTrendPoint {
  scoredAt: string
  overall: number
}

/** How one dimension moved vs the previous run. */
export interface ScoreDimensionDelta {
  id: string
  label: string
  delta: number
}

export interface ScoreHistory {
  entries: ScoreHistoryEntry[]
}

export interface ScoreRecommendation {
  priority: ScorePriority
  dimension: string
  message: string
  action: string
}

export interface ScoreReport {
  scoredAt: number
  root: string
  overall: number
  grade: string
  verdict: ScoreVerdict
  /** Delta vs the previous run (null on first run). */
  delta: number | null
  /** Finding ids newly present vs the previous run. */
  newProblems: ScoreFinding[]
  dimensions: ScoreDimension[]
  recommendations: ScoreRecommendation[]
  /** Where the previous-run comparison came from. */
  historyNote: string
  /** Overall series — the last 12 runs including this one ("make it change over time"). */
  trend: ScoreTrendPoint[]
  /** Per-dimension movement vs the previous run ("+6 Architecture"). */
  dimensionDeltas: ScoreDimensionDelta[]
  /** Overall movement vs the first run of the current calendar month (null when none). */
  monthDelta: number | null
  /** Where the month-over-month comparison came from. */
  monthNote: string
}

export interface ScoreOptions {
  /** Skip the npm audit pass inside deps/security (default: true — offline). */
  skipAudit?: boolean
  /** Injectable audit runner for hermetic tests (matches deps + security). */
  auditRunner?: (root: string) => Promise<{ ran: boolean; skippedReason?: string; total: number; critical: number; high: number; moderate: number; low: number;  vulnerabilities: { package: string; severity: 'critical' | 'high' | 'moderate' | 'low' | 'info'; isDirect: boolean; advisoryCount: number }[] } | null>
  /** Audit timeout (default 90s). */
  auditTimeoutMs?: number
}
