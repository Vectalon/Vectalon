/**
 * vectalon arch — Architecture Review Agent (Roadmap Phase 8, item 062)
 * Business Source License 1.1 (BSL-1.1)
 */

export type ArchSeverity = 'error' | 'warning' | 'info'
export type ArchCategory = 'structure' | 'layering' | 'coupling'
export type ArchVerdict = 'approved' | 'needs-attention' | 'changes-requested'

/** One deterministic architecture finding. */
export interface ArchFinding {
  /** Stable id, e.g. `circular-dependency`. */
  id: string
  category: ArchCategory
  severity: ArchSeverity
  /** Top-level module dir under src ('' for files directly in src root). */
  module: string
  /** Relative path, or the affected chain for module-level findings. */
  file: string
  message: string
  suggestion: string
}

/** Per-module coupling metrics — the architecture overview table. */
export interface ArchModule {
  /** Top-level dir under src, e.g. `screens`. */
  path: string
  /** Number of source files in the module. */
  files: number
  /** Distinct sibling modules importing into this one. */
  fanIn: number
  /** Distinct sibling modules this one imports from. */
  fanOut: number
  /** Distinct external packages imported across the module. */
  externalPackages: string[]
}

export interface ArchSummary {
  total: number
  bySeverity: Record<ArchSeverity, number>
  byCategory: Record<ArchCategory, number>
  /** Best-3 suggestions to act on first (severity-ranked, deduped). */
  topRecommendations: string[]
}

export interface ArchReport {
  scannedAt: number
  root: string
  /** Source dir analyzed (default `src`). */
  srcDir: string
  /** Number of source files in the graph. */
  fileCount: number
  modules: ArchModule[]
  findings: ArchFinding[]
  summary: ArchSummary
  verdict: ArchVerdict
}

export interface ArchOptions {
  /** Source dir relative to root (default `src`). */
  srcDir?: string
  /** Internal dependencies that make a file a god module (default 12). */
  maxFanout?: number
  /** Module fan-out that flags over-coupling (default 8). */
  maxModuleFanout?: number
  /** Dependents that flag a wide blast radius (default 10). */
  maxFanIn?: number
  /** Line count that flags an oversized file (default 600). */
  maxLines?: number
  /** Directory levels under src that flag deep nesting (default 5). */
  maxDepth?: number
}
