/**
 * vc fix — the "Fix my React Native issue" killer workflow.
 * Business Source License 1.1 (BSL-1.1)
 *
 * A developer runs `vc fix "<issue>"` (or `vc fix --log build.log`) and gets
 * the full loop: understand → diagnose → root cause → explain → propose →
 * modify → verify → show what changed, as one structured verdict.
 */

export type FixSource = 'log' | 'issue' | 'project'
export type FixSeverity = 'error' | 'warning' | 'info'
export type FixStatus = 'applied' | 'manual' | 'no-change'
export type FixVerdict = 'approved' | 'needs-attention' | 'changes-requested'

/** One piece of proof — a file:line (or log line) that pins the root cause. */
export interface FixEvidence {
  /** Relative path (android/build.gradle) or 'log' for a build-log line. */
  file: string
  line?: number
  detail: string
}

/**
 * One deterministic file edit. `op` describes the change; `from`/`to` carry
 * the exact text so application is a literal replace (never a regex guess).
 */
export interface FixEdit {
  file: string
  op: 'replace' | 'insert-after'
  /** The exact existing text to replace (replace) or insert after (insert-after). */
  from: string
  to: string
  summary: string
}

export interface FixVerification {
  name: 'TypeScript' | 'Jest' | 'Gradle'
  status: 'pass' | 'fail' | 'skipped'
  detail: string
}

export interface FixFinding {
  id: string
  severity: FixSeverity
  /** The single root cause of the report (its evidence becomes the verdict). */
  rootCause: boolean
  title: string
  message: string
  recommendedFix: string
  evidence: FixEvidence[]
  /** Affected packages / files (the "impact" line). */
  impact: string[]
  /** The deterministic edit that implements the recommended fix, if any. */
  edit?: FixEdit
  applied: FixStatus
  confidence: number
}

export interface FixReport {
  scannedAt: number
  root: string
  issue?: string
  logPath?: string
  kind: 'gradle' | 'xcode' | 'metro' | 'ts' | 'deps' | 'general'
  verdict: FixVerdict
  findings: FixFinding[]
  edits: FixEdit[]
  /** Unified diff of applied edits vs the original tree (sandbox or real). */
  diff: string
  verification: FixVerification[]
  confidence: number
  /** True when edits were written to the real tree (--apply). */
  appliedToTree: boolean
}

export interface FixOptions {
  /** The developer's natural-language issue, e.g. "Android build started failing after upgrading RN". */
  issue?: string
  /** A failing Metro/Gradle/Xcode build log. */
  log?: string
  /** Write edits to the real tree (default: apply in a sandbox copy + show the diff). */
  apply?: boolean
  /** Allow --apply on a dirty git tree. */
  force?: boolean
  /** Injectable command runner (tests stub this so no real builds run). */
  run?: (command: string, args: string[], options: { cwd: string; timeout?: number }) => Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number }>
}
