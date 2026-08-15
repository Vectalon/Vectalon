/**
 * vectalon train — Release Train Automation (Roadmap Phase 11, item 098)
 * Business Source License 1.1 (BSL-1.1)
 *
 * A read-only release-train dry-run across the workspace: for every repo
 * member it checks version vs last tag, changelog section, and a clean
 * tree, then suggests the bump. Refuses to write anything. No model calls.
 */

export type TrainVerdict = 'approved' | 'needs-attention' | 'changes-requested'

export interface TrainRepo {
  name: string
  path: string
  version: string | null
  lastTag: string | null
  changelogSection: boolean
  dirty: boolean
  suggestedBump: 'major' | 'minor' | 'patch' | 'none' | 'unknown'
  checks: Array<{ id: string; severity: 'warning' | 'info'; message: string; fix: string }>
}

export interface TrainReport {
  scannedAt: number
  root: string
  repos: TrainRepo[]
  findings: Array<{ id: string; severity: 'warning' | 'info'; repo: string; message: string; suggestion: string }>
  verdict: TrainVerdict
}
