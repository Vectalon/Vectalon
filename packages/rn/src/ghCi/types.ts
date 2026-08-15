/**
 * vectalon gh-ci — GitHub Workflow Reliability Agent (Roadmap Phase 11,
 * item 092) — Business Source License 1.1 (BSL-1.1)
 *
 * Detects flaky and slow CI from workflow-run history before it costs a
 * release. Deterministic — no model calls.
 */

export type GhCiVerdict = 'approved' | 'needs-attention' | 'changes-requested'

export interface GhCiWorkflow {
  name: string
  runs: number
  passed: number
  failed: number
  flakeCount: number
  avgDurationSec: number
  failureRate: number
  flaky: boolean
}

export interface GhCiFinding {
  id: string
  severity: 'warning' | 'info'
  workflow: string
  message: string
  suggestion: string
}

export interface GhCiSummary {
  workflows: number
  runs: number
  failingWorkflows: number
  flakyWorkflows: number
  avgDurationSec: number
}

export interface GhCiReport {
  scannedAt: number
  root: string
  source: 'gh-cli' | 'export-file' | 'none'
  workflows: GhCiWorkflow[]
  findings: GhCiFinding[]
  summary: GhCiSummary
  verdict: GhCiVerdict
}
