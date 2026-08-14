/**
 * vectalon perf — static render-performance scan (Roadmap Phase 4)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Deterministic source analysis (no model calls, no device): re-render
 * hazards, startup hot paths, and bridge-traffic smells. Complements the
 * runtime `vectalon profile` command (which reads Hermes .cpuprofile / heap
 * snapshots) and `vectalon bundle` / `vectalon bench` — the static half of
 * Phase 4 (items 021-023, 027, 029).
 */

/** Roadmap item each finding maps back to. */
export type PerfRoadmapItem = '021' | '022' | '023' | '027' | '029'

export type PerfScanCategory = 'render' | 'startup' | 'bridge'

export type PerfSeverity = 'error' | 'warning' | 'info'

/** One actionable static-performance finding. */
export interface PerfScanFinding {
  /** Stable id, e.g. `inline-arrow-prop`. */
  id: string
  category: PerfScanCategory
  severity: PerfSeverity
  /** Roadmap item this finding delivers. */
  roadmap: PerfRoadmapItem
  /** Source file (relative to the project root). */
  file: string
  /** 1-based line. */
  line: number
  /** Component / prop / import involved. */
  target: string
  /** Compact metric, e.g. `3 inline handlers`, `moment at module scope`. */
  metric: string
  message: string
  suggestion: string
}

/** Category + roadmap rollup for the summary lines. */
export interface PerfScanSummary {
  total: number
  byCategory: Record<PerfScanCategory, number>
  bySeverity: Record<PerfSeverity, number>
  /** Best-3 suggestions to act on first (severity-ranked, deduped). */
  topRecommendations: string[]
}

export interface PerfScanReport {
  scannedAt: number
  /** Project root the scan ran against. */
  root: string
  /** Number of source files walked. */
  fileCount: number
  findings: PerfScanFinding[]
  summary: PerfScanSummary
}
