/**
 * vectalon bug-fix — Autonomous Bug Fix Agent (Roadmap Phase 8, item 070)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Proposes fixes for deterministically-detectable defects and executes the
 * provably-safe ones. Every finding carries a precise edit; only a small
 * whitelist of mechanical transforms may be applied (--apply), everything
 * else is proposed for a human. Dry-run by default.
 */

/** Kinds the agent can detect and (for some) fix. */
export type FixKind =
  | 'unused-import'
  | 'unused-variable'
  | 'var-to-const'
  | 'loose-equality'
  | 'missing-semicolon'

export type FixSeverity = 'error' | 'warning' | 'info'

/** A precise source edit: replace `old` with `new` in file (first match). */
export interface FixEdit {
  old: string
  new: string
  /** Replace every occurrence (only for kinds proven idempotent). */
  global?: boolean
}

export interface FixFinding {
  id: FixKind
  severity: FixSeverity
  file: string
  line: number
  target: string
  message: string
  suggestion: string
  /** Whether --apply may touch this finding. */
  fixable: boolean
  edit?: FixEdit
}

export interface BugFixOptions {
  /** Apply the safe whitelist of fixes (dry-run / patch plan otherwise). */
  apply?: boolean
  /** Allow --apply on a dirty git working tree (revert safety relies on git). */
  force?: boolean
}

export interface BugFixReport {
  scannedAt: number
  root: string
  findings: FixFinding[]
  /** Edits actually written by --apply. */
  applied: { file: string; line: number; kind: FixKind }[]
  /** Fixable findings skipped because the tree was dirty (no --force). */
  refused: number
  verdict: 'approved' | 'needs-attention' | 'changes-requested'
  summary: { total: number; fixable: number; applied: number; byKind: Record<string, number> }
}
