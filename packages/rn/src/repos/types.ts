/**
 * vectalon repos — Multi-repository Memory Agent (Roadmap Phase 10, item 085)
 * Business Source License 1.1 (BSL-1.1)
 *
 * Verifies the workspace manifest (`.vectalon/repos.json`) against the local
 * filesystem: each listed sibling repo must be reachable, be a git checkout,
 * and carry a `.vectalon/` memory store. Deterministic — no model calls.
 */

export interface RepoCheck {
  id: string
  name: string
  path: string
  resolved: string
  status: 'ok' | 'missing' | 'not-git' | 'no-memory'
  evidence: string
  detail?: string
}

export interface RepoFinding {
  id: 'no-manifest' | 'empty-manifest' | 'missing-repo' | 'not-git' | 'no-memory'
  severity: 'warning' | 'info'
  repo?: string
  message: string
  suggestion: string
}

export interface RepoReport {
  scannedAt: number
  root: string
  manifestFile?: string
  repoCount: number
  checks: RepoCheck[]
  findings: RepoFinding[]
  verdict: 'approved' | 'needs-attention' | 'changes-requested'
  summary: { total: number; bySeverity: Record<string, number> }
}
