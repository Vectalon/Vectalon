/**
 * vectalon cicd — CI/CD Intelligence Agent (Roadmap Phase 9, item 073)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Reads CI workflow definitions (GitHub Actions YAML first, other CI files
 * detected) and flags anti-patterns: unpinned third-party actions, missing
 * concurrency/timeouts, secrets in inline env, deploy steps without a test
 * gate, and missing workflow_dispatch. Deterministic, line-pinned.
 */

export interface CiFinding {
  id: string
  severity: 'error' | 'warning' | 'info'
  file: string
  line: number
  message: string
  suggestion: string
}

export interface CiReport {
  scannedAt: number
  root: string
  ciSystems: string[]
  files: string[]
  findings: CiFinding[]
  verdict: 'approved' | 'needs-attention' | 'changes-requested'
  summary: { total: number; bySeverity: Record<string, number> }
}
